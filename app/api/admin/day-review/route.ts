import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getBearer, json } from "@/lib/http";
import { verifySession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

async function requireAdmin(req: NextRequest) {
  const token = getBearer(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return { error: json({ error: "Nepřihlášen." }, { status: 401 }) };
  if (session.role !== "admin") return { error: json({ error: "Jen admin." }, { status: 403 }) };
  return { session };
}

function reviewKey(userId: string, day: string, siteId?: string | null) {
  return `${userId}__${day}__${siteId || ""}`;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const url = new URL(req.url);
  const day = url.searchParams.get("day");
  const userId = url.searchParams.get("user_id");
  const siteId = url.searchParams.get("site_id");
  if (!day || !userId) return json({ error: "Chybí den nebo pracovník." }, { status: 400 });

  const db = supabaseAdmin();
  let reviewQuery = db.from("attendance_day_reviews").select("*").eq("user_id", userId).eq("day", day);
  reviewQuery = siteId ? reviewQuery.eq("site_id", siteId) : reviewQuery.is("site_id", null);
  const reviewRes = await reviewQuery.maybeSingle();

  let auditQuery = db
    .from("attendance_audit_log")
    .select("*")
    .eq("user_id", userId)
    .eq("day", day)
    .order("created_at", { ascending: false })
    .limit(20);
  auditQuery = siteId ? auditQuery.eq("site_id", siteId) : auditQuery.is("site_id", null);
  const auditRes = await auditQuery;

  return json({ review: reviewRes.data || null, audit: auditRes.data || [], key: reviewKey(userId, day, siteId) });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => null);
  const userId = body?.user_id;
  const day = body?.day;
  const siteId = body?.site_id || null;
  const status = body?.status;
  const note = typeof body?.note === "string" ? body.note.trim() : null;

  if (!userId || !day || !["pending", "approved", "returned"].includes(status)) {
    return json({ error: "Neplatná data schválení." }, { status: 400 });
  }

  const db = supabaseAdmin();
  const payload = {
    user_id: userId,
    day,
    site_id: siteId,
    status,
    note,
    approved_by: status === "approved" ? auth.session.userId : null,
    approved_at: status === "approved" ? new Date().toISOString() : null,
    updated_by: auth.session.userId,
    updated_at: new Date().toISOString(),
  };

  const upsert = await db
    .from("attendance_day_reviews")
    .upsert(payload, { onConflict: "user_id,day,site_id" })
    .select("*")
    .single();

  if (upsert.error) return json({ error: "Nešlo uložit stav dne." }, { status: 500 });

  await writeAuditLog({
    entity_type: "attendance_day_review",
    entity_id: reviewKey(userId, day, siteId),
    action: status === "approved" ? "approve_day" : status === "returned" ? "return_day" : "mark_pending",
    actor_user_id: auth.session.userId,
    user_id: userId,
    site_id: siteId,
    day,
    detail: { note, status },
  });

  return json({ review: upsert.data });
}
