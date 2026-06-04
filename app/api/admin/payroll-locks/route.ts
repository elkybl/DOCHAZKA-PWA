import { NextRequest } from "next/server";
import { z } from "zod";
import { verifySession } from "@/lib/auth";
import { getBearer, json } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase";
import { hasLockedOverlap, listPayrollLocks } from "@/lib/payroll-locks";

const createSchema = z.object({
  from_day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to_day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().max(500).optional().nullable(),
});

const deleteSchema = z.object({
  id: z.string().uuid(),
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

  try {
    const locks = await listPayrollLocks();
    return json({ locks });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Nepodařilo se načíst uzamčení období." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return json({ error: "Neplatná data." }, { status: 400 });

  if (parsed.data.from_day > parsed.data.to_day) {
    return json({ error: "Datum Od musí být dříve nebo stejně jako Do." }, { status: 400 });
  }

  try {
    const overlap = await hasLockedOverlap(parsed.data.from_day, parsed.data.to_day);
    if (overlap) {
      return json(
        {
          error: `Tohle období už zasahuje do uzamčení ${overlap.from_day} – ${overlap.to_day}.`,
        },
        { status: 409 }
      );
    }

    const db = supabaseAdmin();
    const { error } = await db.from("attendance_payroll_locks").insert({
      from_day: parsed.data.from_day,
      to_day: parsed.data.to_day,
      note: parsed.data.note?.trim() || null,
      closed_by: auth.session.userId,
    });

    if (error) return json({ error: `Nepodařilo se uzamknout období: ${error.message}` }, { status: 500 });

    const locks = await listPayrollLocks();
    return json({ ok: true, locks });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Nepodařilo se uzamknout období." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => null);
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) return json({ error: "Chybí ID uzamčení." }, { status: 400 });

  const db = supabaseAdmin();
  const { error } = await db.from("attendance_payroll_locks").delete().eq("id", parsed.data.id);
  if (error) return json({ error: `Nepodařilo se zrušit uzamčení: ${error.message}` }, { status: 500 });

  try {
    const locks = await listPayrollLocks();
    return json({ ok: true, locks });
  } catch (error) {
    return json({ ok: true, locks: [], warning: error instanceof Error ? error.message : undefined });
  }
}

