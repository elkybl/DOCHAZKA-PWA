import { NextRequest } from "next/server";
import { getBearer, json } from "@/lib/http";
import { verifySession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { czLocalToUtcDate } from "@/lib/time";

function toNum(v: any, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

export async function GET(req: NextRequest) {
  const token = getBearer(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const day = String(url.searchParams.get("day") || "").trim(); // YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return json({ error: "Chybí nebo špatný parametr day (YYYY-MM-DD)." }, { status: 400 });
  }

  // start dne v CZ jako UTC instant
  const fromDate = czLocalToUtcDate(day);
  if (!Number.isFinite(fromDate.getTime())) return json({ error: "Neplatné day." }, { status: 400 });

  // end dne = start + 24h - 1s
  const toDate = new Date(fromDate.getTime() + 24 * 60 * 60 * 1000 - 1000);

  const from = fromDate.toISOString();
  const to = toDate.toISOString();

  const db = supabaseAdmin();

  const { data, error } = await db
    .from("trips")
    .select("id,start_time,end_time,distance_km,distance_km_user,site_id,purpose,note")
    .eq("user_id", (session as any).userId || (session as any).user_id || (session as any).id)
    .gte("start_time", from)
    .lte("start_time", to)
    .order("start_time", { ascending: true });

  if (error) return json({ error: "DB chyba." }, { status: 500 });

  const sumKm = (data || []).reduce((acc: number, t: any) => {
    const km = t.distance_km_user != null ? toNum(t.distance_km_user, 0) : toNum(t.distance_km, 0);
    return acc + km;
  }, 0);

  return json({ ok: true, day, from, to, sum_km: sumKm, trips: data || [] });
}
