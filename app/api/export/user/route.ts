import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { json } from "@/lib/http";
import { toDate } from "@/lib/time";

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

/**
 * Per-user export for Google Sheets.
 * Security model: long random token stored on user (users.export_token).
 * Example:
 *   /api/export/user?token=...&from=...&to=...
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") || "";
  const from = url.searchParams.get("from") || new Date(Date.now() - 14 * 86400000).toISOString();
  const to = url.searchParams.get("to") || new Date().toISOString();

  if (!token || token.length < 16) return json({ error: "Chybí token." }, { status: 400 });

  const db = supabaseAdmin();

  // Find user by export_token
  const { data: user, error: uErr } = await db
    .from("users")
    .select("id,name,role,hourly_rate,km_rate,export_token")
    .eq("export_token", token)
    .maybeSingle();

  if (uErr) return json({ error: "DB chyba (user)." }, { status: 500 });
  if (!user) return json({ error: "Neplatný token." }, { status: 401 });

  const user_id = (user as any).id as string;
  const user_name = (user as any).name as string;

  const defaultRate = {
    hourly: toNum((user as any).hourly_rate, 0),
    km: toNum((user as any).km_rate, 0),
  };

  // rates per user+site
  const { data: usrSiteRates, error: rErr } = await db
    .from("user_site_rates")
    .select("user_id,site_id,hourly_rate,km_rate")
    .eq("user_id", user_id);

  if (rErr) return json({ error: "DB chyba (rates)." }, { status: 500 });

  const rateMap = new Map<string, { hourly: number; km: number }>();
  for (const r of usrSiteRates || []) {
    rateMap.set(`${(r as any).user_id}__${(r as any).site_id}`, {
      hourly: toNum((r as any).hourly_rate, 0),
      km: toNum((r as any).km_rate, 0),
    });
  }

  const getRate = (site_id: string | null) => {
    if (site_id) {
      const r = rateMap.get(`${user_id}__${site_id}`);
      if (r) return r;
    }
    return defaultRate;
  };

  // sites map (names)
  const { data: sites, error: sErr } = await db.from("sites").select("id,name");
  if (sErr) return json({ error: "DB chyba (sites)." }, { status: 500 });
  const siteName = new Map<string, string>();
  for (const s of sites || []) siteName.set((s as any).id, (s as any).name);

  // events (only this user)
  const { data: evs, error } = await db
    .from("attendance_events")
    .select(
      "user_id,site_id,type,server_time,day_local,note_work,km,offsite_reason,offsite_hours,material_desc,material_amount,is_paid"
    )
    .eq("user_id", user_id)
    .gte("server_time", from)
    .lte("server_time", to)
    .order("server_time", { ascending: true });

  if (error) return json({ error: "DB chyba (events)." }, { status: 500 });

  const events = (evs || []) as Ev[];

  // group by day_local
  const byDay = new Map<string, Ev[]>();
  for (const e of events) {
    const day = e.day_local || e.server_time.slice(0, 10);
    byDay.set(day, [...(byDay.get(day) || []), e]);
  }

  const rows: any[] = [];

  for (const [day, list] of byDay.entries()) {
    const sitesUsed = new Set<string>();
    const workNotes: string[] = [];
    const offsiteNotes: string[] = [];
    const materialNotes: string[] = [];

    for (const e of list) {
      if (e.site_id) sitesUsed.add(siteName.get(e.site_id) || e.site_id);

      if (e.type === "OUT" && e.note_work) workNotes.push(e.note_work.trim());
      if (e.type === "OFFSITE" && e.offsite_reason) {
        const h = toNum(e.offsite_hours, 0);
        offsiteNotes.push(`${e.offsite_reason.trim()} (${h} h)`);
      }
      if (e.material_amount && toNum(e.material_amount, 0) > 0) {
        const desc = (e.material_desc || "").trim();
        materialNotes.push(`${desc ? desc + " – " : ""}${toNum(e.material_amount, 0)} Kč`);
      }
    }

    // IN->OUT hours
    let lastIn: { t: Date; site_id: string | null } | null = null;
    let hours = 0;
    let hoursPay = 0;

    for (const e of list) {
      if (e.type === "IN") lastIn = { t: toDate(e.server_time), site_id: e.site_id };
      if (e.type === "OUT" && lastIn) {
        const out = toDate(e.server_time);
        const minutes = Math.max(0, Math.round((out.getTime() - lastIn.t.getTime()) / 60000));
        const h = minutes / 60;

        hours += h;
        const r = getRate(lastIn.site_id || e.site_id || null);
        hoursPay += h * r.hourly;

        lastIn = null;
      }
    }

    // OFFSITE hours
    let offH = 0;
    let offPay = 0;
    for (const o of list.filter((x) => x.type === "OFFSITE")) {
      const h = toNum(o.offsite_hours, 0);
      offH += h;
      const r = getRate(o.site_id || null);
      offPay += h * r.hourly;
    }
    hours += offH;
    hoursPay += offPay;

    // KM from OUT
    let km = 0;
    let kmPay = 0;
    for (const o of list.filter((x) => x.type === "OUT")) {
      const k = toNum(o.km, 0);
      km += k;
      const r = getRate(o.site_id || null);
      kmPay += k * r.km;
    }

    const material = list.reduce((s, x) => s + toNum(x.material_amount, 0), 0);
    const total = hoursPay + kmPay + material;
    const paid = list.length > 0 && list.every((x) => x.is_paid);

    rows.push({
      user_id,
      user_name,
      day,

      sites: Array.from(sitesUsed),
      work_notes: workNotes,
      offsite_notes: offsiteNotes,
      material_notes: materialNotes,

      hours: Math.round(hours * 100) / 100,
      km: Math.round(km * 10) / 10,
      material: Math.round(material * 100) / 100,

      hours_pay: Math.round(hoursPay * 100) / 100,
      km_pay: Math.round(kmPay * 100) / 100,
      total: Math.round(total * 100) / 100,

      paid,
    });
  }

  // sort: unpaid first, newest first
  rows.sort((a, b) => {
    if (a.paid !== b.paid) return a.paid ? 1 : -1;
    if (a.day !== b.day) return a.day < b.day ? 1 : -1;
    return 0;
  });

  return json({ rows });
}
