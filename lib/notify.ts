import { supabaseAdmin } from "@/lib/supabase";

type NotifyInput = {
  userId: string;
  email?: string | null;
  subject: string;
  text: string;
  html?: string | null;
  kind:
    | "calendar_assignment"
    | "day_returned"
    | "task_comment"
    | "task_assignment"
    | "generic";
  entityType: string;
  entityId: string;
  actorUserId?: string | null;
  detail?: Record<string, unknown>;
};

function baseUrl() {
  return process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://dochazka-three.vercel.app";
}

async function sendViaResend(input: NotifyInput) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.NOTIFY_FROM_EMAIL;
  if (!apiKey || !from || !input.email) return { skipped: true as const, provider: "resend" as const };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from,
      to: [input.email],
      subject: input.subject,
      text: input.text,
      html: input.html || `<pre style="font-family:system-ui,Segoe UI,sans-serif;white-space:pre-wrap">${input.text}</pre>`,
      tags: [
        { name: "kind", value: input.kind },
        { name: "entity", value: input.entityType },
      ],
    }),
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      skipped: false as const,
      provider: "resend" as const,
      error: typeof payload?.message === "string" ? payload.message : "Email provider error",
    };
  }

  return {
    skipped: false as const,
    provider: "resend" as const,
    externalId: typeof payload?.id === "string" ? payload.id : null,
  };
}

export async function sendNotification(input: NotifyInput) {
  const db = supabaseAdmin();

  const delivery = await sendViaResend(input).catch((error: unknown) => ({
    skipped: false as const,
    provider: "resend" as const,
    error: error instanceof Error ? error.message : "Unknown notification error",
  }));

  try {
    await db.from("notification_events").insert({
      user_id: input.userId,
      email: input.email || null,
      kind: input.kind,
      subject: input.subject,
      body_text: input.text,
      entity_type: input.entityType,
      entity_id: input.entityId,
      actor_user_id: input.actorUserId || null,
      provider: "provider" in delivery ? delivery.provider : null,
      external_id: "externalId" in delivery ? delivery.externalId || null : null,
      status: "error" in delivery ? "failed" : input.email ? "sent" : "skipped",
      error_message: "error" in delivery ? delivery.error : null,
      detail: {
        ...(input.detail || {}),
        base_url: baseUrl(),
      },
    });
  } catch (error) {
    console.warn("notification_events.insert_failed", error);
  }

  return delivery;
}

export function buildDayLink(day: string) {
  return `${baseUrl()}/me/edit?day=${day}`;
}

export function buildCalendarLink(day: string) {
  return `${baseUrl()}/calendar?day=${day}`;
}

export function buildProjectLink(projectId: string, taskId?: string | null) {
  const suffix = taskId ? `?task=${taskId}` : "";
  return `${baseUrl()}/projects?project=${projectId}${suffix}`;
}
