import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getBearer, json } from "@/lib/http";
import { verifySession } from "@/lib/auth";

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const token = getBearer(req);
  const session = token ? await verifySession(token) : null;
  if (!session || (session as any).role !== "admin") return json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  if (!id) return json({ error: "Chybí ID." }, { status: 400 });

  const db = supabaseAdmin();
  const { error } = await db.from("attendance_events").delete().eq("id", id);
  if (error) return json({ error: "Nešlo smazat záznam." }, { status: 500 });

  return json({ ok: true });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const token = getBearer(req);
  const session = token ? await verifySession(token) : null;
  if (!session || (session as any).role !== "admin") return json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  if (!id) return json({ error: "Chybí ID." }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const patch: any = {};

  if (typeof body.note_work === "string") patch.note_work = body.note_work.trim();
  if (body.km !== undefined) patch.km = body.km === null ? null : Number(body.km) || 0;

  if (typeof body.material_desc === "string") patch.material_desc = body.material_desc.trim();
  if (body.material_amount !== undefined)
    patch.material_amount = body.material_amount === null ? null : Number(body.material_amount) || 0;

  if (typeof body.offsite_reason === "string") patch.offsite_reason = body.offsite_reason.trim();
  if (body.offsite_hours !== undefined)
    patch.offsite_hours = body.offsite_hours === null ? null : Number(body.offsite_hours) || 0;

  const db = supabaseAdmin();
  const { error } = await db.from("attendance_events").update(patch).eq("id", id);
  if (error) return json({ error: "Nešlo uložit změny." }, { status: 500 });

  return json({ ok: true });
}
