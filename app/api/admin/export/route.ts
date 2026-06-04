import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getBearer, json } from "@/lib/http";
import { verifySession } from "@/lib/auth";
import { toDate, ceilMinutesTo30 } from "@/lib/time";
import { compareAttendanceEventsAsc } from "@/lib/attendance-order";
import { loadEffectiveRateEngine } from "@/lib/effective-rates";

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
  programming_hours: number | null;
  programming_note: string | null;
  is_paid: boolean;
};

function toNum(v: unknown, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
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
  const paidFilter = url.searchParams.get("paid") || "all";
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();

  const db = supabaseAdmin();

  const { data: users, error: uErr } = await db
    .from("users")
    .select("id,name,role")
    .order("name", { ascending: true });
  if (uErr) return json({ error: "DB chyba (users)." }, { status: 500 });

  const userNameById = new Map<string, string>();
  for (const u of users || []) userNameById.set(String((u as any).id), String((u as any).name || ""));
  const engine = await loadEffectiveRateEngine(db, { userIds: Array.from(userNameById.keys()) });

  const { data: sites, error: sErr } = await db.from("sites").select("id,name");
  if (sErr) return json({ error: "DB chyba (sites)." }, { status: 500 });
  const siteName = new Map<string, string>();
  for (const s of sites || []) siteName.set((s as any).id, (s as any).name);

  const { data: evs, error } = await db
    .from("attendance_events")
    .select("user_id,site_id,type,server_time,day_local,note_work,km,offsite_reason,offsite_hours,material_desc,material_amount,programming_hours,programming_note,is_paid")
    .gte("server_time", from)
    .lte("server_time", to)
    .order("server_time", { ascending: true });
  if (error) return json({ error: "DB chyba (events)." }, { status: 500 });

  const events = (evs || []) as Ev[];
  const byUserDay = new Map<string, Ev[]>();
  for (const e of events) {
    const day = e.day_local || e.server_time.slice(0, 10);
    const key = `${e.user_id}__${day}`;
    byUserDay.set(key, [...(byUserDay.get(key) || []), e]);
  }

  let rows: any[] = [];

  for (const [key, listRaw] of byUserDay.entries()) {
    const list = [...listRaw].sort(compareAttendanceEventsAsc);
    const [user_id, day] = key.split("__");
    const userName = userNameById.get(user_id);
    if (!userName) continue;

    const sitesUsed = new Set<string>();
    const workNotes: string[] = [];
    const offsiteNotes: string[] = [];
    const materialNotes: string[] = [];

    for (const e of list) {
      if (e.site_id) sitesUsed.add(siteName.get(e.site_id) || e.site_id);
      if (e.type === "OUT" && e.note_work) workNotes.push(e.note_work.trim());
      if (e.type === "OFFSITE" && e.offsite_reason) offsiteNotes.push(`${e.offsite_reason.trim()} (${toNum(e.offsite_hours, 0)} h)`);
      if (toNum(e.material_amount, 0) > 0) {
        const desc = (e.material_desc || "").trim();
        materialNotes.push(`${desc ? desc + " – " : ""}${toNum(e.material_amount, 0)} Kč`);
      }
    }

    let lastIn: { t: Date; site_id: string | null } | null = null;
    let hours = 0;
    let hoursPay = 0;

    for (const e of list) {
      if (e.type === "IN") lastIn = { t: toDate(e.server_time), site_id: e.site_id };
      if (e.type === "OUT" && lastIn) {
        const out = toDate(e.server_time);
        const minutesRounded = ceilMinutesTo30(Math.max(0, Math.round((out.getTime() - lastIn.t.getTime()) / 60000)));
        const h = minutesRounded / 60;
        hours += h;
        const r = engine.getRate(user_id, lastIn.site_id || e.site_id || null, day);
        const progH = Math.max(0, Math.min(h, toNum(e.programming_hours, 0)));
        const siteH = Math.max(0, h - progH);
        hoursPay += siteH * r.hourly + progH * r.prog;
        lastIn = null;
      }
    }

    let offH = 0;
    let offPay = 0;
    for (const o of list.filter((x) => x.type === "OFFSITE")) {
      const h = toNum(o.offsite_hours, 0);
      offH += h;
      const r = engine.getRate(user_id, o.site_id || null, day);
      offPay += h * r.hourly;
    }
    hours += offH;
    hoursPay += offPay;

    let km = 0;
    let kmPay = 0;
    for (const o of list.filter((x) => x.type === "OUT")) {
      const k = toNum(o.km, 0);
      km += k;
      const r = engine.getRate(user_id, o.site_id || null, day);
      kmPay += k * r.km;
    }

    const material = list.reduce((s, x) => s + toNum(x.material_amount, 0), 0);
    const total = hoursPay + kmPay + material;
    const paid = list.length > 0 && list.every((x) => x.is_paid);

    rows.push({
      user_id,
      user_name: userName,
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
      hourly_avg: Math.round((hours > 0 ? hoursPay / hours : 0) * 100) / 100,
      km_avg: Math.round((km > 0 ? kmPay / km : 0) * 100) / 100,
      paid,
    });
  }

  if (paidFilter === "paid") rows = rows.filter((row) => row.paid);
  if (paidFilter === "unpaid") rows = rows.filter((row) => !row.paid);
  if (q) {
    rows = rows.filter((row) => [row.user_name, row.day, ...(row.sites || []), ...(row.work_notes || []), ...(row.offsite_notes || [])].join(" ").toLowerCase().includes(q));
  }

  rows.sort((a, b) => {
    if (a.paid !== b.paid) return a.paid ? 1 : -1;
    if (a.day !== b.day) return a.day < b.day ? 1 : -1;
    return a.user_name.localeCompare(b.user_name, "cs");
  });

  return json({ rows });
}
