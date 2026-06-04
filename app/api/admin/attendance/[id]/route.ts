import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getBearer, json } from "@/lib/http";
import { verifySession } from "@/lib/auth";
import { findLockForDay } from "@/lib/payroll-locks";
import { approvedDayEditMessage, findApprovedDayReview } from "@/lib/day-reviews";

async function requireAdmin(req: NextRequest) {
  const token = getBearer(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return { error: json({ error: "Nepřihlášen." }, { status: 401 }) };
  if (session.role !== "admin") return { error: json({ error: "Jen admin." }, { status: 403 }) };
  return { session };
}

function extractIdFromPath(req: NextRequest) {
  const parts = req.nextUrl.pathname.split("/").filter(Boolean);
  return parts[parts.length - 1] || "";
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const p = await context.params;
  let id = p?.id;
  if (!id) id = extractIdFromPath(req);

  if (!id || !isUuid(id)) {
    return json({ error: `Chybí nebo je špatné ID záznamu. URL: ${req.nextUrl.pathname}` }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: row, error: rowError } = await db.from("attendance_events").select("id,is_paid,user_id,site_id,day_local").eq("id", id).single();
  if (rowError || !row) return json({ error: "Záznam nenalezen." }, { status: 404 });
  if (row.is_paid) {
    return json({ error: "Uhrazený záznam je zamčený. Nejprve ho vraťte ve výplatách mezi neuhrazené." }, { status: 409 });
  }
  if (row.day_local) {
    const approvedReview = await findApprovedDayReview(db, {
      userId: String(row.user_id),
      day: String(row.day_local),
      siteId: row.site_id ? String(row.site_id) : null,
    });
    if (approvedReview) {
      return json({ error: approvedDayEditMessage(String(row.day_local), "admin") }, { status: 409 });
    }
    const locked = await findLockForDay(String(row.day_local));
    if (locked) {
      return json(
        { error: `Den ${row.day_local} je v uzamčeném výplatním období ${locked.from_day} – ${locked.to_day}.` },
        { status: 409 }
      );
    }
  }

  const { error } = await db.from("attendance_events").delete().eq("id", id);
  if (error) {
    console.error("DELETE attendance error:", error);
    return json({ error: `Nejde smazat záznam: ${error.message}` }, { status: 500 });
  }

  console.info("attendance.delete", { admin: auth.session.userId, event_id: id, day: row.day_local, user_id: row.user_id });
  return json({ ok: true });
}
