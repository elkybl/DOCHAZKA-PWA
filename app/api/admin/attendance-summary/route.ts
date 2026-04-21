import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getBearer, json } from "@/lib/http";
import { verifySession } from "@/lib/auth";
import { toDate } from "@/lib/time";
import { compareAttendanceEventsAsc } from "@/lib/attendance-order";

function toNum(v: any, d = 0) { const n = Number(v); return Number.isFinite(n) ? n : d; }
function round2(n: number) { return Math.round(n * 100) / 100; }

async function requireAdmin(req: NextRequest) {
  const token = getBearer(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return { error: json({ error: "Nepřihlášen." }, { status: 401 }) };
  if (session.role !== "admin") return { error: json({ error: "Jen admin." }, { status: 403 }) };
  return { session };
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ((auth as any).error) return (auth as any).error;

  const url = new URL(req.url);
  const from = url.searchParams.get("from") || new Date(Date.now() - 14 * 86400000).toISOString();
  const to = url.searchParams.get("to") || new Date().toISOString();
  const siteId = url.searchParams.get("site_id");
  const userId = url.searchParams.get("user_id");

  const db = supabaseAdmin();
  const { data: users, error: uErr } = await db.from("users").select("id,name,hourly_rate,km_rate,programming_rate").order("name", { ascending: true });
  if (uErr) return json({ error: "DB chyba (users)." }, { status: 500 });
  const defByUser = new Map<string, any>();
  for (const u of users || []) defByUser.set((u as any).id, u);

  const { data: usrSiteRates, error: rErr } = await db.from("user_site_rates").select("user_id,site_id,hourly_rate,km_rate,programming_rate");
  if (rErr) return json({ error: "DB chyba (rates)." }, { status: 500 });
  const rateMap = new Map<string, any>();
  for (const r of usrSiteRates || []) rateMap.set(`${(r as any).user_id}__${(r as any).site_id}`, r);

  const getRates = (uid: string, sid: string | null) => {
    if (sid) {
      const r = rateMap.get(`${uid}__${sid}`);
      if (r) return { hourly: toNum(r.hourly_rate), km: toNum(r.km_rate), programming: toNum((r as any).programming_rate), source: "site" as const };
    }
    const d = defByUser.get(uid);
    return { hourly: toNum(d?.hourly_rate), km: toNum(d?.km_rate), programming: toNum(d?.programming_rate), source: "default" as const };
  };

  const { data: sites, error: sErr } = await db.from("sites").select("id,name");
  if (sErr) return json({ error: "DB chyba (sites)." }, { status: 500 });
  const siteName = new Map<string, string>();
  for (const s of sites || []) siteName.set((s as any).id, (s as any).name);

  let query = db.from("attendance_events").select("id,user_id,site_id,type,server_time,day_local,note_work,km,programming_hours,programming_note,offsite_reason,offsite_hours,material_desc,material_amount,is_paid").gte("server_time", from).lte("server_time", to).order("server_time", { ascending: true });
  if (siteId) query = query.eq("site_id", siteId);
  if (userId) query = query.eq("user_id", userId);
  const { data: evs, error } = await query;
  if (error) return json({ error: "DB chyba (events)." }, { status: 500 });
  const events = (evs || []) as any[];

  const grouped = new Map<string, any[]>();
  for (const e of events) {
    const day = e.day_local || String(e.server_time).slice(0, 10);
    const key = `${e.user_id}__${day}__${e.site_id || ""}`;
    grouped.set(key, [...(grouped.get(key) || []), e]);
  }

  const rows: any[] = [];
  for (const [key, listRaw] of grouped.entries()) {
    const [uid, day, sidRaw] = key.split("__");
    const sid = sidRaw || null;
    const uname = (defByUser.get(uid) as any)?.name || uid;
    const sname = sid ? (siteName.get(sid) || sid) : null;
    const list = [...listRaw].sort(compareAttendanceEventsAsc);

    let lastIn: any = null;
    let workHours = 0, workPay = 0, totalKm = 0, kmPay = 0, mat = 0;
    let firstIn: string | null = null, lastOut: string | null = null;
    const workNotes: string[] = [];
    let paidAll = true;
    const workDeleteIds: string[] = [];

    for (const e of list) {
      paidAll = paidAll && !!e.is_paid;
      if (e.type === "IN") {
        lastIn = e;
        workDeleteIds.push(e.id);
        if (!firstIn) firstIn = e.server_time;
      } else if (e.type === "OUT") {
        workDeleteIds.push(e.id);
        lastOut = e.server_time;
        if (lastIn) {
          const mins = Math.max(0, Math.round((toDate(e.server_time).getTime() - toDate(lastIn.server_time).getTime()) / 60000));
          const h = round2(mins / 60);
          workHours += h;
          const rates = getRates(uid, sid || e.site_id || lastIn.site_id || null);
          workPay += h * rates.hourly;
          totalKm += toNum(e.km, 0);
          kmPay += toNum(e.km, 0) * rates.km;
          mat += toNum(e.material_amount, 0);
          if (e.note_work) workNotes.push(String(e.note_work).trim());
          lastIn = null;
        }
      }
    }

    if (workHours > 0 || totalKm > 0 || mat > 0 || workNotes.length) {
      rows.push({
        id: `work__${uid}__${day}__${sid || "none"}`,
        sourceKind: "WORK",
        sourceId: workDeleteIds[workDeleteIds.length - 1] || null,
        sourceIds: workDeleteIds,
        user_id: uid,
        user_name: uname,
        site_id: sid,
        site_name: sname,
        day,
        paid: paidAll,
        title: "Práce",
        first_in: firstIn,
        last_out: lastOut,
        hours: round2(workHours),
        hourly_rate: round2(workHours > 0 ? workPay / workHours : 0),
        pay: round2(workPay),
        km: round2(totalKm),
        km_pay: round2(kmPay),
        material: round2(mat),
        total: round2(workPay + kmPay + mat),
        note: workNotes.join(" | "),
      });
    }

    for (const e of list.filter((x) => x.type === "OUT" && toNum(x.programming_hours, 0) > 0)) {
      const rates = getRates(uid, sid || e.site_id || null);
      const ph = toNum(e.programming_hours, 0);
      const pr = toNum(rates.programming, 0);
      rows.push({
        id: `prog__${e.id}`,
        sourceKind: "PROGRAM",
        sourceId: e.id,
        user_id: uid,
        user_name: uname,
        site_id: sid || e.site_id || null,
        site_name: sname || (e.site_id ? (siteName.get(e.site_id) || e.site_id) : null),
        day,
        paid: !!e.is_paid,
        title: "Programování",
        first_in: null,
        last_out: null,
        hours: round2(ph),
        hourly_rate: round2(pr),
        pay: round2(ph * pr),
        km: 0,
        km_pay: 0,
        material: 0,
        total: round2(ph * pr),
        note: (e.programming_note || "").trim(),
      });
    }

    for (const e of list.filter((x) => x.type === "OFFSITE")) {
      const h = toNum(e.offsite_hours, 0);
      if (h <= 0) continue;
      const rates = getRates(uid, sid || e.site_id || null);
      rows.push({
        id: `off__${e.id}`,
        sourceKind: "OFFSITE",
        sourceId: e.id,
        user_id: uid,
        user_name: uname,
        site_id: sid || e.site_id || null,
        site_name: sname || (e.site_id ? (siteName.get(e.site_id) || e.site_id) : null),
        day,
        paid: !!e.is_paid,
        title: "Mimo stavbu",
        first_in: null,
        last_out: null,
        hours: round2(h),
        hourly_rate: round2(rates.hourly),
        pay: round2(h * rates.hourly),
        km: 0,
        km_pay: 0,
        material: round2(toNum(e.material_amount, 0)),
        total: round2(h * rates.hourly + toNum(e.material_amount, 0)),
        note: (e.offsite_reason || "").trim() || "Mimo stavbu",
      });
    }
  }

  rows.sort((a, b) => {
    if (a.day !== b.day) return a.day < b.day ? 1 : -1;
    if (a.user_name !== b.user_name) return a.user_name.localeCompare(b.user_name, "cs");
    const order: any = { WORK: 0, PROGRAM: 1, OFFSITE: 2 };
    if (a.sourceKind !== b.sourceKind) return order[a.sourceKind] - order[b.sourceKind];
    return String(a.site_name || "").localeCompare(String(b.site_name || ""), "cs");
  });

  return json({ rows });
}
