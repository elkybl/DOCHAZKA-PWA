import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { json, getBearer } from "@/lib/http";
import { verifySession } from "@/lib/auth";

const TZ = "Europe/Prague";

function dayLocalPrague(d: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);

  const o: Record<string, string> = {};
  for (const p of parts) o[p.type] = p.value;

  return `${o.year}-${o.month}-${o.day}`;
}

export async function POST(req: NextRequest) {
  const token = getBearer(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return json({ error: "Unauthorized" }, { status: 401 });
  if ((session as any).role !== "admin") return json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const days = Math.min(30, Math.max(1, Number(url.searchParams.get("days") || "7")));

  const db = supabaseAdmin();

  const to = new Date();
  const from = new Date(Date.now() - days * 86400000);

  // 1) IN eventy
  const { data: ins, error: inErr } = await db
    .from("attendance_events")
    .select("id,user_id,site_id,server_time,type")
    .eq("type", "IN")
    .gte("server_time", from.toISOString())
    .lte("server_time", to.toISOString());

  if (inErr) return json({ error: "DB chyba (IN)." }, { status: 500 });

  // 2) close requests (u vás obsahuje správné in_time)
  const { data: reqs, error: rErr } = await db
    .from("attendance_close_requests")
    .select("id,user_id,site_id,in_time")
    .gte("in_time", from.toISOString())
    .lte("in_time", to.toISOString());

  if (rErr) return json({ error: "DB chyba (requests)." }, { status: 500 });

  // map: user__site__day -> in_time
  const reqMap = new Map<string, string>();
  for (const r of (reqs || []) as any[]) {
    if (!r?.user_id || !r?.site_id || !r?.in_time) continue;
    const day = dayLocalPrague(new Date(r.in_time));
    reqMap.set(`${r.user_id}__${r.site_id}__${day}`, r.in_time);
  }

  let scanned = 0;
  let fixed = 0;
  const fixedIds: string[] = [];

  for (const e of (ins || []) as any[]) {
    scanned++;
    if (!e?.id || !e?.user_id || !e?.site_id || !e?.server_time) continue;

    const day = dayLocalPrague(new Date(e.server_time));
    const key = `${e.user_id}__${e.site_id}__${day}`;
    const reqIn = reqMap.get(key);
    if (!reqIn) continue;

    const diffSec = Math.abs((new Date(e.server_time).getTime() - new Date(reqIn).getTime()) / 1000);

    // jen když je rozdíl ~ 1 hodina (3500–3700 sekund)
    if (diffSec < 3500 || diffSec > 3700) continue;

    const { error: upErr } = await db
      .from("attendance_events")
      .update({
        server_time: reqIn,
        day_local: dayLocalPrague(new Date(reqIn)),
      })
      .eq("id", e.id);

    if (!upErr) {
      fixed++;
      fixedIds.push(e.id);
    }
  }

  return json({ ok: true, days, scanned, fixed, fixedIds });
}