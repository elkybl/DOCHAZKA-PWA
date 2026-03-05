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
  google_sheet_url: z.string().max(500).optional().nullable(),
  is_programmer: z.boolean().optional(),
  programming_rate: z.number().min(0).max(200000).optional().nullable(),
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
  const attempt = await db
    .from("users")
    .select("id,name,role,is_active,google_sheet_url,is_programmer,programming_rate,created_at")
    .order("created_at", { ascending: false });

  if (!attempt.error) return json({ users: attempt.data || [] });

  // fallback pro DB bez google_sheet_url
  const fallback = await db
    .from("users")
    .select("id,name,role,is_active,created_at")
    .order("created_at", { ascending: false });

  if (fallback.error) return json({ error: "DB chyba." }, { status: 500 });
  const rows = (fallback.data || []).map((u: any) => ({ ...u, google_sheet_url: null, is_programmer: false, programming_rate: null }));
  return json({ users: rows });
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

  const payload: any = { ...rest, pin_hash };

  // 1) preferujeme insert i se sloupcem google_sheet_url
  const attempt = await db
    .from("users")
    .insert(payload)
    .select("id,name,role,is_active,google_sheet_url,is_programmer,programming_rate,created_at")
    .single();

  if (!attempt.error && attempt.data) return json({ user: attempt.data });

  // 2) fallback pro DB bez google_sheet_url: zopakuj insert bez toho sloupce
  if (attempt.error && String((attempt.error as any).message || "").includes("google_sheet_url")) {
    delete payload.google_sheet_url;
    delete payload.is_programmer;
    delete payload.programming_rate;
    const fbIns = await db
      .from("users")
      .insert(payload)
      .select("id,name,role,is_active,created_at")
      .single();

    if (fbIns.error || !fbIns.data) return json({ error: "Nešlo uložit." }, { status: 500 });
    return json({ user: { ...fbIns.data, google_sheet_url: null, is_programmer: false, programming_rate: null } });
  }

  return json({ error: "Nešlo uložit." }, { status: 500 });
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

  const attempt = await db
    .from("users")
    .update(update)
    .eq("id", id)
    .select("id,name,role,is_active,google_sheet_url,is_programmer,programming_rate,created_at")
    .single();

  if (!attempt.error && attempt.data) return json({ user: attempt.data });

  // fallback pro DB bez google_sheet_url
  if (attempt.error && String((attempt.error as any).message || "").includes("google_sheet_url")) {
    delete update.google_sheet_url;
    delete update.is_programmer;
    delete update.programming_rate;
    const fbUpd = await db
      .from("users")
      .update(update)
      .eq("id", id)
      .select("id,name,role,is_active,created_at")
      .single();

    if (fbUpd.error || !fbUpd.data) return json({ error: "Nešlo uložit." }, { status: 500 });
    return json({ user: { ...fbUpd.data, google_sheet_url: null, is_programmer: false, programming_rate: null } });
  }

  return json({ error: "Nešlo uložit." }, { status: 500 });
}
