import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getBearer, json } from "@/lib/http";
import { verifySession } from "@/lib/auth";
import { z } from "zod";

const siteSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2).max(200),
  address: z.string().max(400).optional().nullable(),
  lat: z.number(),
  lng: z.number(),
  radius_m: z.number().int().min(50).max(3000),
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
  const { data, error } = await db.from("sites").select("*").order("created_at", { ascending: false });
  if (error) return json({ error: "DB chyba." }, { status: 500 });
  return json({ sites: data || [] });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => null);
  const parsed = siteSchema.safeParse(body);
  if (!parsed.success) return json({ error: "Neplatná data." }, { status: 400 });

  const db = supabaseAdmin();
  const { data, error } = await db.from("sites").insert(parsed.data).select("*").single();
  if (error) return json({ error: "Nešlo uložit." }, { status: 500 });
  return json({ site: data });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => null);
  const parsed = siteSchema.extend({ id: z.string().uuid() }).safeParse(body);
  if (!parsed.success) return json({ error: "Neplatná data." }, { status: 400 });

  const db = supabaseAdmin();
  const { id, ...rest } = parsed.data;
  const { data, error } = await db.from("sites").update(rest).eq("id", id).select("*").single();
  if (error) return json({ error: "Nešlo uložit." }, { status: 500 });
  return json({ site: data });
}
