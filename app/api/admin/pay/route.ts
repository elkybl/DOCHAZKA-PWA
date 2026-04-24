import { NextRequest } from "next/server";
import { z } from "zod";
import { verifySession } from "@/lib/auth";
import { getBearer, json } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase";

const singleSchema = z.object({
  user_id: z.string().uuid(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const bulkSchema = z.object({
  user_id: z.string().uuid(),
  site_id: z.string().uuid().nullable().optional(),
  from_day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to_day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
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
  const db = supabaseAdmin();

  const bulk = bulkSchema.safeParse(body);
  if (bulk.success) {
    let q = db
      .from("attendance_events")
      .update({
        is_paid: true,
        paid_at: new Date().toISOString(),
        paid_by: auth.session!.userId,
      })
      .eq("user_id", bulk.data.user_id)
      .gte("day_local", bulk.data.from_day)
      .lte("day_local", bulk.data.to_day)
      .eq("is_paid", false);

    if (bulk.data.site_id) q = q.eq("site_id", bulk.data.site_id);

    const { error } = await q;
    if (error) return json({ error: `Nešlo označit jako zaplacené: ${error.message}` }, { status: 500 });
    return json({ ok: true, mode: "bulk" });
  }

  const parsed = singleSchema.safeParse(body);
  if (!parsed.success) return json({ error: "Neplatná data." }, { status: 400 });

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

  if (error) return json({ error: `Nešlo označit jako zaplacené: ${error.message}` }, { status: 500 });
  return json({ ok: true, mode: "single" });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => null);
  const db = supabaseAdmin();

  const bulk = bulkSchema.safeParse(body);
  if (bulk.success) {
    let q = db
      .from("attendance_events")
      .update({
        is_paid: false,
        paid_at: null,
        paid_by: null,
      })
      .eq("user_id", bulk.data.user_id)
      .gte("day_local", bulk.data.from_day)
      .lte("day_local", bulk.data.to_day)
      .eq("is_paid", true);

    if (bulk.data.site_id) q = q.eq("site_id", bulk.data.site_id);

    const { error } = await q;
    if (error) return json({ error: `Nešlo vrátit úhradu: ${error.message}` }, { status: 500 });
    return json({ ok: true, mode: "bulk" });
  }

  const parsed = singleSchema.safeParse(body);
  if (!parsed.success) return json({ error: "Neplatná data." }, { status: 400 });

  const { error } = await db
    .from("attendance_events")
    .update({
      is_paid: false,
      paid_at: null,
      paid_by: null,
    })
    .eq("user_id", parsed.data.user_id)
    .eq("day_local", parsed.data.day)
    .eq("is_paid", true);

  if (error) return json({ error: `Nešlo vrátit úhradu: ${error.message}` }, { status: 500 });
  return json({ ok: true, mode: "single" });
}
