import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import bcrypt from "bcryptjs";
import { json } from "@/lib/http";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const name = body?.name || "Admin";
  const pin = body?.pin || "1234";

  const db = supabaseAdmin();
  const pin_hash = await bcrypt.hash(pin, 10);

  const { data, error } = await db
    .from("users")
    .insert({ name, pin_hash, role: "admin", is_active: true })
    .select("id,name,role,is_active")
    .single();

  if (error) return json({ error: "Nešlo vytvořit admina (možná už existuje)." }, { status: 500 });
  return json({ user: data, pin });
}
