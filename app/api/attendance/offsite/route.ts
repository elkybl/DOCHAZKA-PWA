import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getBearer, json } from "@/lib/http";
import { verifySession } from "@/lib/auth";
import { dayLocalCZNow } from "@/lib/time";
import { findLockForDay } from "@/lib/payroll-locks";
import { approvedDayEditMessage, findApprovedDayReview } from "@/lib/day-reviews";

export async function POST(req: NextRequest) {
  const token = getBearer(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return json({ error: "Nepřihlášen." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const site_id = body?.site_id ? String(body.site_id) : null;
  const day_local = body?.day_local ? String(body.day_local) : null;
  const offsite_reason = (body?.offsite_reason ?? "").toString().trim();
  const offsite_hours = Number(body?.offsite_hours);
  const material_desc = (body?.material_desc ?? "").toString().trim() || null;
  const material_amount = body?.material_amount != null ? Number(body.material_amount) : null;

  if (!offsite_reason) return json({ error: "Doplňte důvod práce mimo stavbu." }, { status: 400 });
  if (!Number.isFinite(offsite_hours) || offsite_hours <= 0) {
    return json({ error: "Doplňte počet hodin, například 1,5." }, { status: 400 });
  }
  if (material_amount != null && (!Number.isFinite(material_amount) || material_amount < 0)) {
    return json({ error: "Částka materiálu není platná." }, { status: 400 });
  }

  const dayOk = !!day_local && /^\d{4}-\d{2}-\d{2}$/.test(day_local);
  const dayFinal = dayOk ? day_local! : dayLocalCZNow();
  const locked = await findLockForDay(dayFinal);
  if (locked) {
    return json(
      { error: `Den ${dayFinal} je v uzamčeném výplatním období ${locked.from_day} – ${locked.to_day}.` },
      { status: 409 }
    );
  }

  const server_time = dayOk ? new Date(`${dayFinal}T12:00:00.000Z`).toISOString() : new Date().toISOString();
  const db = supabaseAdmin();
  const approvedReview = await findApprovedDayReview(db, {
    userId: session.userId,
    day: dayFinal,
    siteId: site_id || null,
  });
  if (approvedReview) {
    return json({ error: approvedDayEditMessage(dayFinal) }, { status: 409 });
  }

  const { error } = await db.from("attendance_events").insert({
    user_id: session.userId,
    site_id: site_id || null,
    type: "OFFSITE",
    server_time,
    day_local: dayFinal,
    offsite_reason,
    offsite_hours,
    material_desc,
    material_amount,
  });

  if (error) return json({ error: `Nešlo uložit práci mimo stavbu: ${error.message}` }, { status: 500 });
  return json({ ok: true });
}
