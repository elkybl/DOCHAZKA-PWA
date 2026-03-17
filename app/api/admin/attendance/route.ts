import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getBearer, json } from "@/lib/http";
import { verifySession } from "@/lib/auth";
import { toDate, czLocalToUtcDate } from "@/lib/time";

type Ev = {
  id: string;
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

function toNum(v: any, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}
function round2(n: number) { return Math.round(n * 100) / 100; }
function round1(n: number) { return Math.round(n * 10) / 10; }
function addDays(d: Date, days: number) { return new Date(d.getTime() + days * 86400000); }

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
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const user_id = url.searchParams.get("user_id");
  const site_id = url.searchParams.get("site_id");
  const limit = Math.min(800, Math.max(1, Number(url.searchParams.get("limit") || "400")));

  const db = supabaseAdmin();

  const [{ data: users, error: uErr }, { data: sites, error: sErr }, { data: usrSiteRates, error: rErr }] = await Promise.all([
    db.from("users").select("id,name,role,hourly_rate,km_rate,is_programmer,programming_rate").order("name", { ascending: true }),
    db.from("sites").select("id,name"),
    db.from("user_site_rates").select("user_id,site_id,hourly_rate,km_rate,programming_rate"),
  ]);
  if (uErr) return json({ error: "DB chyba (users)." }, { status: 500 });
  if (sErr) return json({ error: "DB chyba (sites)." }, { status: 500 });
  if (rErr) return json({ error: "DB chyba (rates)." }, { status: 500 });

  const defaultByUser = new Map<string, { name: string; hourly: number; km: number; prog: number }>();
  for (const u of users || []) {
    defaultByUser.set((u as any).id, {
      name: (u as any).name,
      hourly: toNum((u as any).hourly_rate, 0),
      km: toNum((u as any).km_rate, 0),
      prog: toNum((u as any).programming_rate, toNum((u as any).hourly_rate, 0)),
    });
  }
  const rateMap = new Map<string, { hourly: number; km: number; prog: number }>();
  for (const r of usrSiteRates || []) {
    rateMap.set(`${(r as any).user_id}__${(r as any).site_id}`, {
      hourly: toNum((r as any).hourly_rate, 0),
      km: toNum((r as any).km_rate, 0),
      prog: toNum((r as any).programming_rate, toNum((r as any).hourly_rate, 0)),
    });
  }
  const getRate = (uid: string, sid: string | null) => {
    if (sid) {
      const r = rateMap.get(`${uid}__${sid}`);
      if (r) return { ...r, source: "site" as const };
    }
    const d = defaultByUser.get(uid);
    const hourly = d?.hourly ?? 0;
    return { hourly, km: d?.km ?? 0, prog: d?.prog ?? hourly, source: "default" as const };
  };
  const siteName = new Map<string, string>();
  for (const s of sites || []) siteName.set((s as any).id, (s as any).name);

  let q = db
    .from("attendance_events")
    .select("id,user_id,site_id,type,server_time,day_local,note_work,km,offsite_reason,offsite_hours,material_desc,material_amount,programming_hours,programming_note,is_paid")
    .order("server_time", { ascending: true })
    .limit(limit);

  if (user_id) q = q.eq("user_id", user_id);
  if (site_id) q = q.eq("site_id", site_id);
  if (from) q = q.gte("server_time", czLocalToUtcDate(from).toISOString());
  if (to) q = q.lt("server_time", addDays(czLocalToUtcDate(to), 1).toISOString());

  const { data: evs, error } = await q;
  if (error) return json({ error: "DB chyba (events)." }, { status: 500 });
  const events = (evs || []) as Ev[];

  const byUserDay = new Map<string, Ev[]>();
  for (const e of events) {
    const day = e.day_local || e.server_time.slice(0, 10);
    const key = `${e.user_id}__${day}`;
    byUserDay.set(key, [...(byUserDay.get(key) || []), e]);
  }

  const rows: any[] = [];
  for (const [key, listRaw] of byUserDay.entries()) {
    const [uid, day] = key.split("__");
    const def = defaultByUser.get(uid);
    if (!def) continue;
    const list = [...listRaw].sort((a, b) => (a.server_time < b.server_time ? -1 : 1));

    const sitesUsed = new Set<string>();
    for (const e of list) if (e.site_id) sitesUsed.add(siteName.get(e.site_id) || e.site_id);

    type WorkSeg = {
      kind: "WORK";
      source_event_id: string;
      site_id: string | null;
      site_name: string | null;
      in_time: string;
      out_time: string;
      hours: number;
      hourly_rate: number;
      rate_source: "site" | "default";
      pay: number;
      note_work: string | null;
      km: number;
      km_pay: number;
      material_amount: number;
      material_desc: string | null;
      total: number;
      is_paid: boolean;
    };
    type ProgramSeg = {
      kind: "PROGRAM";
      source_event_id: string;
      site_id: string | null;
      site_name: string | null;
      day: string;
      hours: number;
      hourly_rate: number;
      rate_source: "site" | "default";
      pay: number;
      note: string | null;
      is_paid: boolean;
    };
    type OffSeg = {
      kind: "OFFSITE";
      source_event_id: string;
      site_id: string | null;
      site_name: string | null;
      reason: string;
      hours: number;
      hourly_rate: number;
      rate_source: "site" | "default";
      pay: number;
      is_paid: boolean;
    };

    const segments: WorkSeg[] = [];
    const programming: ProgramSeg[] = [];
    const offsites: OffSeg[] = [];
    let lastIn: { t: Date; iso: string; site_id: string | null } | null = null;

    for (const e of list) {
      if (e.type === "IN") {
        lastIn = { t: toDate(e.server_time), iso: e.server_time, site_id: e.site_id };
      } else if (e.type === "OUT" && lastIn) {
        const out = toDate(e.server_time);
        const minutes = Math.max(0, Math.round((out.getTime() - lastIn.t.getTime()) / 60000));
        const h = minutes / 60;
        const r = getRate(uid, lastIn.site_id || e.site_id || null);
        const progH = Math.max(0, Math.min(h, toNum(e.programming_hours, 0)));
        const siteH = Math.max(0, h - progH);
        const k = toNum(e.km, 0);
        const mat = toNum(e.material_amount, 0);
        const kmPay = k * r.km;
        const sitePay = siteH * r.hourly;
        segments.push({
          kind: "WORK",
          source_event_id: e.id,
          site_id: lastIn.site_id || e.site_id || null,
          site_name: (lastIn.site_id || e.site_id) ? (siteName.get((lastIn.site_id || e.site_id) as string) || null) : null,
          in_time: lastIn.iso,
          out_time: e.server_time,
          hours: round2(siteH),
          hourly_rate: round2(r.hourly),
          rate_source: r.source,
          pay: round2(sitePay),
          note_work: e.note_work || null,
          km: round1(k),
          km_pay: round2(kmPay),
          material_amount: round2(mat),
          material_desc: e.material_desc || null,
          total: round2(sitePay + kmPay + mat),
          is_paid: !!e.is_paid,
        });
        if (progH > 0) {
          const progPay = progH * r.prog;
          programming.push({
            kind: "PROGRAM",
            source_event_id: e.id,
            site_id: lastIn.site_id || e.site_id || null,
            site_name: (lastIn.site_id || e.site_id) ? (siteName.get((lastIn.site_id || e.site_id) as string) || null) : null,
            day,
            hours: round2(progH),
            hourly_rate: round2(r.prog),
            rate_source: r.source,
            pay: round2(progPay),
            note: e.programming_note || null,
            is_paid: !!e.is_paid,
          });
        }
        lastIn = null;
      } else if (e.type === "OFFSITE") {
        const h = toNum(e.offsite_hours, 0);
        if (h > 0) {
          const r = getRate(uid, e.site_id || null);
          offsites.push({
            kind: "OFFSITE",
            source_event_id: e.id,
            site_id: e.site_id || null,
            site_name: e.site_id ? (siteName.get(e.site_id) || null) : null,
            reason: (e.offsite_reason || "").trim() || "Mimo stavbu",
            hours: round2(h),
            hourly_rate: round2(r.hourly),
            rate_source: r.source,
            pay: round2(h * r.hourly),
            is_paid: !!e.is_paid,
          });
        }
      }
    }

    const hours = round2(segments.reduce((s, x) => s + x.hours, 0) + programming.reduce((s, x) => s + x.hours, 0) + offsites.reduce((s, x) => s + x.hours, 0));
    const km = round1(segments.reduce((s, x) => s + x.km, 0));
    const material = round2(segments.reduce((s, x) => s + x.material_amount, 0));
    const hoursPay = round2(segments.reduce((s, x) => s + x.pay, 0) + programming.reduce((s, x) => s + x.pay, 0) + offsites.reduce((s, x) => s + x.pay, 0));
    const kmPay = round2(segments.reduce((s, x) => s + x.km_pay, 0));
    const total = round2(hoursPay + kmPay + material);
    const paid = list.length > 0 && list.every((x) => x.is_paid);
    const firstIn = list.find((x) => x.type === "IN")?.server_time ?? null;
    const lastOut = [...list].reverse().find((x) => x.type === "OUT")?.server_time ?? null;

    rows.push({
      user_id: uid,
      user_name: def.name,
      day,
      first_in: firstIn,
      last_out: lastOut,
      sites: Array.from(sitesUsed),
      segments,
      programming,
      offsites,
      hours,
      km,
      material,
      hours_pay: hoursPay,
      km_pay: kmPay,
      total,
      paid,
    });
  }

  rows.sort((a, b) => {
    if (a.paid !== b.paid) return a.paid ? 1 : -1;
    if (a.day !== b.day) return a.day < b.day ? 1 : -1;
    return a.user_name.localeCompare(b.user_name);
  });
  return json({ rows });
}
