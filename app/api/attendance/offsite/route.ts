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

  // optional manual day/time
  const day_local = (body?.day_local ?? "").toString().trim(); // YYYY-MM-DD
  const time_from = (body?.time_from ?? "").toString().trim(); // HH:MM
  const time_to = (body?.time_to ?? "").toString().trim(); // HH:MM

  let offsite_hours = Number(body?.offsite_hours);

  const material_desc = (body?.material_desc ?? "").toString().trim() || null;
  const material_amount = body?.material_amount != null ? Number(body.material_amount) : null;

  if (!offsite_reason) return json({ error: "Doplň důvod mimo stavbu." }, { status: 400 });

  // If manual range provided, compute hours from it (ceil to 0.5 is not needed here; user enters time)
  if (day_local && time_from && time_to) {
    const m = (t: string) => {
      const [hh, mm] = t.split(":").map((x) => Number(x));
      if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
      return hh * 60 + mm;
    };
    const a = m(time_from);
    const b = m(time_to);
    if (a == null || b == null) return json({ error: "Neplatný čas (HH:MM)." }, { status: 400 });
    const diff = b - a;
    if (diff <= 0) return json({ error: "Čas 'Do' musí být větší než 'Od'." }, { status: 400 });
    offsite_hours = diff / 60;
  }

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
    // allow overriding day_local for manual backfill
    day_local: day_local || dayLocalCZNow(),

    offsite_reason,
    offsite_hours,

    material_desc,
    material_amount,
  });

  if (error) return json({ error: `Nešlo uložit mimo stavbu: ${error.message}` }, { status: 500 });

  return json({ ok: true });
}
