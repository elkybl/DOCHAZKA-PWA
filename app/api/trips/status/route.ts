import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getBearer, json } from "@/lib/http";
import { verifySession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const token = getBearer(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return json({ error: "Nepřihlášen." }, { status: 401 });

  const userId = (session as any).userId || (session as any).user_id || (session as any).id;
  const db = supabaseAdmin();

  const { data: open, error } = await db
    .from("trips")
    .select("id,start_time,start_lat,start_lng,purpose,site_id")
    .eq("user_id", String(userId))
    .is("end_time", null)
    .order("start_time", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return json({ error: "DB chyba." }, { status: 500 });

  return json({ open: open || null });
}
