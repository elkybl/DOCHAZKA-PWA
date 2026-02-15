import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { json } from "@/lib/http";

export async function GET(req: NextRequest) {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("sites")
    .select("id,name,address,lat,lng,radius_m,is_active")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) return json({ error: "DB chyba." }, { status: 500 });
  return json({ sites: data || [] });
}
