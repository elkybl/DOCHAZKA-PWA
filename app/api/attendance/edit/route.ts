import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getBearer, json } from "@/lib/http";
import { verifySession } from "@/lib/auth";
import { z } from "zod";

const schema = z.object({
  id: z.string().uuid(),
  note_work: z.string().max(2000).optional(),
  km: z.number().min(0).max(2000).optional(),
  offsite_reason: z.string().max(500).optional(),
  offsite_hours: z.number().min(0).max(24).optional(),
  material_desc: z.string().max(500).optional(),
  material_amount: z.number().min(0).max(200000).optional(),
});

export async function PATCH(req: NextRequest) {
  const token = getBearer(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return json({ error: "Nepřihlášen." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return json({ error: "Neplatná data." }, { status: 400 });

  const db = supabaseAdmin();

  // Zaměstnanec smí editovat jen své záznamy a jen pokud nejsou zaplacené
  const { data: row, error: rowErr } = await db
    .from("attendance_events")
    .select("id,user_id,type,is_paid")
    .eq("id", parsed.data.id)
    .single();

  if (rowErr || !row) return json({ error: "Záznam nenalezen." }, { status: 404 });
  if (row.user_id !== session.userId) return json({ error: "Cizí záznam." }, { status: 403 });
  if (row.is_paid) return json({ error: "Už zaplaceno – nelze upravit." }, { status: 409 });

  const patch: any = {};
  for (const k of ["note_work","km","offsite_reason","offsite_hours","material_desc","material_amount"] as const) {
    if (parsed.data[k] !== undefined) patch[k] = parsed.data[k];
  }

  // drobná logika: materiál povol jen na OUT/OFFSITE, práce jen na OUT, offsite jen na OFFSITE
  if (row.type !== "OUT") delete patch.note_work;
  if (row.type !== "OFFSITE") { delete patch.offsite_reason; delete patch.offsite_hours; }

  const { error } = await db.from("attendance_events").update(patch).eq("id", row.id);
  if (error) return json({ error: "Nešlo uložit." }, { status: 500 });

  return json({ ok: true });
}
