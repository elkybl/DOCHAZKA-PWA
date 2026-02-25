import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getBearer, json } from "@/lib/http";
import { verifySession } from "@/lib/auth";
import { fmtTimeCZFromIso } from "@/lib/time";

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

function fmtTime(iso: string) {
  return fmtTimeCZFromIso(iso);
}

async function requireAdmin(req: NextRequest) {
  const token = getBearer(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return { error: json({ error: "Nepřihlášen." }, { status: 401 }) };
  if (session.role !== "admin") return { error: json({ error: "Jen admin." }, { status: 403 }) };
  return { session };
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const url = new URL(req.url);
  const from = url.searchParams.get("from") || new Date(Date.now() - 14 * 86400000).toISOString();
  const to = url.searchParams.get("to") || new Date().toISOString();

  const db = supabaseAdmin();

  // users (default sazby)
  const { data: users, error: uErr } = await db
    .from("users")
    .select("id,name,role,hourly_rate,km_rate")
    .order("name", { ascending: true });

  if (uErr) return json({ error: "DB chyba (users)." }, { status: 500 });

  const defaultByUser = new Map<string, { name: string; hourly: number; km: number }>();
  for (const u of users || []) {
    defaultByUser.set((u as any).id, {
      name: (u as any).name,
      hourly: toNum((u as any).hourly_rate, 0),
      km: toNum((u as any).km_rate, 0),
    });
  }

  // sazby per user+site
  const { data: usrSiteRates, error: rErr } = await db
    .from("user_site_rates")
    .select("user_id,site_id,hourly_rate,km_rate");

  if (rErr) return json({ error: "DB chyba (rates)." }, { status: 500 });

  const rateMap = new Map<string, { hourly: number; km: number }>();
  for (const r of usrSiteRates || []) {
    rateMap.set(`${(r as any).user_id}__${(r as any).site_id}`, {
      hourly: toNum((r as any).hourly_rate, 0),
      km: toNum((r as any).km_rate, 0),
    });
  }

  const getRate = (user_id: string, site_id: string | null) => {
    if (site_id) {
      const r = rateMap.get(`${user_id}__${site_id}`);
      if (r) return { ...r, source: "site" as const };
    }
    const def = defaultByUser.get(user_id);
    return { hourly: def?.hourly ?? 0, km: def?.km ?? 0, source: "default" as const };
  };

  // sites map (kvůli názvu)
  const { data: sites, error: sErr } = await db.from("sites").select("id,name");
  if (sErr) return json({ error: "DB chyba (sites)." }, { status: 500 });

  const siteName = new Map<string, string>();
  for (const s of sites || []) siteName.set((s as any).id, (s as any).name);

  // events
  const { data: evs, error } = await db
    .from("attendance_events")
    .select(
      "user_id,site_id,type,server_time,day_local,note_work,km,offsite_reason,offsite_hours,material_desc,material_amount,is_paid"
    )
    .gte("server_time", from)
    .lte("server_time", to)
    .order("server_time", { ascending: true });

  if (error) return json({ error: "DB chyba (events)." }, { status: 500 });

  const events = (evs || []) as Ev[];

  // group by user + day_local
  const byUserDay = new Map<string, Ev[]>();
  for (const e of events) {
    const day = e.day_local || e.server_time.slice(0, 10);
    const key = `${e.user_id}__${day}`;
    byUserDay.set(key, [...(byUserDay.get(key) || []), e]);
  }

  const rows: any[] = [];

  for (const [key, listRaw] of byUserDay.entries()) {
    const [user_id, day] = key.split("__");
    const def = defaultByUser.get(user_id);
    if (!def) continue;

    const list = [...listRaw].sort((a, b) => (a.server_time < b.server_time ? -1 : 1));

    // “stavby použité”
    const sitesUsed = new Set<string>();
    for (const e of list) if (e.site_id) sitesUsed.add(siteName.get(e.site_id) || e.site_id);

    // poznámky
    const workNotes: string[] = [];
    const materialNotes: string[] = [];
    for (const e of list) {
      if (e.type === "OUT" && e.note_work) workNotes.push(e.note_work.trim());
      if (toNum(e.material_amount, 0) > 0) {
        const desc = (e.material_desc || "").trim();
        materialNotes.push(`${desc ? desc + " – " : ""}${toNum(e.material_amount, 0)} Kč`);
      }
    }

    // segmenty IN->OUT
    type Seg = {
      kind: "WORK";
      site_id: string | null;
      site_name: string | null;
      in_time: string;
      out_time: string;
      minutes: number;
      hours: number;
      hourly_rate: number;
      rate_source: "site" | "default";
      pay: number;
      note_work: string | null; // z OUT eventu (nejbližší)
    };

    const segments: Seg[] = [];
    let lastIn: { t: Date; iso: string; site_id: string | null } | null = null;

    for (const e of list) {
      if (e.type === "IN") {
        lastIn = { t: new Date(e.server_time), iso: e.server_time, site_id: e.site_id };
      } else if (e.type === "OUT" && lastIn) {
        const out = new Date(e.server_time);
        const minutes = Math.max(0, Math.round((out.getTime() - lastIn.t.getTime()) / 60000));
        const hours = minutes / 60;

        const r = getRate(user_id, lastIn.site_id || e.site_id || null);
        const pay = hours * r.hourly;

        segments.push({
          kind: "WORK",
          site_id: lastIn.site_id || e.site_id || null,
          site_name: (lastIn.site_id || e.site_id) ? (siteName.get((lastIn.site_id || e.site_id) as string) || null) : null,
          in_time: lastIn.iso,
          out_time: e.server_time,
          minutes,
          hours: round2(hours),
          hourly_rate: round2(r.hourly),
          rate_source: r.source,
          pay: round2(pay),
          note_work: e.note_work || null,
        });

        lastIn = null;
      }
    }

    // OFFSITE položky (počítají se do hodin a do peněz)
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
      const r = getRate(user_id, e.site_id || null);
      offsites.push({
        kind: "OFFSITE",
        site_id: e.site_id || null,
        site_name: e.site_id ? (siteName.get(e.site_id) || null) : null,
        reason: (e.offsite_reason || "").trim() || "Mimo stavbu",
        hours: round2(h),
        hourly_rate: round2(r.hourly),
        rate_source: r.source,
        pay: round2(h * r.hourly),
      });
    }

    // Součty hodin/peněz
    const workHours = segments.reduce((s, x) => s + x.hours, 0);
    const workPay = segments.reduce((s, x) => s + x.pay, 0);

    const offHours = offsites.reduce((s, x) => s + x.hours, 0);
    const offPay = offsites.reduce((s, x) => s + x.pay, 0);

    const hours = round2(workHours + offHours);
    const hoursPay = round2(workPay + offPay);

    // KM z OUT (sazba podle site_id OUT)
    let km = 0;
    let kmPay = 0;
    for (const o of list.filter((x) => x.type === "OUT")) {
      const k = toNum(o.km, 0);
      if (k <= 0) continue;
      km += k;
      const r = getRate(user_id, o.site_id || null);
      kmPay += k * r.km;
    }
    km = round1(km);
    kmPay = round2(kmPay);

    // materiál refund
    const material = round2(list.reduce((s, x) => s + toNum(x.material_amount, 0), 0));

    const total = round2(hoursPay + kmPay + material);
    const paid = list.length > 0 && list.every((x) => x.is_paid);

    const hourlyAvg = hours > 0 ? round2(hoursPay / hours) : 0;
    const kmAvg = km > 0 ? round2(kmPay / km) : 0;

    // první IN / poslední OUT (pro admin přehled)
    const firstIn = list.find((x) => x.type === "IN")?.server_time ?? null;
    const lastOut = [...list].reverse().find((x) => x.type === "OUT")?.server_time ?? null;

    rows.push({
      user_id,
      user_name: def.name,
      day,

      first_in: firstIn,
      last_out: lastOut,

      sites: Array.from(sitesUsed),
      work_notes: workNotes,
      material_notes: materialNotes,

      // detail
      segments,
      offsites,

      hours,
      km,
      material,

      hours_pay: hoursPay,
      km_pay: kmPay,
      total,

      hourly_avg: hourlyAvg,
      km_avg: kmAvg,

      paid,
    });
  }

  // řazení: nezaplacené nahoře, nejnovější den nahoře, pak jméno
  rows.sort((a, b) => {
    if (a.paid !== b.paid) return a.paid ? 1 : -1;
    if (a.day !== b.day) return a.day < b.day ? 1 : -1;
    return a.user_name.localeCompare(b.user_name);
  });

  return json({ rows });
}
