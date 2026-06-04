import { NextRequest } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase";
import { getBearer, json } from "@/lib/http";
import { verifySession } from "@/lib/auth";
import { findLockForDay } from "@/lib/payroll-locks";

const schema = z.object({
  id: z.string().uuid(),
  note_work: z.string().max(2000).optional(),
  km: z.number().min(0).max(2000).optional(),
  offsite_reason: z.string().max(500).optional(),
  offsite_hours: z.number().min(0).max(24).optional(),
  material_desc: z.string().max(500).optional(),
  material_amount: z.number().min(0).max(200000).optional(),
  programming_hours: z.number().min(0).max(24).optional(),
  programming_note: z.string().max(500).optional(),
});

export async function PATCH(req: NextRequest) {
  const token = getBearer(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return json({ error: "Nepřihlášen." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return json({ error: "Neplatná data." }, { status: 400 });

  const db = supabaseAdmin();

  const { data: row, error: rowErr } = await db
    .from("attendance_events")
    .select("id,user_id,type,is_paid,day_local")
    .eq("id", parsed.data.id)
    .single();

  if (rowErr || !row) return json({ error: "Záznam nenalezen." }, { status: 404 });
  if (row.user_id !== session.userId) return json({ error: "Cizí záznam." }, { status: 403 });
  if (row.is_paid) return json({ error: "Už zaplaceno – nelze upravit." }, { status: 409 });

  if (row.day_local) {
    const locked = await findLockForDay(String(row.day_local));
    if (locked) {
      return json(
        { error: `Den ${row.day_local} je v uzamčeném výplatním období ${locked.from_day} – ${locked.to_day}.` },
        { status: 409 }
      );
    }
  }

  const patch: Record<string, unknown> = {};
  for (const key of ["note_work", "km", "offsite_reason", "offsite_hours", "material_desc", "material_amount"] as const) {
    if (parsed.data[key] !== undefined) patch[key] = parsed.data[key];
  }

  if (parsed.data.programming_hours !== undefined || parsed.data.programming_note !== undefined) {
    const { data: me, error: meErr } = await db
      .from("users")
      .select("id,is_programmer")
      .eq("id", session.userId)
      .maybeSingle();

    if (meErr) return json({ error: "DB chyba (uživatel)." }, { status: 500 });
    const canProg = (me as { is_programmer?: boolean } | null)?.is_programmer === true;

    if (!canProg) return json({ error: "Programování smí upravit jen programátor." }, { status: 403 });
    if (row.type !== "OUT") return json({ error: "Programování lze upravit jen na odchodu." }, { status: 409 });

    if (parsed.data.programming_hours !== undefined) patch.programming_hours = parsed.data.programming_hours;
    if (parsed.data.programming_note !== undefined) patch.programming_note = parsed.data.programming_note;
  }

  if (row.type !== "OUT") delete patch.note_work;
  if (row.type !== "OFFSITE") {
    delete patch.offsite_reason;
    delete patch.offsite_hours;
  }

  const { error } = await db.from("attendance_events").update(patch).eq("id", row.id);
  if (error) return json({ error: "Nešlo uložit." }, { status: 500 });

  return json({ ok: true });
}

