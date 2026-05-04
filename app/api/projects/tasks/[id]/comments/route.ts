import { NextRequest } from "next/server";
import { json } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase";
import { addTaskActivity, ensureProjectAccess, requireProjectSession } from "@/lib/projects-server";
import { projectCommentCreateSchema } from "@/lib/projects";
import { buildProjectLink, sendNotification } from "@/lib/notify";

type RouteContext = { params: Promise<{ id: string }> };
type CommentNotifyUser = { id: string; name?: string | null; email?: string | null };

export async function POST(req: NextRequest, context: RouteContext) {
  const auth = await requireProjectSession(req);
  if ("error" in auth) return auth.error;

  const { id } = await context.params;
  const body = await req.json().catch(() => null);
  const parsed = projectCommentCreateSchema.safeParse(body);
  if (!parsed.success) return json({ error: "Neplatný komentář." }, { status: 400 });

  const db = supabaseAdmin();
  const task = await db.from("project_tasks").select("id,project_id,title").eq("id", id).single();
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

  const assignees = await db
    .from("project_task_assignees")
    .select("user_id,users:user_id(id,name,email)")
    .eq("task_id", id);

  const targets = (assignees.data || [])
    .map((row) => {
      const usersValue = (row as { users?: unknown }).users;
      const user = Array.isArray(usersValue) ? (usersValue[0] as CommentNotifyUser | undefined) : ((usersValue as CommentNotifyUser | null) || null);
      return user;
    })
    .filter((user): user is CommentNotifyUser => Boolean(user?.id))
    .filter((user) => user.id !== auth.session.userId && !!user.email);

  await Promise.all(
    targets.map((user) =>
      sendNotification({
        userId: user.id,
        email: user.email || null,
        kind: "task_comment",
        entityType: "project_task",
        entityId: id,
        actorUserId: auth.session.userId,
        subject: `FlowDesk: nový komentář k úkolu "${task.data.title}"`,
        text: `Ahoj ${user.name || ""},\n\nu úkolu "${task.data.title}" přibyl nový komentář.\n\nOtevřít úkol: ${buildProjectLink(task.data.project_id, id)}`,
        html: `<p>Ahoj ${user.name || ""},</p><p>u úkolu <strong>${task.data.title}</strong> přibyl nový komentář.</p><p><a href="${buildProjectLink(task.data.project_id, id)}">Otevřít úkol</a></p>`,
        detail: { project_id: task.data.project_id, task_id: id, task_title: task.data.title },
      }),
    ),
  );

  return json({ comment: insert.data });
}
