import { NextRequest } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase";
import { getBearer, json } from "@/lib/http";
import { verifySession } from "@/lib/auth";
import { findLockForDay } from "@/lib/payroll-locks";
import { approvedDayEditMessage, findApprovedDayReview } from "@/lib/day-reviews";
import { getLatestOpenShift } from "@/lib/open-shift";

const schema = z.object({
  reported_left_at: z.string().min(2).max(50),
  forget_reason: z.string().min(3).max(500),
  note_work: z.string().min(3).max(2000),
  km: z.number().min(0).max(2000).optional(),
  material_desc: z.string().max(500).optional(),
  material_amount: z.number().min(0).max(200000).optional(),
});

export async function POST(req: NextRequest) {
  const token = getBearer(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return json({ error: "Nepřihlášen." }, { status: 401 });

  const userId = session.userId;
  const db = supabaseAdmin();
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return json({ error: "Neplatná data žádosti." }, { status: 400 });

  let openShift: { site_id: string | null; server_time: string; day_local: string | null } | null = null;
  try {
    openShift = await getLatestOpenShift(db, userId);
  } catch (error: unknown) {
    return json({ error: error instanceof Error ? error.message : "DB chyba." }, { status: 500 });
  }
  if (!openShift) {
    return json({ error: "Nemáte otevřenou směnu." }, { status: 400 });
  }

  const dayLocal = String(openShift.day_local || openShift.server_time.slice(0, 10));
  const approvedReview = await findApprovedDayReview(db, {
    userId,
    day: dayLocal,
    siteId: openShift.site_id ?? null,
  });
  if (approvedReview) {
    return json({ error: approvedDayEditMessage(dayLocal) }, { status: 409 });
  }

  const locked = await findLockForDay(dayLocal);
  if (locked) {
    return json(
      { error: `Den ${dayLocal} je v uzamčeném výplatním období ${locked.from_day} – ${locked.to_day}.` },
      { status: 409 }
    );
  }

  const { data: existing } = await db
    .from("attendance_close_requests")
    .select("id,status")
    .eq("user_id", userId)
    .eq("status", "pending")
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    return json({ error: "Už máte odeslanou žádost o doplnění odchodu." }, { status: 400 });
  }

  const p = parsed.data;
  const ins = await db.from("attendance_close_requests").insert({
    user_id: userId,
    site_id: openShift.site_id ?? null,
    in_time: openShift.server_time,
    reported_left_at: p.reported_left_at,
    forget_reason: p.forget_reason,
    note_work: p.note_work,
    km: p.km ?? null,
    material_desc: p.material_desc ?? null,
    material_amount: p.material_amount ?? null,
  });

  if (ins.error) return json({ error: "Nešlo odeslat žádost." }, { status: 500 });
  return json({ ok: true });
}
