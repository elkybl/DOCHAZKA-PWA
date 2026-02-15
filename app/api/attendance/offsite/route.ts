import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getBearer, json } from "@/lib/http";
import { verifySession } from "@/lib/auth";
import { dayLocalCZNow } from "@/lib/time";

export async function POST(req: NextRequest) {
  const token = getBearer(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return json({ error: "Nepřihlášen." }, { status: 401 });

  const body = await req.json().catch(() => null);

  const site_id = body?.site_id ? String(body.site_id) : null; // může být null/undefined
  const offsite_reason = (body?.offsite_reason ?? "").toString().trim();
  const offsite_hours = Number(body?.offsite_hours);

  const material_desc = (body?.material_desc ?? "").toString().trim() || null;
  const material_amount = body?.material_amount != null ? Number(body.material_amount) : null;

  if (!offsite_reason) return json({ error: "Doplň důvod mimo stavbu." }, { status: 400 });
  if (!Number.isFinite(offsite_hours) || offsite_hours <= 0) return json({ error: "Doplň počet hodin (např. 1.5)." }, { status: 400 });
  if (material_amount != null && (!Number.isFinite(material_amount) || material_amount < 0))
    return json({ error: "Materiál částka je neplatná." }, { status: 400 });

  const db = supabaseAdmin();
  const nowIso = new Date().toISOString();

  const { error } = await db.from("attendance_events").insert({
    user_id: session.userId,
    site_id: site_id || null,
    type: "OFFSITE",
    server_time: nowIso,
    day_local: dayLocalCZNow(),

    offsite_reason,
    offsite_hours,

    material_desc,
    material_amount,
  });

  if (error) return json({ error: `Nešlo uložit mimo stavbu: ${error.message}` }, { status: 500 });

  return json({ ok: true });
}
