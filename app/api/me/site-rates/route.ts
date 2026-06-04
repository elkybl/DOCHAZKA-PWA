import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getBearer, json } from "@/lib/http";
import { verifySession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const token = getBearer(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return json({ error: "Nepřihlášen." }, { status: 401 });

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("user_site_rates")
    .select("site_id,hourly_rate,km_rate,programming_rate,updated_at")
    .eq("user_id", session.userId);

  if (error) return json({ error: "DB chyba." }, { status: 500 });
  return json({ rates: data || [] });
}

export async function PATCH() {
  return json({ error: "Sazby pro stavby se teď spravují přes administraci a historii sazeb." }, { status: 403 });
}
