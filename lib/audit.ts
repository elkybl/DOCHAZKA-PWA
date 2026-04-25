import { supabaseAdmin } from "@/lib/supabase";

type AuditInput = {
  entity_type: string;
  entity_id: string;
  action: string;
  actor_user_id: string;
  user_id?: string | null;
  site_id?: string | null;
  day?: string | null;
  detail?: Record<string, unknown>;
};

export async function writeAuditLog(input: AuditInput) {
  try {
    const db = supabaseAdmin();
    await db.from("attendance_audit_log").insert({
      entity_type: input.entity_type,
      entity_id: input.entity_id,
      action: input.action,
      actor_user_id: input.actor_user_id,
      user_id: input.user_id || null,
      site_id: input.site_id || null,
      day: input.day || null,
      detail: input.detail || {},
    });
  } catch (error) {
    console.warn("attendance_audit_log.insert_failed", error);
  }
}
