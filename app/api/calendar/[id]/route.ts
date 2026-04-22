import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getBearer, json } from "@/lib/http";
import { verifySession } from "@/lib/auth";
import { calendarUpdateSchema, isWorkRelated, normalizeCalendarPayload } from "@/lib/calendar";

type Params = { params: Promise<{ id: string }> };

async function requireSession(req: NextRequest) {
  const token = getBearer(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return { error: json({ error: "Nepřihlášen." }, { status: 401 }) };
  return { session };
}

function hoursBetween(startIso: string | null, endIso: string | null) {
  if (!startIso || !endIso) return null;
  const diff = (new Date(endIso).getTime() - new Date(startIso).getTime()) / 3600000;
  if (!Number.isFinite(diff) || diff < 0) return null;
  return Math.round(diff * 100) / 100;
}

export async function PATCH(req: NextRequest, ctx: Params) {
  const auth = await requireSession(req);
  if (auth.error) return auth.error;
  const session = auth.session;
  const { id } = await ctx.params;

  const body = await req.json().catch(() => null);
  const parsed = calendarUpdateSchema.safeParse(body);
  if (!parsed.success) return json({ error: "Neplatná data kalendáře." }, { status: 400 });

  const db = supabaseAdmin();
  const existing = await db.from("calendar_items").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
  if (existing.error) return json({ error: "DB chyba." }, { status: 500 });
  if (!existing.data) return json({ error: "Položka neexistuje." }, { status: 404 });
  if (session.role !== "admin" && existing.data.user_id !== session.userId) {
    return json({ error: "Nemáš oprávnění k této položce." }, { status: 403 });
  }

  const data = parsed.data;
  const admin = session.role === "admin";
  const patch: Record<string, unknown> = {};

  const editableByOwner = ["type", "title", "date", "start_time", "end_time", "all_day", "location", "notes", "planned_hours", "attendance_note"] as const;
  const editableByAdmin = [...editableByOwner, "user_id", "actual_hours", "status", "attendance_status"] as const;
  const keys = admin ? editableByAdmin : editableByOwner;
  for (const key of keys) {
    if (key in data) patch[key] = data[key as keyof typeof data];
  }

  if ("seen_confirmed" in data) {
    if (existing.data.user_id !== session.userId) {
      return json({ error: "Viděno může potvrdit jen přiřazený pracovník." }, { status: 403 });
    }
    patch.seen_confirmed = !!data.seen_confirmed;
    patch.seen_at = data.seen_confirmed ? new Date().toISOString() : null;
  }

  if (isWorkRelated(String(existing.data.type)) || (data.type && isWorkRelated(data.type))) {
    if ("check_in_at" in data) {
      patch.check_in_at = data.check_in_at || new Date().toISOString();
      patch.attendance_status = "checked_in";
    }
    if ("check_out_at" in data) {
      const out = data.check_out_at || new Date().toISOString();
      patch.check_out_at = out;
      patch.attendance_status = "confirmed";
      patch.status = "done";
      const actual = hoursBetween(String(existing.data.check_in_at || patch.check_in_at || ""), out);
      if (actual != null) patch.actual_hours = actual;
    }
  }

  if (admin && data.approved === true) {
    patch.approved_by = session.userId;
    patch.approved_at = new Date().toISOString();
    patch.attendance_status = "confirmed";
  } else if (admin && data.approved === false) {
    patch.approved_by = null;
    patch.approved_at = null;
  }

  const normalized = normalizeCalendarPayload({
    ...patch,
    date: String(patch.date || existing.data.date),
    start_time: (patch.start_time as string | null | undefined) ?? existing.data.start_time,
    end_time: (patch.end_time as string | null | undefined) ?? existing.data.end_time,
    planned_hours: patch.planned_hours as number | null | undefined,
    all_day: (patch.all_day as boolean | undefined) ?? existing.data.all_day,
    updated_by: session.userId,
    updated_at: new Date().toISOString(),
  });

  const update = await db.from("calendar_items").update(normalized).eq("id", id).select("*").single();
  if (update.error || !update.data) return json({ error: "Nešlo uložit změny." }, { status: 500 });

  return json({ item: update.data });
}

export async function DELETE(req: NextRequest, ctx: Params) {
  const auth = await requireSession(req);
  if (auth.error) return auth.error;
  const session = auth.session;
  const { id } = await ctx.params;

  const db = supabaseAdmin();
  const existing = await db.from("calendar_items").select("id,user_id").eq("id", id).is("deleted_at", null).maybeSingle();
  if (existing.error) return json({ error: "DB chyba." }, { status: 500 });
  if (!existing.data) return json({ error: "Položka neexistuje." }, { status: 404 });
  if (session.role !== "admin" && existing.data.user_id !== session.userId) {
    return json({ error: "Nemáš oprávnění k této položce." }, { status: 403 });
  }

  const { error } = await db
    .from("calendar_items")
    .update({ deleted_at: new Date().toISOString(), deleted_by: session.userId, updated_by: session.userId, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return json({ error: "Nešlo smazat položku." }, { status: 500 });
  return json({ ok: true });
}
