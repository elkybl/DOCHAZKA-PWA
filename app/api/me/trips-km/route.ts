import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getBearer, json } from "@/lib/http";
import { verifySession } from "@/lib/auth";
import { czLocalToUtcDate } from "@/lib/time";

function toNum(v: any, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

export async function GET(req: NextRequest) {
  const token = getBearer(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return json({ error: "Nepřihlášen." }, { status: 401 });

  const url = new URL(req.url);
  const day = (url.searchParams.get("day") || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return json({ error: "Chybí nebo neplatný parametr day (YYYY-MM-DD)." }, { status: 400 });
  }

  const [y, m, d] = day.split("-").map((x) => Number(x));
  const from = czLocalToUtcDate({ y, m, d, hh: 0, mm: 0, ss: 0 }).toISOString();
  const to = czLocalToUtcDate({ y, m, d, hh: 23, mm: 59, ss: 59 }).toISOString();

  const db = supabaseAdmin();
  const userId = (session as any).userId as string;

  const { data: trips, error } = await db
    .from("trips")
    .select("distance_km,distance_km_user,start_time")
    .eq("user_id", userId)
    .gte("start_time", from)
    .lte("start_time", to);

  if (error) return json({ error: `DB chyba (trips): ${error.message}` }, { status: 500 });

  let km = 0;
  for (const t of (trips || []) as any[]) {
    km += toNum(t.distance_km_user ?? t.distance_km, 0);
  }

  return json({ day, km: Math.round(km * 10) / 10 });
}
