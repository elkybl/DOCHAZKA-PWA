import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getBearer, json } from "@/lib/http";
import { verifySession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const token = getBearer(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return json({ error: "Nepřihlášen." }, { status: 401 });

  const userId = (session as any).userId || (session as any).user_id || (session as any).id;
  const url = new URL(req.url);

  const date = (url.searchParams.get("date") || "").trim(); // YYYY-MM-DD
  const days = date ? 1 : 1;

  // default dnes (UTC-ish), to stačí
  const base = date ? new Date(`${date}T00:00:00.000Z`) : new Date();
  const start = date
    ? new Date(base)
    : new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), 0, 0, 0));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + days);

  const db = supabaseAdmin();

  const { data: trips, error } = await db
    .from("trips")
    .select("id,site_id,purpose,note,start_time,end_time,distance_km,distance_km_user,distance_method")
    .eq("user_id", String(userId))
    .gte("start_time", start.toISOString())
    .lt("start_time", end.toISOString())
    .order("start_time", { ascending: false });

  if (error) return json({ error: "DB chyba." }, { status: 500 });

  // map site names
  const { data: sites } = await db.from("sites").select("id,name");
  const map = new Map<string, string>();
  for (const s of sites || []) map.set(String((s as any).id), String((s as any).name));

  const rows = (trips || []).map((t: any) => ({
    ...t,
    site_name: t.site_id ? map.get(String(t.site_id)) || "—" : "—",
    km_final: t.distance_km_user != null ? Number(t.distance_km_user) : (t.distance_km != null ? Number(t.distance_km) : 0),
    km_source: t.distance_km_user != null ? "manual" : (t.distance_method || null),
  }));

  return json({ rows });
}
