import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getBearer, json } from "@/lib/http";
import { verifySession } from "@/lib/auth";

async function requireAdmin(req: NextRequest) {
  const token = getBearer(req);
  const session = token ? await verifySession(token) : null;
  if (!session || session.role !== "admin") return { error: json({ error: "Jen admin." }, { status: 401 }) };
  return { session };
}

async function getEventForAdmin(id: string) {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("attendance_events")
    .select("id,is_paid,user_id,day_local,type,server_time")
    .eq("id", id)
    .single();
  if (error || !data) return { error: json({ error: "Záznam nenalezen." }, { status: 404 }) };
  return { db, row: data };
}

function buildPatch(body: Record<string, unknown>) {
  const patch: Record<string, unknown> = {};
  if (typeof body.note_work === "string") patch.note_work = body.note_work.trim();
  if (body.km !== undefined) patch.km = body.km === null ? null : Number(body.km) || 0;
  if (body.site_id !== undefined) patch.site_id = body.site_id ? String(body.site_id) : null;
  if (typeof body.material_desc === "string") patch.material_desc = body.material_desc.trim();
  if (body.material_amount !== undefined) patch.material_amount = body.material_amount === null ? null : Number(body.material_amount) || 0;
  if (typeof body.offsite_reason === "string") patch.offsite_reason = body.offsite_reason.trim();
  if (body.offsite_hours !== undefined) patch.offsite_hours = body.offsite_hours === null ? null : Number(body.offsite_hours) || 0;
  if (body.programming_hours !== undefined) patch.programming_hours = body.programming_hours === null ? null : Number(body.programming_hours) || 0;
  if (typeof body.programming_note === "string") patch.programming_note = body.programming_note.trim();
  return patch;
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const { id } = await ctx.params;
  if (!id) return json({ error: "Chybí ID." }, { status: 400 });

  const found = await getEventForAdmin(id);
  if ("error" in found) return found.error;
  if (found.row.is_paid) {
    return json({ error: "Uhrazený záznam je zamčený. Nejprve ho vraťte ve výplatách mezi neuhrazené." }, { status: 409 });
  }

  const { error } = await found.db.from("attendance_events").delete().eq("id", id);
  if (error) return json({ error: "Nešlo smazat záznam." }, { status: 500 });

  console.info("attendance_events.delete", { admin: auth.session.userId, event_id: id, day: found.row.day_local, user_id: found.row.user_id });
  return json({ ok: true });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const { id } = await ctx.params;
  if (!id) return json({ error: "Chybí ID." }, { status: 400 });

  const found = await getEventForAdmin(id);
  if ("error" in found) return found.error;
  if (found.row.is_paid) {
    return json({ error: "Uhrazený záznam je zamčený. Nejprve ho vraťte ve výplatách mezi neuhrazené." }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));
  const patch = buildPatch(body as Record<string, unknown>);
  const { error } = await found.db.from("attendance_events").update(patch).eq("id", id);
  if (error) return json({ error: "Nešlo uložit změny." }, { status: 500 });

  console.info("attendance_events.patch", { admin: auth.session.userId, event_id: id, day: found.row.day_local, user_id: found.row.user_id, patch_keys: Object.keys(patch) });
  return json({ ok: true });
}
