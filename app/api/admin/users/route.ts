import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getBearer, json } from "@/lib/http";
import { verifySession } from "@/lib/auth";
import { z } from "zod";
import bcrypt from "bcryptjs";

const userSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2).max(200),
  email: z.string().email().max(200).optional().nullable(),
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

type SelectRow = {
  id: string;
  name: string;
  email?: string | null;
  role: "admin" | "worker";
  is_active: boolean;
  google_sheet_url?: string | null;
  is_programmer?: boolean | null;
  programming_rate?: number | null;
  created_at: string;
};

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const db = supabaseAdmin();
  const attempt = await db
    .from("users")
    .select("id,name,email,role,is_active,google_sheet_url,is_programmer,programming_rate,created_at")
    .order("created_at", { ascending: false });

  if (!attempt.error) return json({ users: (attempt.data || []) as SelectRow[] });

  const fallback = await db.from("users").select("id,name,role,is_active,created_at").order("created_at", { ascending: false });
  if (fallback.error) return json({ error: "DB chyba." }, { status: 500 });

  const rows = (fallback.data || []).map((u: Record<string, unknown>) => ({
    ...u,
    email: null,
    google_sheet_url: null,
    is_programmer: false,
    programming_rate: null,
  }));
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
  const payload: Record<string, unknown> = { ...rest, pin_hash };

  const attempt = await db
    .from("users")
    .insert(payload)
    .select("id,name,email,role,is_active,google_sheet_url,is_programmer,programming_rate,created_at")
    .single();

  if (!attempt.error && attempt.data) return json({ user: attempt.data });

  if (attempt.error && String(attempt.error.message || "").includes("google_sheet_url")) {
    delete payload.google_sheet_url;
    delete payload.is_programmer;
    delete payload.programming_rate;
    if (String(attempt.error.message || "").includes("email")) delete payload.email;

    const fallbackInsert = await db.from("users").insert(payload).select("id,name,role,is_active,created_at").single();
    if (fallbackInsert.error || !fallbackInsert.data) return json({ error: "Nešlo uložit." }, { status: 500 });

    return json({
      user: {
        ...fallbackInsert.data,
        email: null,
        google_sheet_url: null,
        is_programmer: false,
        programming_rate: null,
      },
    });
  }

  if (attempt.error && String(attempt.error.message || "").includes("email")) {
    delete payload.email;
    const fallbackInsert = await db
      .from("users")
      .insert(payload)
      .select("id,name,role,is_active,google_sheet_url,is_programmer,programming_rate,created_at")
      .single();
    if (fallbackInsert.error || !fallbackInsert.data) return json({ error: "Nešlo uložit." }, { status: 500 });
    return json({ user: { ...fallbackInsert.data, email: null } });
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
  const update: Record<string, unknown> = { ...rest };
  if (pin) update.pin_hash = await bcrypt.hash(pin, 10);

  const attempt = await db
    .from("users")
    .update(update)
    .eq("id", id)
    .select("id,name,email,role,is_active,google_sheet_url,is_programmer,programming_rate,created_at")
    .single();

  if (!attempt.error && attempt.data) return json({ user: attempt.data });

  if (attempt.error && String(attempt.error.message || "").includes("google_sheet_url")) {
    delete update.google_sheet_url;
    delete update.is_programmer;
    delete update.programming_rate;
    if (String(attempt.error.message || "").includes("email")) delete update.email;

    const fallbackUpdate = await db.from("users").update(update).eq("id", id).select("id,name,role,is_active,created_at").single();
    if (fallbackUpdate.error || !fallbackUpdate.data) return json({ error: "Nešlo uložit." }, { status: 500 });

    return json({
      user: {
        ...fallbackUpdate.data,
        email: null,
        google_sheet_url: null,
        is_programmer: false,
        programming_rate: null,
      },
    });
  }

  if (attempt.error && String(attempt.error.message || "").includes("email")) {
    delete update.email;
    const fallbackUpdate = await db
      .from("users")
      .update(update)
      .eq("id", id)
      .select("id,name,role,is_active,google_sheet_url,is_programmer,programming_rate,created_at")
      .single();
    if (fallbackUpdate.error || !fallbackUpdate.data) return json({ error: "Nešlo uložit." }, { status: 500 });
    return json({ user: { ...fallbackUpdate.data, email: null } });
  }

  return json({ error: "Nešlo uložit." }, { status: 500 });
}
