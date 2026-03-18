import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getBearer, json } from "@/lib/http";
import { verifySession } from "@/lib/auth";
import { toDate } from "@/lib/time";

type Ev = {
  user_id: string;
  site_id: string | null;
  type: "IN" | "OUT" | "OFFSITE";
  server_time: string;
  day_local: string | null;
  note_work: string | null;
  km: number | null;
  programming_hours: number | null;
  programming_note: string | null;
  offsite_reason: string | null;
  offsite_hours: number | null;
  material_desc: string | null;
  material_amount: number | null;
  is_paid: boolean;
};

function toNum(v: any, d = 0) { const n = Number(v); return Number.isFinite(n) ? n : d; }
function round2(n: number) { return Math.round(n * 100) / 100; }
function round1(n: number) { return Math.round(n * 10) / 10; }

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
  const from = url.searchParams.get("from") || new Date(Date.now() - 30 * 86400000).toISOString();
  const to = url.searchParams.get("to") || new Date().toISOString();

  const db = supabaseAdmin();

  const { data: users, error: uErr } = await db
    .from("users")
    .select("id,name,role,hourly_rate,km_rate,programming_rate")
    .order("name", { ascending: true });
  if (uErr) return json({ error: "DB chyba (users)." }, { status: 500 });

  const defaultByUser = new Map<string, { name: string; hourly: number; km: number; programming: number }>();
  for (const u of users || []) {
    defaultByUser.set((u as any).id, {
      name: (u as any).name,
      hourly: toNum((u as any).hourly_rate, 0),
      km: toNum((u as any).km_rate, 0),
      programming: toNum((u as any).programming_rate, 0),
    });
  }

  const { data: usrSiteRates, error: rErr } = await db
    .from("user_site_rates")
    .select("user_id,site_id,hourly_rate,km_rate,programming_rate");
  if (rErr) return json({ error: "DB chyba (rates)." }, { status: 500 });

  const rateMap = new Map<string, { hourly: number; km: number; programming: number }>();
  for (const r of usrSiteRates || []) {
    rateMap.set(`${(r as any).user_id}__${(r as any).site_id}`, {
      hourly: toNum((r as any).hourly_rate, 0),
      km: toNum((r as any).km_rate, 0),
      programming: toNum((r as any).programming_rate, 0),
    });
  }

  const getRate = (user_id: string, site_id: string | null) => {
    if (site_id) {
      const r = rateMap.get(`${user_id}__${site_id}`);
      if (r) return r;
    }
    const def = defaultByUser.get(user_id);
    return { hourly: def?.hourly ?? 0, km: def?.km ?? 0, programming: def?.programming ?? 0 };
  };

  const { data: sites, error: sErr } = await db.from("sites").select("id,name");
  if (sErr) return json({ error: "DB chyba (sites)." }, { status: 500 });

  const siteName = new Map<string, string>();
  for (const s of sites || []) siteName.set((s as any).id, (s as any).name);

  const { data: evs, error } = await db
    .from("attendance_events")
    .select("user_id,site_id,type,server_time,day_local,note_work,km,programming_hours,programming_note,offsite_reason,offsite_hours,material_desc,material_amount,is_paid")
    .gte("server_time", from)
    .lte("server_time", to)
    .order("server_time", { ascending: true });
  if (error) return json({ error: "DB chyba (events)." }, { status: 500 });

  const events = (evs || []) as Ev[];

  // first group by user+day+site to compute daily totals accurately from IN/OUT
  const byUserDaySite = new Map<string, Ev[]>();
  for (const e of events) {
    const day = e.day_local || String(e.server_time).slice(0, 10);
    const key = `${e.user_id}__${day}__${e.site_id || ""}`;
    byUserDaySite.set(key, [...(byUserDaySite.get(key) || []), e]);
  }

  type Agg = {
    user_id: string;
    user_name: string;
    site_id: string | null;
    site_name: string | null;
    from_day: string;
    to_day: string;
    days_count: number;
    hours: number;
    hours_pay: number;
    programming_hours: number;
    programming_pay: number;
    km: number;
    km_pay: number;
    material: number;
    total: number;
    paid: boolean;
  };

  const aggMap = new Map<string, Agg>();
  const daySetMap = new Map<string, Set<string>>();

  for (const [key, listRaw] of byUserDaySite.entries()) {
    const [user_id, day, site_id_raw] = key.split("__");
    const site_id = site_id_raw || null;
    const user = defaultByUser.get(user_id);
    if (!user) continue;
    const list = [...listRaw].sort((a, b) => (a.server_time < b.server_time ? -1 : 1));
    const rates = getRate(user_id, site_id);

    let lastIn: Ev | null = null;
    let workHours = 0;
    let workPay = 0;
    let km = 0;
    let kmPay = 0;
    let material = 0;
    let progHours = 0;
    let progPay = 0;
    let paid = list.length > 0 && list.every((x) => !!x.is_paid);

    for (const e of list) {
      if (e.type === "IN") {
        lastIn = e;
      } else if (e.type === "OUT") {
        if (lastIn) {
          const mins = Math.max(0, Math.round((toDate(e.server_time).getTime() - toDate(lastIn.server_time).getTime()) / 60000));
          const h = mins / 60;
          workHours += h;
          workPay += h * rates.hourly;
          lastIn = null;
        }
        km += toNum(e.km, 0);
        kmPay += toNum(e.km, 0) * rates.km;
        material += toNum(e.material_amount, 0);
        const ph = toNum(e.programming_hours, 0);
        progHours += ph;
        progPay += ph * rates.programming;
      } else if (e.type === "OFFSITE") {
        const h = toNum(e.offsite_hours, 0);
        workHours += h;
        workPay += h * rates.hourly;
        material += toNum(e.material_amount, 0);
      }
    }

    const aggKey = `${user_id}__${site_id || "none"}`;
    if (!aggMap.has(aggKey)) {
      aggMap.set(aggKey, {
        user_id,
        user_name: user.name,
        site_id,
        site_name: site_id ? (siteName.get(site_id) || site_id) : "Bez akce",
        from_day: day,
        to_day: day,
        days_count: 0,
        hours: 0,
        hours_pay: 0,
        programming_hours: 0,
        programming_pay: 0,
        km: 0,
        km_pay: 0,
        material: 0,
        total: 0,
        paid,
      });
      daySetMap.set(aggKey, new Set());
    }

    const agg = aggMap.get(aggKey)!;
    agg.from_day = agg.from_day < day ? agg.from_day : day;
    agg.to_day = agg.to_day > day ? agg.to_day : day;
    daySetMap.get(aggKey)!.add(day);
    agg.hours += workHours;
    agg.hours_pay += workPay;
    agg.programming_hours += progHours;
    agg.programming_pay += progPay;
    agg.km += km;
    agg.km_pay += kmPay;
    agg.material += material;
    agg.total += workPay + progPay + kmPay + material;
    agg.paid = agg.paid && paid;
  }

  const rows = Array.from(aggMap.values()).map((r) => ({
    ...r,
    days_count: daySetMap.get(`${r.user_id}__${r.site_id || "none"}`)?.size || 0,
    hours: round2(r.hours),
    hours_pay: round2(r.hours_pay),
    programming_hours: round2(r.programming_hours),
    programming_pay: round2(r.programming_pay),
    km: round1(r.km),
    km_pay: round2(r.km_pay),
    material: round2(r.material),
    total: round2(r.total),
  }));

  rows.sort((a, b) => {
    if (a.paid !== b.paid) return a.paid ? 1 : -1;
    if (a.user_name !== b.user_name) return a.user_name.localeCompare(b.user_name, "cs");
    return String(a.site_name || "").localeCompare(String(b.site_name || ""), "cs");
  });

  return json({ rows });
}
