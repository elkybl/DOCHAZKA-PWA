import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getBearer, json } from "@/lib/http";
import { verifySession } from "@/lib/auth";

const TZ = "Europe/Prague";

function toNum(v: any, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}
function round2(n: number) {
  return Math.round(n * 100) / 100;
}
function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function dayKeyPrague(iso: string) {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const obj: any = {};
  for (const p of parts) obj[p.type] = p.value;
  return `${obj.year}-${obj.month}-${obj.day}`;
}

// nearest 30 min (00–14 -> :00, 15–44 -> :30, 45–59 -> next hour)
function roundTo30Prague(iso: string) {
  const d = new Date(iso);

  const hmParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(d);

  const hm: any = {};
  for (const p of hmParts) hm[p.type] = p.value;

  let hh = Number(hm.hour);
  let mm = Number(hm.minute);

  if (mm < 15) mm = 0;
  else if (mm < 45) mm = 30;
  else {
    mm = 0;
    hh += 1;
    if (hh === 24) hh = 0;
  }

  const dayParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);

  const day: any = {};
  for (const p of dayParts) day[p.type] = p.value;

  const localStr = `${day.year}-${day.month}-${day.day}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00`;
  return new Date(localStr);
}

type Ev = {
  id: string;
  user_id: string;
  site_id: string | null;
  type: "IN" | "OUT" | "OFFSITE";
  server_time: string;

  note_work: string | null;
  km: number | null;

  offsite_reason: string | null;
  offsite_hours: number | null;

  material_desc: string | null;
  material_amount: number | null;
};

export async function GET(req: NextRequest) {
  const token = getBearer(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return json({ error: "Nepřihlášen." }, { status: 401 });
  if (session.role !== "admin") return json({ error: "Jen admin." }, { status: 403 });

  const url = new URL(req.url);

  const userId = url.searchParams.get("user_id")?.trim() || "";
  if (!userId) return json({ error: "Chybí user_id." }, { status: 400 });

  const from = url.searchParams.get("from")?.trim() || "";
  const to = url.searchParams.get("to")?.trim() || "";

  // from/to in YYYY-MM-DD; if missing, default last 30 days
  const toDate = to ? new Date(`${to}T23:59:59.999Z`) : new Date();
  const fromDate = from ? new Date(`${from}T00:00:00.000Z`) : new Date(Date.now() - 30 * 86400000);

  const fromIso = fromDate.toISOString();
  const toIso = toDate.toISOString();

  const db = supabaseAdmin();

  const { data: u, error: uErr } = await db.from("users").select("id,name,hourly_rate,km_rate").eq("id", userId).single();
  if (uErr || !u) return json({ error: "Uživatel nenalezen." }, { status: 404 });

  const defaultHourly = toNum((u as any).hourly_rate, 0);
  const defaultKm = toNum((u as any).km_rate, 0);

  const { data: usrSiteRates } = await db
    .from("user_site_rates")
    .select("site_id,hourly_rate,km_rate")
    .eq("user_id", userId);

  const rateMap = new Map<string, { hourly: number; km: number }>();
  for (const r of usrSiteRates || []) {
    rateMap.set(String((r as any).site_id), { hourly: toNum((r as any).hourly_rate, 0), km: toNum((r as any).km_rate, 0) });
  }

  const { data: sites } = await db.from("sites").select("id,name");
  const siteName = new Map<string, string>();
  for (const s of sites || []) siteName.set((s as any).id, (s as any).name);

  const getRate = (site_id: string | null) => {
    if (site_id) {
      const r = rateMap.get(site_id);
      if (r) return { ...r, source: "site" as const };
    }
    return { hourly: defaultHourly, km: defaultKm, source: "default" as const };
  };

  const { data: evs, error: evErr } = await db
    .from("attendance_events")
    .select("id,user_id,site_id,type,server_time,note_work,km,offsite_reason,offsite_hours,material_desc,material_amount")
    .eq("user_id", userId)
    .gte("server_time", fromIso)
    .lte("server_time", toIso)
    .order("server_time", { ascending: true });

  if (evErr) return json({ error: "DB chyba (events)." }, { status: 500 });
  const events = (evs || []) as Ev[];

  const { data: trips } = await db
    .from("trips")
    .select("id,start_time,km_final")
    .eq("user_id", userId)
    .gte("start_time", fromIso)
    .lte("start_time", toIso);

  const tripKmByDay = new Map<string, number>();
  for (const t of (trips || []) as any[]) {
    const day = dayKeyPrague(t.start_time);
    tripKmByDay.set(day, (tripKmByDay.get(day) || 0) + toNum(t.km_final, 0));
  }

  // group events by day in Prague
  const byDay = new Map<string, Ev[]>();
  for (const e of events) {
    const day = dayKeyPrague(e.server_time);
    byDay.set(day, [...(byDay.get(day) || []), e]);
  }

  type SiteBucket = {
    site_id: string;
    site_name: string;
    totals: {
      hours_rounded_30: number;
      labor_amount: number;
      km: number;
      travel_amount: number;
      material_amount: number;
      offsite_hours: number;
      offsite_amount: number;
      total: number;
    };
    days: Array<{
      day: string;
      segments: Array<{
        in_raw: string;
        out_raw: string;
        in_rounded: string;
        out_rounded: string;
        hours_rounded: number;
        hourly_rate: number;
        note_work: string | null;
      }>;
      offsite: Array<{ reason: string; hours: number; hourly_rate: number; amount: number }>;
      km: number;
      km_rate: number;
      km_amount: number;
      material: Array<{ desc: string; amount: number }>;
      material_amount: number;
      day_total: number;
    }>;
  };

  const buckets = new Map<string, SiteBucket>();
  const ensureBucket = (site_id: string | null) => {
    const id = site_id || "UNASSIGNED";
    const name = site_id ? siteName.get(site_id) || site_id : "Nezařazeno";
    const key = id;
    if (!buckets.has(key)) {
      buckets.set(key, {
        site_id: id,
        site_name: name,
        totals: {
          hours_rounded_30: 0,
          labor_amount: 0,
          km: 0,
          travel_amount: 0,
          material_amount: 0,
          offsite_hours: 0,
          offsite_amount: 0,
          total: 0,
        },
        days: [],
      });
    }
    return buckets.get(key)!;
  };

  // Build day objects per site
  for (const [day, listRaw] of byDay.entries()) {
    const list = [...listRaw].sort((a, b) => (a.server_time < b.server_time ? -1 : 1));

    let lastIn: { rawIso: string; rounded: Date; site_id: string | null } | null = null;

    // collect per-site day temp
    const perSite = new Map<string, {
      segs: any[];
      off: any[];
      km: number;
      km_rate: number;
      km_amount: number;
      material: any[];
      material_amount: number;
      day_total: number;
    }>();

    const addSite = (sid: string | null) => {
      const key = sid || "UNASSIGNED";
      if (!perSite.has(key)) {
        perSite.set(key, { segs: [], off: [], km: 0, km_rate: 0, km_amount: 0, material: [], material_amount: 0, day_total: 0 });
      }
      return perSite.get(key)!;
    };

    for (const e of list) {
      if (e.type === "IN") {
        lastIn = { rawIso: e.server_time, rounded: roundTo30Prague(e.server_time), site_id: e.site_id };
      } else if (e.type === "OUT" && lastIn) {
        const sid = (lastIn.site_id || e.site_id) as string | null;
        const outRounded = roundTo30Prague(e.server_time);

        const minutes = Math.max(0, Math.round((outRounded.getTime() - lastIn.rounded.getTime()) / 60000));
        const hours = minutes / 60;

        const r = getRate(sid);
        const amount = hours * r.hourly;

        const bucket = addSite(sid);
        bucket.segs.push({
          in_raw: lastIn.rawIso,
          out_raw: e.server_time,
          in_rounded: lastIn.rounded.toISOString(),
          out_rounded: outRounded.toISOString(),
          hours_rounded: round2(hours),
          hourly_rate: round2(r.hourly),
          note_work: e.note_work || null,
          amount: round2(amount),
        });
        bucket.day_total += amount;

        lastIn = null;
      } else if (e.type === "OFFSITE") {
        const sid = e.site_id || null;
        const h = toNum(e.offsite_hours, 0);
        if (h > 0) {
          const r = getRate(sid);
          const amount = h * r.hourly;
          const bucket = addSite(sid);
          bucket.off.push({
            reason: (e.offsite_reason || "").trim() || "Mimo stavbu",
            hours: round2(h),
            hourly_rate: round2(r.hourly),
            amount: round2(amount),
          });
          bucket.day_total += amount;
        }
      }

      // material belongs to the event's site_id if present; otherwise UNASSIGNED
      const matAmt = toNum(e.material_amount, 0);
      if (matAmt > 0) {
        const sid = e.site_id || null;
        const bucket = addSite(sid);
        bucket.material.push({ desc: (e.material_desc || "").trim() || "", amount: round2(matAmt) });
        bucket.material_amount += matAmt;
        bucket.day_total += matAmt;
      }

      // km: OUT km belongs to OUT event site_id (if missing -> UNASSIGNED)
      if (e.type === "OUT") {
        const k = toNum(e.km, 0);
        if (k > 0) {
          const sid = e.site_id || null;
          const r = getRate(sid);
          const bucket = addSite(sid);
          bucket.km += k;
          bucket.km_rate = round2(r.km);
          bucket.km_amount += k * r.km;
          bucket.day_total += k * r.km;
        }
      }
    }

    // if there are no manual km in any site for that day, put trips km into UNASSIGNED (cannot know site)
    const hasManualKm = [...perSite.values()].some((x) => x.km > 0);
    if (!hasManualKm) {
      const tripKm = toNum(tripKmByDay.get(day), 0);
      if (tripKm > 0) {
        const bucket = addSite(null);
        bucket.km += tripKm;
        bucket.km_rate = round2(defaultKm);
        bucket.km_amount += tripKm * defaultKm;
        bucket.day_total += tripKm * defaultKm;
      }
    }

    // push into global buckets
    for (const [sidKey, d] of perSite.entries()) {
      const actualSiteId = sidKey === "UNASSIGNED" ? null : sidKey;
      const b = ensureBucket(actualSiteId);

      const hours = d.segs.reduce((s, x) => s + (Number(x.hours_rounded) || 0), 0);
      const labor = d.segs.reduce((s, x) => s + (Number(x.amount) || 0), 0);
      const offH = d.off.reduce((s, x) => s + (Number(x.hours) || 0), 0);
      const offA = d.off.reduce((s, x) => s + (Number(x.amount) || 0), 0);

      b.totals.hours_rounded_30 += hours + offH;
      b.totals.labor_amount += labor + offA;
      b.totals.km += d.km;
      b.totals.travel_amount += d.km_amount;
      b.totals.material_amount += d.material_amount;
      b.totals.offsite_hours += offH;
      b.totals.offsite_amount += offA;
      b.totals.total += d.day_total;

      b.days.push({
        day,
        segments: d.segs.map((x) => ({
          in_raw: x.in_raw,
          out_raw: x.out_raw,
          in_rounded: x.in_rounded,
          out_rounded: x.out_rounded,
          hours_rounded: x.hours_rounded,
          hourly_rate: x.hourly_rate,
          note_work: x.note_work,
        })),
        offsite: d.off,
        km: round1(d.km),
        km_rate: round2(d.km_rate),
        km_amount: round2(d.km_amount),
        material: d.material,
        material_amount: round2(d.material_amount),
        day_total: round2(d.day_total),
      });
    }
  }

  const sitesOut = [...buckets.values()].map((b) => {
    b.totals.hours_rounded_30 = round2(b.totals.hours_rounded_30);
    b.totals.labor_amount = round2(b.totals.labor_amount);
    b.totals.km = round1(b.totals.km);
    b.totals.travel_amount = round2(b.totals.travel_amount);
    b.totals.material_amount = round2(b.totals.material_amount);
    b.totals.offsite_hours = round2(b.totals.offsite_hours);
    b.totals.offsite_amount = round2(b.totals.offsite_amount);
    b.totals.total = round2(b.totals.total);

    // sort days
    b.days.sort((a, c) => (a.day < c.day ? 1 : -1));
    return b;
  }).sort((a, b) => a.site_name.localeCompare(b.site_name));

  return json({
    range: { from: from || dayKeyPrague(fromIso), to: to || dayKeyPrague(toIso) },
    user: { id: u.id, name: (u as any).name || "", hourly_rate: defaultHourly, km_rate: defaultKm },
    note: "Časy jsou zaokrouhlené na 30 minut pro výpočet. Reálná data v DB se nemění. Km z knihy jízd se přiřazuje do Nezařazeno, pokud nejsou ruční km u odchodu.",
    sites: sitesOut,
  });
}
