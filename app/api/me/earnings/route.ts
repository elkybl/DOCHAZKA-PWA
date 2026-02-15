import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getBearer, json } from "@/lib/http";
import { verifySession } from "@/lib/auth";

type Ev = {
  id: string;
  user_id: string;
  site_id: string | null;
  type: "IN" | "OUT" | "OFFSITE";
  server_time: string;
  day_local: string | null;

  km: number | null;
  offsite_hours: number | null;

  material_amount: number | null;
  is_paid: boolean;
};

function toNum(v: any, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

export async function GET(req: NextRequest) {
  const token = getBearer(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return json({ error: "Nepřihlášen." }, { status: 401 });

  const url = new URL(req.url);
  // interval jen orientačně (stejně groupujeme podle day_local)
  const from = url.searchParams.get("from") || new Date(Date.now() - 14 * 86400000).toISOString();
  const to = url.searchParams.get("to") || new Date().toISOString();

  const db = supabaseAdmin();

  // default sazby
  const { data: me, error: meErr } = await db
    .from("users")
    .select("hourly_rate,km_rate")
    .eq("id", session.userId)
    .single();

  if (meErr) return json({ error: "DB chyba (user)." }, { status: 500 });

  const defaultHourly = toNum(me?.hourly_rate, 0);
  const defaultKmRate = toNum(me?.km_rate, 0);

  // sazby per stavba
  const { data: siteRates } = await db
    .from("user_site_rates")
    .select("site_id,hourly_rate,km_rate")
    .eq("user_id", session.userId);

  const rateBySite = new Map<string, { hourly: number; km: number }>();
  for (const r of siteRates || []) {
    rateBySite.set((r as any).site_id, {
      hourly: toNum((r as any).hourly_rate, 0),
      km: toNum((r as any).km_rate, 0),
    });
  }

  const getRate = (site_id: string | null) => {
    if (site_id) {
      const r = rateBySite.get(site_id);
      if (r) return r;
    }
    return { hourly: defaultHourly, km: defaultKmRate };
  };

  // eventy
  const { data, error } = await db
    .from("attendance_events")
    .select("id,user_id,site_id,type,server_time,day_local,km,offsite_hours,material_amount,is_paid")
    .eq("user_id", session.userId)
    .gte("server_time", from)
    .lte("server_time", to)
    .order("server_time", { ascending: true });

  if (error) return json({ error: "DB chyba (events)." }, { status: 500 });

  const events = (data || []) as Ev[];

  // group by day_local
  const byDay = new Map<string, Ev[]>();
  for (const e of events) {
    const k = e.day_local || e.server_time.slice(0, 10);
    byDay.set(k, [...(byDay.get(k) || []), e]);
  }

  const days = Array.from(byDay.entries()).map(([day, evs]) => {
    // IN->OUT úseky (hodinovka podle site_id IN úseku)
    let lastIn: { t: Date; site_id: string | null } | null = null;

    let hours = 0;
    let hoursPay = 0;

    for (const e of evs) {
      if (e.type === "IN") lastIn = { t: new Date(e.server_time), site_id: e.site_id };
      if (e.type === "OUT" && lastIn) {
        const out = new Date(e.server_time);
        const minutes = Math.max(0, Math.round((out.getTime() - lastIn.t.getTime()) / 60000));
        const h = minutes / 60;

        hours += h;
        const r = getRate(lastIn.site_id || e.site_id || null);
        hoursPay += h * r.hourly;

        lastIn = null;
      }
    }

    // OFFSITE hodiny (hodinovka podle site_id OFFSITE nebo default)
    let offH = 0;
    let offPay = 0;
    for (const o of evs.filter((x) => x.type === "OFFSITE")) {
      const h = toNum(o.offsite_hours, 0);
      offH += h;
      const r = getRate(o.site_id || null);
      offPay += h * r.hourly;
    }
    hours += offH;
    hoursPay += offPay;

    // KM z OUT (km_rate podle site_id OUT nebo default)
    let km = 0;
    let kmPay = 0;
    for (const o of evs.filter((x) => x.type === "OUT")) {
      const k = toNum(o.km, 0);
      km += k;
      const r = getRate(o.site_id || null);
      kmPay += k * r.km;
    }

    // materiál (refund)
    const material = evs.reduce((s, x) => s + toNum(x.material_amount, 0), 0);

    const total = hoursPay + kmPay + material;
    const paid = evs.length > 0 && evs.every((x) => x.is_paid);

    return {
      day,
      hours: Math.round(hours * 100) / 100,
      km: Math.round(km * 10) / 10,
      material: Math.round(material * 100) / 100,
      hours_pay: Math.round(hoursPay * 100) / 100,
      km_pay: Math.round(kmPay * 100) / 100,
      total: Math.round(total * 100) / 100,
      paid,
    };
  });

  // newest first
  days.sort((a, b) => (a.day < b.day ? 1 : -1));

  return json({ days });
}
