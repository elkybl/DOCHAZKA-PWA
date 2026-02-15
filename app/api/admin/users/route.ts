import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getBearer, json } from "@/lib/http";
import { verifySession } from "@/lib/auth";
import { z } from "zod";
import bcrypt from "bcryptjs";

const userSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2).max(200),
  pin: z.string().min(4).max(8).regex(/^\d+$/).optional(),
  role: z.enum(["admin", "worker"]),
  is_active: z.boolean().default(true),
});

async function requireAdmin(req: NextRequest) {
  const token = getBearer(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return { error: json({ error: "Nepřihlášen." }, { status: 401 }) };
  if (session.role !== "admin") return { error: json({ error: "Jen admin." }, { status: 403 }) };
  return { session };
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("users")
    .select("id,name,role,is_active,created_at")
    .order("created_at", { ascending: false });

  if (error) return json({ error: "DB chyba." }, { status: 500 });
  return json({ users: data || [] });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => null);
  const parsed = userSchema.extend({ pin: z.string().min(4).max(8).regex(/^\d+$/) }).safeParse(body);
  if (!parsed.success) return json({ error: "Neplatná data." }, { status: 400 });

  const pin_hash = await bcrypt.hash(parsed.data.pin, 10);

  const db = supabaseAdmin();
  const { pin, ...rest } = parsed.data;
  const { data, error } = await db
    .from("users")
    .insert({ ...rest, pin_hash })
    .select("id,name,role,is_active,created_at")
    .single();

  if (error) return json({ error: "Nešlo uložit." }, { status: 500 });
  return json({ user: data });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => null);
  const parsed = userSchema.extend({ id: z.string().uuid() }).safeParse(body);
  if (!parsed.success) return json({ error: "Neplatná data." }, { status: 400 });

  const db = supabaseAdmin();
  const { id, pin, ...rest } = parsed.data;

  const update: any = { ...rest };
  if (pin) update.pin_hash = await bcrypt.hash(pin, 10);

  const { data, error } = await db
    .from("users")
    .update(update)
    .eq("id", id)
    .select("id,name,role,is_active,created_at")
    .single();

  if (error) return json({ error: "Nešlo uložit." }, { status: 500 });
  return json({ user: data });
}
