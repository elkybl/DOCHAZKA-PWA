import { NextRequest } from "next/server";
import { json } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase";
import { ensureProjectAccess, requireProjectSession } from "@/lib/projects-server";
import { checklistCreateSchema } from "@/lib/projects";

export async function POST(req: NextRequest) {
  const auth = await requireProjectSession(req);
  if ("error" in auth) return auth.error;
  if (auth.session.role !== "admin") return json({ error: "Jen admin může přidávat body checklistu." }, { status: 403 });

  const body = await req.json().catch(() => null);
  const taskId = typeof body?.task_id === "string" ? body.task_id : "";
  if (!taskId) return json({ error: "Chybí úkol checklistu." }, { status: 400 });
  const parsed = checklistCreateSchema.safeParse({ text: body?.text });
  if (!parsed.success) return json({ error: "Neplatný bod checklistu." }, { status: 400 });

  const db = supabaseAdmin();
  const task = await db.from("project_tasks").select("id,project_id").eq("id", taskId).single();
  if (task.error || !task.data) return json({ error: "Úkol nebyl nalezen." }, { status: 404 });

  const access = await ensureProjectAccess(task.data.project_id, auth.session.userId, auth.session.role);
  if (!access) return json({ error: "K projektu nemáš přístup." }, { status: 403 });

  const sortRes = await db
    .from("project_checklist_items")
    .select("sort_order")
    .eq("task_id", taskId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextSort = ((sortRes.data as { sort_order?: number } | null)?.sort_order || 0) + 10;
  const insert = await db
    .from("project_checklist_items")
    .insert({
      task_id: taskId,
      text: parsed.data.text.trim(),
      sort_order: nextSort,
      created_by: auth.session.userId,
    })
    .select("id,task_id,text,is_done,sort_order,done_by,done_at,created_by,created_at")
    .single();

  if (insert.error || !insert.data) return json({ error: "Nešlo přidat bod checklistu." }, { status: 500 });
  return json({ item: insert.data });
}
