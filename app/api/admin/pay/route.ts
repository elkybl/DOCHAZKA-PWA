import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getBearer, json } from "@/lib/http";
import { verifySession } from "@/lib/auth";
import { z } from "zod";

const schema = z.object({
  user_id: z.string().uuid(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

async function requireAdmin(req: NextRequest) {
  const token = getBearer(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return { error: json({ error: "Nepřihlášen." }, { status: 401 }) };
  if (session.role !== "admin") return { error: json({ error: "Jen admin." }, { status: 403 }) };
  return { session };
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return json({ error: "Neplatná data." }, { status: 400 });

  const db = supabaseAdmin();

  const { error } = await db
    .from("attendance_events")
    .update({
      is_paid: true,
      paid_at: new Date().toISOString(),
      paid_by: auth.session!.userId,
    })
    .eq("user_id", parsed.data.user_id)
    .eq("day_local", parsed.data.day)
    .eq("is_paid", false);

  if (error) return json({ error: `Nešlo označit jako zaplaceno: ${error.message}` }, { status: 500 });
  return json({ ok: true });
}
