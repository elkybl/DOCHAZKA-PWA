import { NextRequest } from "next/server";
import { json } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase";
import { addTaskActivity, ensureProjectAccess, requireProjectSession } from "@/lib/projects-server";
import { checklistToggleSchema } from "@/lib/projects";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, context: RouteContext) {
  const auth = await requireProjectSession(req);
  if ("error" in auth) return auth.error;

  const { id } = await context.params;
  const body = await req.json().catch(() => null);
  const parsed = checklistToggleSchema.safeParse(body);
  if (!parsed.success) return json({ error: "Neplatný stav checklistu." }, { status: 400 });

  const db = supabaseAdmin();
  const item = await db
    .from("project_checklist_items")
    .select("id,task_id,project_tasks!inner(project_id)")
    .eq("id", id)
    .single();

  if (item.error || !item.data) return json({ error: "Bod checklistu nebyl nalezen." }, { status: 404 });

  const projectTasks = (item.data as { project_tasks?: Array<{ project_id: string }> | { project_id: string } | null }).project_tasks;
  const projectId = Array.isArray(projectTasks) ? projectTasks[0]?.project_id : projectTasks?.project_id;
  if (!projectId) return json({ error: "Nepodařilo se dohledat projekt checklistu." }, { status: 500 });
  const access = await ensureProjectAccess(projectId, auth.session.userId, auth.session.role);
  if (!access) return json({ error: "K projektu nemáš přístup." }, { status: 403 });

  const update = await db
    .from("project_checklist_items")
    .update({
      is_done: parsed.data.is_done,
      done_by: parsed.data.is_done ? auth.session.userId : null,
      done_at: parsed.data.is_done ? new Date().toISOString() : null,
    })
    .eq("id", id)
    .select("id,task_id,text,is_done,sort_order,done_by,done_at,created_by,created_at")
    .single();

  if (update.error || !update.data) return json({ error: "Nešlo uložit bod checklistu." }, { status: 500 });
  await addTaskActivity(update.data.task_id, auth.session.userId, parsed.data.is_done ? "checklist_done" : "checklist_reopened", {
    text: update.data.text,
  });
  return json({ item: update.data });
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  const auth = await requireProjectSession(req);
  if ("error" in auth) return auth.error;
  if (auth.session.role !== "admin") return json({ error: "Jen admin může smazat bod checklistu." }, { status: 403 });

  const { id } = await context.params;
  const db = supabaseAdmin();
  const remove = await db.from("project_checklist_items").delete().eq("id", id);
  if (remove.error) return json({ error: "Nešlo smazat bod checklistu." }, { status: 500 });
  return json({ ok: true });
}
