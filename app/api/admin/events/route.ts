import { NextRequest } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase";
import { getBearer, json } from "@/lib/http";
import { verifySession } from "@/lib/auth";
import { dayLocalCZFromIso, fmtTimeCZFromIso, roundToHalfHourCZ } from "@/lib/time";

const qSchema = z.object({
  from: z.string().optional(), // YYYY-MM-DD
  to: z.string().optional(),   // YYYY-MM-DD
  user_id: z.string().optional(),
  site_id: z.string().optional(),
  type: z.enum(["IN","OUT","OFFSITE"]).optional(),
  limit: z.coerce.number().min(1).max(500).default(200),
});

async function requireAdmin(req: NextRequest) {
  const token = getBearer(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return { error: json({ error: "Nepřihlášen." }, { status: 401 }) };
  if (session.role !== "admin") return { error: json({ error: "Jen admin." }, { status: 403 }) };
  return { session };
}

function dayToIsoStart(day: string) {
  // interpret in Prague day, but for filtering use server_time ISO range
  // easiest: filter by day_local in DB if present; fallback to server_time
  return day;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const url = new URL(req.url);
  const parsed = qSchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) return json({ error: "Neplatné parametry." }, { status: 400 });

  const { from, to, user_id, site_id, type, limit } = parsed.data;

  const db = supabaseAdmin();

  // maps for names
  const [{ data: users }, { data: sites }] = await Promise.all([
    db.from("users").select("id,name,role,hourly_rate,km_rate"),
    db.from("sites").select("id,name"),
  ]);

  const userName = new Map<string,string>();
  const userRate = new Map<string,{ hourly:number; km:number }>();
  for (const u of users || []) {
    userName.set((u as any).id, (u as any).name);
    userRate.set((u as any).id, { hourly: Number((u as any).hourly_rate||0), km: Number((u as any).km_rate||0) });
  }
  const siteName = new Map<string,string>();
  for (const s of sites || []) siteName.set((s as any).id, (s as any).name);

  // per user+site overrides
  const { data: usrSiteRates } = await db.from("user_site_rates").select("user_id,site_id,hourly_rate,km_rate");
  const rateMap = new Map<string,{ hourly:number; km:number }>();
  for (const r of usrSiteRates || []) {
    rateMap.set(`${(r as any).user_id}__${(r as any).site_id}`, {
      hourly: Number((r as any).hourly_rate||0),
      km: Number((r as any).km_rate||0),
    });
  }
  const getRate = (uid: string, sid: string | null) => {
    if (sid) {
      const r = rateMap.get(`${uid}__${sid}`);
      if (r) return { ...r, source: "site" as const };
    }
    const d = userRate.get(uid) || { hourly:0, km:0 };
    return { ...d, source: "default" as const };
  };

  let q = db
    .from("attendance_events")
    .select("id,user_id,site_id,type,server_time,day_local,note_work,km,offsite_reason,offsite_hours,material_desc,material_amount,is_paid")
    .order("server_time", { ascending: false })
    .limit(limit);

  if (user_id) q = q.eq("user_id", user_id);
  if (site_id) q = q.eq("site_id", site_id);
  if (type) q = q.eq("type", type);

  // prefer day_local filtering if provided
  if (from) q = q.gte("day_local", from);
  if (to) q = q.lte("day_local", to);

  const { data: evs, error } = await q;
  if (error) return json({ error: "DB chyba." }, { status: 500 });

  const events = (evs || []) as any[];

  // For OUT events, try to match nearest previous IN for same user with server_time < out_time and no OUT in between.
  // We'll do a simple scan per user on sorted ascending list within (from-to) extended.
  const asc = [...events].sort((a,b)=> (a.server_time < b.server_time ? -1 : 1));
  const openIn = new Map<string, any>(); // user_id -> last IN
  const enrichedAsc:any[] = [];
  for (const e of asc) {
    if (e.type === "IN") {
      openIn.set(e.user_id, e);
      enrichedAsc.push({ ...e, matched_in: null });
    } else if (e.type === "OUT") {
      const li = openIn.get(e.user_id) || null;
      // close regardless (we consider this OUT closes last IN)
      openIn.delete(e.user_id);
      enrichedAsc.push({ ...e, matched_in: li ? { id: li.id, server_time: li.server_time, site_id: li.site_id } : null });
    } else {
      enrichedAsc.push({ ...e, matched_in: null });
    }
  }

  const enriched = enrichedAsc.sort((a,b)=> (a.server_time < b.server_time ? 1 : -1));

  const rows = enriched.map((e:any) => {
    const uid = e.user_id as string;
    const sid = e.site_id as string | null;
    const r = getRate(uid, sid);
	const raw = new Date(e.server_time);
	const rounded = roundToHalfHourCZ(raw.toISOString());
    const row:any = {
      id: e.id,
      user_id: uid,
      user_name: userName.get(uid) || uid,
      site_id: sid,
      site_name: sid ? (siteName.get(sid) || sid) : null,
      type: e.type,
      day: e.day_local || dayLocalCZFromIso(e.server_time),
      server_time: e.server_time,
      time_raw: fmtTimeCZFromIso(e.server_time),
      time_rounded: fmtTimeCZFromIso(rounded.toISOString()),
      note_work: e.note_work || null,
      km: e.km ?? null,
      offsite_reason: e.offsite_reason || null,
      offsite_hours: e.offsite_hours ?? null,
      material_desc: e.material_desc || null,
      material_amount: e.material_amount ?? null,
      is_paid: !!e.is_paid,
      rate_hourly: r.hourly,
      rate_km: r.km,
      rate_source: r.source,
      matched_in: e.matched_in,
    };

    if (e.type === "OUT" && e.matched_in?.server_time) {
      const inRaw = new Date(e.matched_in.server_time);
      const inRounded = roundToHalfHourCZ(inRaw);
      const outRounded = roundToHalfHourCZ(raw);
      const minutesRaw = Math.max(0, Math.round((raw.getTime() - inRaw.getTime())/60000));
      const minutesRounded = Math.max(0, Math.round((outRounded.getTime() - inRounded.getTime())/60000));
      const hoursRounded = Math.round((minutesRounded/60)*100)/100;
      row.in_time = e.matched_in.server_time;
      row.in_time_raw = fmtTimeCZFromIso(e.matched_in.server_time);
      row.in_time_rounded = fmtTimeCZFromIso(inRounded.toISOString());
      row.out_time_raw = fmtTimeCZFromIso(e.server_time);
      row.out_time_rounded = fmtTimeCZFromIso(outRounded.toISOString());
      row.minutes_raw = minutesRaw;
      row.minutes_rounded = minutesRounded;
      row.hours_rounded = hoursRounded;
      row.pay_hours = Math.round((hoursRounded * r.hourly)*100)/100;
    }

    if (e.type === "OFFSITE") {
      const h = Number(e.offsite_hours||0);
      row.hours_rounded = Math.round(h*100)/100;
      row.pay_hours = Math.round((h * r.hourly)*100)/100;
    }

    return row;
  });

  return json({ rows });
}
