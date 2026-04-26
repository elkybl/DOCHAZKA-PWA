import { NextRequest } from "next/server";
import { json } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase";
import { ensureProjectAccess, requireProjectSession } from "@/lib/projects-server";
import { projectTaskUpdateSchema } from "@/lib/projects";

type RouteContext = { params: Promise<{ id: string }> };

async function loadTask(id: string) {
  const db = supabaseAdmin();
  const task = await db
    .from("project_tasks")
    .select("id,project_id,title,description,status,sort_order,due_date,created_by,updated_by,completed_by,completed_at,created_at,updated_at")
    .eq("id", id)
    .single();
  return { db, task };
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  const auth = await requireProjectSession(req);
  if ("error" in auth) return auth.error;

  const { id } = await context.params;
  const body = await req.json().catch(() => null);
  const parsed = projectTaskUpdateSchema.safeParse(body);
  if (!parsed.success) return json({ error: "Neplatná data úkolu." }, { status: 400 });

  const { db, task } = await loadTask(id);
  if (task.error || !task.data) return json({ error: "Úkol nebyl nalezen." }, { status: 404 });

  const access = await ensureProjectAccess(task.data.project_id, auth.session.userId, auth.session.role);
  if (!access) return json({ error: "K projektu nemáš přístup." }, { status: 403 });

  if (auth.session.role !== "admin" && (parsed.data.title !== undefined || parsed.data.description !== undefined || parsed.data.due_date !== undefined || parsed.data.assignee_ids !== undefined)) {
    return json({ error: "Jen admin může upravit zadání úkolu." }, { status: 403 });
  }

  const nextStatus = parsed.data.status ?? task.data.status;
  const updatePayload = {
    ...(parsed.data.title !== undefined ? { title: parsed.data.title.trim() } : {}),
    ...(parsed.data.description !== undefined ? { description: parsed.data.description?.trim() || null } : {}),
    ...(parsed.data.due_date !== undefined ? { due_date: parsed.data.due_date || null } : {}),
    ...(parsed.data.status ? { status: parsed.data.status } : {}),
    updated_by: auth.session.userId,
    updated_at: new Date().toISOString(),
    completed_by: nextStatus === "done" ? auth.session.userId : null,
    completed_at: nextStatus === "done" ? new Date().toISOString() : null,
  };

  const update = await db
    .from("project_tasks")
    .update(updatePayload)
    .eq("id", id)
    .select("id,project_id,title,description,status,sort_order,due_date,created_by,updated_by,completed_by,completed_at,created_at,updated_at")
    .single();

  if (update.error || !update.data) return json({ error: "Nešlo upravit úkol." }, { status: 500 });

  if (auth.session.role === "admin" && parsed.data.assignee_ids) {
    await db.from("project_task_assignees").delete().eq("task_id", id);
    if (parsed.data.assignee_ids.length) {
      const insertAssignees = await db.from("project_task_assignees").insert(
        [...new Set(parsed.data.assignee_ids)].map((userId) => ({
          task_id: id,
          user_id: userId,
        })),
      );
      if (insertAssignees.error) return json({ error: "Úkol se upravil, ale nešlo uložit řešitele." }, { status: 500 });
    }
  }

  return json({ task: update.data });
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  const auth = await requireProjectSession(req);
  if ("error" in auth) return auth.error;
  if (auth.session.role !== "admin") return json({ error: "Jen admin může smazat úkol." }, { status: 403 });

  const { id } = await context.params;
  const { db, task } = await loadTask(id);
  if (task.error || !task.data) return json({ error: "Úkol nebyl nalezen." }, { status: 404 });

  const access = await ensureProjectAccess(task.data.project_id, auth.session.userId, auth.session.role);
  if (!access) return json({ error: "K projektu nemáš přístup." }, { status: 403 });

  const remove = await db.from("project_tasks").delete().eq("id", id);
  if (remove.error) return json({ error: "Nešlo smazat úkol." }, { status: 500 });
  return json({ ok: true });
}

