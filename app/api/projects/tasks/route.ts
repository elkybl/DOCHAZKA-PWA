import { NextRequest } from "next/server";
import { json } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase";
import { ensureProjectAccess, requireProjectAdmin } from "@/lib/projects-server";
import { projectTaskCreateSchema } from "@/lib/projects";

export async function POST(req: NextRequest) {
  const auth = await requireProjectAdmin(req);
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const parsed = projectTaskCreateSchema.safeParse(body);
  if (!parsed.success) return json({ error: "Neplatná data úkolu." }, { status: 400 });

  const access = await ensureProjectAccess(parsed.data.project_id, auth.session.userId, auth.session.role);
  if (!access) return json({ error: "K projektu nemáš přístup." }, { status: 403 });

  const db = supabaseAdmin();
  const sortOrderRes = await db
    .from("project_tasks")
    .select("sort_order")
    .eq("project_id", parsed.data.project_id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextSort = ((sortOrderRes.data as { sort_order?: number } | null)?.sort_order || 0) + 10;

  const taskInsert = await db
    .from("project_tasks")
    .insert({
      project_id: parsed.data.project_id,
      title: parsed.data.title.trim(),
      description: parsed.data.description?.trim() || null,
      status: parsed.data.status,
      due_date: parsed.data.due_date || null,
      sort_order: nextSort,
      created_by: auth.session.userId,
      updated_by: auth.session.userId,
      completed_by: parsed.data.status === "done" ? auth.session.userId : null,
      completed_at: parsed.data.status === "done" ? new Date().toISOString() : null,
    })
    .select("id,project_id,title,description,status,sort_order,due_date,created_by,updated_by,completed_by,completed_at,created_at,updated_at")
    .single();

  if (taskInsert.error || !taskInsert.data) return json({ error: "Nešlo uložit úkol." }, { status: 500 });

  if (parsed.data.assignee_ids.length) {
    const assigneesInsert = await db.from("project_task_assignees").insert(
      [...new Set(parsed.data.assignee_ids)].map((userId) => ({
        task_id: taskInsert.data.id,
        user_id: userId,
      })),
    );
    if (assigneesInsert.error) return json({ error: "Úkol se uložil, ale nešlo přidat řešitele." }, { status: 500 });
  }

  if (parsed.data.checklist.length) {
    const checklistInsert = await db.from("project_checklist_items").insert(
      parsed.data.checklist.map((text, index) => ({
        task_id: taskInsert.data.id,
        text: text.trim(),
        sort_order: (index + 1) * 10,
        created_by: auth.session.userId,
      })),
    );
    if (checklistInsert.error) return json({ error: "Úkol se uložil, ale nešlo přidat checklist." }, { status: 500 });
  }

  return json({ task: taskInsert.data });
}

