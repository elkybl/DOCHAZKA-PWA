import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getBearer, json } from "@/lib/http";
import { verifySession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { buildDayLink, sendNotification } from "@/lib/notify";

async function requireAdmin(req: NextRequest) {
  const token = getBearer(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return { error: json({ error: "Nepřihlášen." }, { status: 401 }) };
  if (session.role !== "admin") return { error: json({ error: "Jen admin." }, { status: 403 }) };
  return { session };
}

function reviewKey(userId: string, day: string, siteId?: string | null) {
  return `${day}__${userId}__${siteId || ""}`;
}

function missingReviewTableMessage(message: string) {
  return message.includes("attendance_day_reviews") || message.includes("attendance_audit_log");
}

async function loadUserProfile(userId: string) {
  const db = supabaseAdmin();
  const userRes = await db.from("users").select("id,name,email").eq("id", userId).maybeSingle();
  return userRes.data || null;
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
  const reviewRes = await reviewQuery.order("updated_at", { ascending: false }).limit(1);

  if (reviewRes.error && missingReviewTableMessage(reviewRes.error.message || "")) {
    return json({ error: "V databázi chybí tabulka pro schvalování dnů. Spusť prosím SQL migraci attendance_reviews_audit." }, { status: 500 });
  }

  let auditQuery = db.from("attendance_audit_log").select("*").eq("user_id", userId).eq("day", day).order("created_at", { ascending: false }).limit(20);
  auditQuery = siteId ? auditQuery.eq("site_id", siteId) : auditQuery.is("site_id", null);
  const auditRes = await auditQuery;

  if (auditRes.error && missingReviewTableMessage(auditRes.error.message || "")) {
    return json({ error: "V databázi chybí tabulka pro audit změn. Spusť prosím SQL migraci attendance_reviews_audit." }, { status: 500 });
  }

  return json({
    review: reviewRes.data?.[0] || null,
    audit: auditRes.data || [],
    key: reviewKey(userId, day, siteId),
  });
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

  let existingQuery = db.from("attendance_day_reviews").select("id").eq("user_id", userId).eq("day", day);
  existingQuery = siteId ? existingQuery.eq("site_id", siteId) : existingQuery.is("site_id", null);
  const existing = await existingQuery.order("updated_at", { ascending: false }).limit(10);

  if (existing.error) {
    if (missingReviewTableMessage(existing.error.message || "")) {
      return json({ error: "V databázi chybí tabulka pro schvalování dnů. Spusť prosím SQL migraci attendance_reviews_audit." }, { status: 500 });
    }
    return json({ error: "Nešlo načíst stav dne." }, { status: 500 });
  }

  const current = existing.data?.[0] || null;
  const duplicateIds = (existing.data || []).slice(1).map((row) => row.id);
  const result = current?.id
    ? await db.from("attendance_day_reviews").update(payload).eq("id", current.id).select("*").single()
    : await db.from("attendance_day_reviews").insert(payload).select("*").single();

  if (result.error) {
    if (missingReviewTableMessage(result.error.message || "")) {
      return json({ error: "V databázi chybí tabulka pro schvalování dnů. Spusť prosím SQL migraci attendance_reviews_audit." }, { status: 500 });
    }
    return json({ error: result.error.message || "Nešlo uložit stav dne." }, { status: 500 });
  }

  if (duplicateIds.length) {
    await db.from("attendance_day_reviews").delete().in("id", duplicateIds);
  }

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

  if (status === "returned") {
    const targetUser = await loadUserProfile(userId);
    if (targetUser?.email) {
      await sendNotification({
        userId,
        email: targetUser.email,
        kind: "day_returned",
        entityType: "attendance_day_review",
        entityId: reviewKey(userId, day, siteId),
        actorUserId: auth.session.userId,
        subject: `FlowDesk: den ${day} je vrácen k doplnění`,
        text: `Ahoj ${targetUser.name || ""},\n\nadmin vrátil den ${day} k doplnění.${note ? `\n\nPoznámka: ${note}` : ""}\n\nOtevři den tady: ${buildDayLink(day)}`,
        html: `<p>Ahoj ${targetUser.name || ""},</p><p>admin vrátil den <strong>${day}</strong> k doplnění.</p>${note ? `<p><strong>Poznámka:</strong> ${note}</p>` : ""}<p><a href="${buildDayLink(day)}">Otevřít detail dne</a></p>`,
        detail: { day, site_id: siteId, note },
      });
    }
  }

  return json({
    review: {
      ...result.data,
      key: reviewKey(userId, day, siteId),
    },
  });
}