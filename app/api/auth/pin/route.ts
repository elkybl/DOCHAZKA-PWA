import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/lib/supabase";
import { pinLoginSchema } from "@/lib/validators";
import { json } from "@/lib/http";
import { signSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = pinLoginSchema.safeParse(body);
  if (!parsed.success) return json({ error: "Neplatný PIN." }, { status: 400 });

  const pin = parsed.data.pin;
  const db = supabaseAdmin();

  const { data: users, error } = await db
    .from("users")
    .select("id,name,pin_hash,role,is_active,is_programmer")
    .eq("is_active", true);

  if (error) return json({ error: "DB chyba." }, { status: 500 });

  for (const u of users || []) {
    if (await bcrypt.compare(pin, u.pin_hash)) {
      const token = await signSession({ userId: u.id, role: u.role, name: u.name });
      return json({ token, user: { id: u.id, name: u.name, role: u.role, is_programmer: (u as any).is_programmer || false } });
    }
  }

  return json({ error: "Špatný PIN." }, { status: 401 });
}
