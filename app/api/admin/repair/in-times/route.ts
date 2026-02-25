import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getBearer, json } from "@/lib/http";
import { verifySession } from "@/lib/auth";

async function requireAdmin(req: NextRequest) {
  const token = getBearer(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return { error: json({ error: "Nepřihlášen." }, { status: 401 }) };
  if (session.role !== "admin") return { error: json({ error: "Jen admin." }, { status: 403 }) };
  return { session };
}

/**
 * Opraví IN eventy, které jsou cca o 1 hodinu posunuté oproti attendance_close_requests.in_time.
 * Bezpečné: mění jen rozdíl 3500-3700 sekund, stejný user+site.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const db = supabaseAdmin();

  // 1) preview count
  const { data: preview, error: pErr } = await db.rpc("sql", {
    query: `
      select count(*)::int as cnt
      from attendance_events e
      join attendance_close_requests r
        on e.user_id = r.user_id and e.site_id = r.site_id
      where e.type='IN'
        and abs(extract(epoch from (e.server_time - r.in_time))) between 3500 and 3700;
    `,
  } as any).catch(() => ({ data: null, error: null }));

  // RPC may not exist; fallback to raw SQL via query() not available.
  // We'll do update directly; Supabase JS doesn't allow arbitrary SQL without RPC.
  // So we implement via two-step: fetch ids then update.
  const { data: rows, error } = await db
    .from("attendance_events")
    .select("id,user_id,site_id,server_time")
    .eq("type","IN")
    .order("server_time",{ascending:false})
    .limit(5000);

  if (error) return json({ error: "DB chyba (načtení)." }, { status: 500 });

  // Load close requests recent
  const { data: reqs, error: rErr } = await db
    .from("attendance_close_requests")
    .select("user_id,site_id,in_time")
    .order("in_time",{ascending:false})
    .limit(5000);

  if (rErr) return json({ error: "DB chyba (requests)." }, { status: 500 });

  // index by user+site+day (prague day) to match
  const index = new Map<string, string>(); // key -> in_time iso
  for (const r of reqs || []) {
    const key = `${(r as any).user_id}__${(r as any).site_id}__${String((r as any).in_time).slice(0,10)}`;
    if (!index.has(key)) index.set(key, (r as any).in_time);
  }

  const toFix: { id: string; newTime: string }[] = [];
  for (const e of rows || []) {
    const uid = (e as any).user_id;
    const sid = (e as any).site_id;
    const key = `${uid}__${sid}__${String((e as any).server_time).slice(0,10)}`;
    const rt = index.get(key);
    if (!rt) continue;
    const diff = Math.abs(new Date((e as any).server_time).getTime() - new Date(rt).getTime());
    if (diff >= 3500_000 && diff <= 3700_000) {
      toFix.push({ id: (e as any).id, newTime: rt });
    }
  }

  let fixed = 0;
  for (const x of toFix) {
    const { error: uErr } = await db.from("attendance_events").update({
      server_time: x.newTime,
      day_local: null, // will be recalculated by app; keep null safe
    }).eq("id", x.id);
    if (!uErr) fixed += 1;
  }

  return json({ ok: true, matched: toFix.length, fixed });
}
