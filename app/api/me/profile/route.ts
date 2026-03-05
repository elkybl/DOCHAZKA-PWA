import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getBearer, json } from "@/lib/http";
import { verifySession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const token = getBearer(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return json({ error: "Nepřihlášen." }, { status: 401 });

  const db = supabaseAdmin();
  // NOTE: google_sheet_url je volitelný sloupec (může ještě neexistovat).
  const attempt = await db
    .from("users")
    .select("id,name,role,google_sheet_url,is_programmer,programming_rate")
    .eq("id", session.userId)
    .single();

  if (!attempt.error && attempt.data) return json({ user: attempt.data });

  const fallback = await db
    .from("users")
    .select("id,name,role,is_programmer,programming_rate")
    .eq("id", session.userId)
    .single();

  if (fallback.error || !fallback.data) return json({ error: "Uživatel nenalezen." }, { status: 404 });
  return json({ user: { ...fallback.data, google_sheet_url: null } });
}
