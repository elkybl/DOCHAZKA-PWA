import { NextRequest } from "next/server";
import { json } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase";
import { addTaskActivity, ensureProjectAccess, requireProjectSession } from "@/lib/projects-server";
import { projectCommentCreateSchema } from "@/lib/projects";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, context: RouteContext) {
  const auth = await requireProjectSession(req);
  if ("error" in auth) return auth.error;

  const { id } = await context.params;
  const body = await req.json().catch(() => null);
  const parsed = projectCommentCreateSchema.safeParse(body);
  if (!parsed.success) return json({ error: "Neplatný komentář." }, { status: 400 });

  const db = supabaseAdmin();
  const task = await db.from("project_tasks").select("id,project_id").eq("id", id).single();
  if (task.error || !task.data) return json({ error: "Úkol nebyl nalezen." }, { status: 404 });

  const access = await ensureProjectAccess(task.data.project_id, auth.session.userId, auth.session.role);
  if (!access) return json({ error: "K projektu nemáš přístup." }, { status: 403 });

  const insert = await db
    .from("project_comments")
    .insert({
      task_id: id,
      user_id: auth.session.userId,
      body: parsed.data.body.trim(),
    })
    .select("id,task_id,user_id,body,created_at")
    .single();

  if (insert.error || !insert.data) return json({ error: "Nešlo uložit komentář." }, { status: 500 });
  await addTaskActivity(id, auth.session.userId, "comment_added", {
    length: parsed.data.body.trim().length,
  });
  return json({ comment: insert.data });
}
