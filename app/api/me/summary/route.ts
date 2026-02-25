import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getBearer, json } from "@/lib/http";
import { verifySession } from "@/lib/auth";
import { dayLocalCZFromIso, roundToHalfHourCZ } from "@/lib/time";

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

// yyyy-mm-dd v Europe/Prague
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

type Ev = {
  user_id: string;
  site_id: string | null;
  type: "IN" | "OUT" | "OFFSITE";
  server_time: string;
  day_local: string | null;

  note_work: string | null;
  km: number | null;

  offsite_reason: string | null;
  offsite_hours: number | null;

  material_desc: string | null;
  material_amount: number | null;

  is_paid: boolean;
};

export async function GET(req: NextRequest) {
  const token = getBearer(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return json({ error: "Nepřihlášen." }, { status: 401 });

  const url = new URL(req.url);
  const days = Math.min(180, Math.max(1, Number(url.searchParams.get("days") || "14")));

  const to = new Date();
  const from = new Date(Date.now() - days * 86400000);

  const fromIso = from.toISOString();
  const toIso = to.toISOString();

  const db = supabaseAdmin();
  const userId = (session as any).userId as string;

  // user + default sazby
  const { data: me, error: meErr } = await db
    .from("users")
    .select("id,name,role,hourly_rate,km_rate")
    .eq("id", userId)
    .single();
  if (meErr || !me) return json({ error: "Uživatel nenalezen." }, { status: 404 });

  const defaultHourly = toNum((me as any).hourly_rate, 0);
  const defaultKm = toNum((me as any).km_rate, 0);

  // sazby per user+site
  const { data: usrSiteRates } = await db
    .from("user_site_rates")
    .select("user_id,site_id,hourly_rate,km_rate")
    .eq("user_id", userId);

  const rateMap = new Map<string, { hourly: number; km: number }>();
  for (const r of usrSiteRates || []) {
    rateMap.set(`${(r as any).user_id}__${(r as any).site_id}`, {
      hourly: toNum((r as any).hourly_rate, 0),
      km: toNum((r as any).km_rate, 0),
    });
  }

  const getRate = (site_id: string | null) => {
    if (site_id) {
      const r = rateMap.get(`${userId}__${site_id}`);
      if (r) return { ...r, source: "site" as const };
    }
    return { hourly: defaultHourly, km: defaultKm, source: "default" as const };
  };

  // sites map
  const { data: sites } = await db.from("sites").select("id,name");
  const siteName = new Map<string, string>();
  for (const s of sites || []) siteName.set((s as any).id, (s as any).name);

  // attendance events
  const { data: evs, error: evErr } = await db
    .from("attendance_events")
    .select(
      "user_id,site_id,type,server_time,day_local,note_work,km,offsite_reason,offsite_hours,material_desc,material_amount,is_paid"
    )
    .eq("user_id", userId)
    .gte("server_time", fromIso)
    .lte("server_time", toIso)
    .order("server_time", { ascending: true });

  if (evErr) return json({ error: "DB chyba (events)." }, { status: 500 });
  const events = (evs || []) as Ev[];

  // trips (kniha jízd) -> km per day (user override first)
  const { data: trips, error: tErr } = await db
    .from("trips")
    .select("start_time,distance_km,distance_km_user")
    .eq("user_id", userId)
    .gte("start_time", fromIso)
    .lte("start_time", toIso);

  if (tErr) return json({ error: "DB chyba (trips)." }, { status: 500 });

  const tripKmByDay = new Map<string, number>();
  for (const t of (trips || []) as any[]) {
    const day = dayKeyPrague(t.start_time);
    const km = Number(t.distance_km_user ?? t.distance_km ?? 0);
    tripKmByDay.set(day, (tripKmByDay.get(day) || 0) + (Number.isFinite(km) ? km : 0));
  }

  // group by day (prefer day_local, fallback Prague day from server_time)
  const byDay = new Map<string, Ev[]>();
  for (const e of events) {
    const day = e.day_local || dayLocalCZFromIso(e.server_time);
    byDay.set(day, [...(byDay.get(day) || []), e]);
  }

  const rows: any[] = [];

  for (const [day, listRaw] of byDay.entries()) {
    const list = [...listRaw].sort((a, b) => (a.server_time < b.server_time ? -1 : 1));

    type Seg = {
      kind: "WORK";
      site_id: string | null;
      site_name: string | null;
      in_time: string;
      out_time: string;
      in_time_rounded: string;
      out_time_rounded: string;
      minutes: number;
      hours: number;
      hourly_rate: number;
      rate_source: "site" | "default";
      pay: number;
      note_work: string | null;
    };

    const segments: Seg[] = [];
    let lastIn: { t: Date; iso: string; site_id: string | null } | null = null;

    for (const e of list) {
      if (e.type === "IN") {
        lastIn = { t: new Date(e.server_time), iso: e.server_time, site_id: e.site_id };
      } else if (e.type === "OUT" && lastIn) {
        // ✅ rounding for PAY only (both IN and OUT), but keep raw iso too
        const inRounded = roundToHalfHourCZ(new Date(lastIn.iso));
        const outRounded = roundToHalfHourCZ(new Date(e.server_time));

        const minutes = Math.max(0, Math.round((outRounded.getTime() - inRounded.getTime()) / 60000));
        const hours = minutes / 60;

        const sid = (lastIn.site_id || e.site_id) as string | null;
        const r = getRate(sid);

        segments.push({
          kind: "WORK",
          site_id: sid,
          site_name: sid ? siteName.get(sid) || null : null,
          in_time: lastIn.iso,
          out_time: e.server_time,
          in_time_rounded: inRounded.toISOString(),
          out_time_rounded: outRounded.toISOString(),
          minutes,
          hours: round2(hours),
          hourly_rate: round2(r.hourly),
          rate_source: r.source,
          pay: round2(hours * r.hourly),
          note_work: e.note_work || null,
        });

        lastIn = null;
      }
    }

    type Off = {
      kind: "OFFSITE";
      site_id: string | null;
      site_name: string | null;
      reason: string;
      hours: number;
      hourly_rate: number;
      rate_source: "site" | "default";
      pay: number;
    };

    const offsites: Off[] = [];
    for (const e of list.filter((x) => x.type === "OFFSITE")) {
      const h = toNum(e.offsite_hours, 0);
      if (h <= 0) continue;
      const r = getRate(e.site_id || null);
      offsites.push({
        kind: "OFFSITE",
        site_id: e.site_id,
        site_name: e.site_id ? siteName.get(e.site_id) || null : null,
        reason: (e.offsite_reason || "").trim() || "Mimo stavbu",
        hours: round2(h),
        hourly_rate: round2(r.hourly),
        rate_source: r.source,
        pay: round2(h * r.hourly),
      });
    }

    const workHours = segments.reduce((s, x) => s + x.hours, 0);
    const workPay = segments.reduce((s, x) => s + x.pay, 0);
    const offHours = offsites.reduce((s, x) => s + x.hours, 0);
    const offPay = offsites.reduce((s, x) => s + x.pay, 0);

    const hours = round2(workHours + offHours);
    const hoursPay = round2(workPay + offPay);

    // km manual from OUT events (override). If none, use trips km.
    let kmManual = 0;
    let kmManualPay = 0;
    for (const o of list.filter((x) => x.type === "OUT")) {
      const k = toNum(o.km, 0);
      if (k <= 0) continue;
      kmManual += k;
      const r = getRate(o.site_id || null);
      kmManualPay += k * r.km;
    }

    let km = round1(kmManual);
    let kmPay = round2(kmManualPay);

    if (km <= 0) {
      const tripKm = toNum(tripKmByDay.get(day), 0);
      if (tripKm > 0) {
        km = round1(tripKm);
        kmPay = round2(tripKm * defaultKm);
      }
    }

    let material = 0;
    const materialNotes: string[] = [];
    for (const e of list) {
      const a = toNum(e.material_amount, 0);
      if (a > 0) {
        material += a;
        const desc = (e.material_desc || "").trim();
        materialNotes.push(`${desc ? desc + " – " : ""}${round2(a)} Kč`);
      }
    }
    material = round2(material);

    const total = round2(hoursPay + kmPay + material);
    const paid = list.length > 0 && list.every((x) => x.is_paid);

    const firstIn = list.find((x) => x.type === "IN")?.server_time ?? null;
    const lastOut = [...list].reverse().find((x) => x.type === "OUT")?.server_time ?? null;

    rows.push({
      day,
      paid,
      first_in: firstIn,
      last_out: lastOut,

      hours,
      hours_pay: hoursPay,
      km,
      km_pay: kmPay,
      material,
      material_notes: materialNotes,
      total,

      segments,
      offsites,
    });
  }

  rows.sort((a, b) => (a.day < b.day ? 1 : -1));
  return json({ rows });
}
