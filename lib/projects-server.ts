import type { NextRequest } from "next/server";
import { verifySession } from "@/lib/auth";
import { getBearer, json } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase";
import type { ProjectBundle, ProjectMember } from "@/lib/projects";

export async function requireProjectSession(req: NextRequest) {
  const token = getBearer(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return { error: json({ error: "Nepřihlášen." }, { status: 401 }) };
  return { session };
}

export async function requireProjectAdmin(req: NextRequest) {
  const auth = await requireProjectSession(req);
  if ("error" in auth) return auth;
  if (auth.session.role !== "admin") return { error: json({ error: "Jen admin." }, { status: 403 }) };
  return auth;
}

export async function getProjectMembers(projectId: string) {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("project_members")
    .select("id,project_id,user_id,role,created_at")
    .eq("project_id", projectId);

  if (error) throw error;
  return (data || []) as ProjectMember[];
}

export async function ensureProjectAccess(projectId: string, userId: string, role: "admin" | "worker") {
  if (role === "admin") return true;
  const members = await getProjectMembers(projectId);
  return members.some((member) => member.user_id === userId);
}

export async function loadProjectBundle(sessionUserId: string, sessionRole: "admin" | "worker"): Promise<ProjectBundle> {
  const db = supabaseAdmin();

  let projectIds: string[] = [];

  if (sessionRole === "admin") {
    const { data, error } = await db.from("projects").select("id").neq("status", "archived");
    if (error) throw error;
    projectIds = (data || []).map((row: { id: string }) => row.id);
  } else {
    const { data, error } = await db.from("project_members").select("project_id").eq("user_id", sessionUserId);
    if (error) throw error;
    projectIds = [...new Set((data || []).map((row: { project_id: string }) => row.project_id))];
  }

  if (!projectIds.length) {
    const [usersRes, sitesRes] = await Promise.all([
      db.from("users").select("id,name,role,is_active").eq("is_active", true).order("name"),
      db.from("sites").select("id,name").eq("is_active", true).order("name"),
    ]);

    if (usersRes.error) throw usersRes.error;
    if (sitesRes.error) throw sitesRes.error;

    return {
      projects: [],
      members: [],
      tasks: [],
      assignees: [],
      checklistItems: [],
      comments: [],
      users: (usersRes.data || []) as ProjectBundle["users"],
      sites: (sitesRes.data || []) as ProjectBundle["sites"],
    };
  }

  const projectsRes = await db
    .from("projects")
    .select("id,title,description,site_id,status,created_by,updated_by,created_at,updated_at")
    .in("id", projectIds)
    .order("updated_at", { ascending: false });
  if (projectsRes.error) throw projectsRes.error;
  const projects = (projectsRes.data || []) as ProjectBundle["projects"];

  const projectIdSet = projects.map((project) => project.id);
  if (!projectIdSet.length) {
    return {
      projects: [],
      members: [],
      tasks: [],
      assignees: [],
      checklistItems: [],
      comments: [],
      users: [],
      sites: [],
    };
  }

  const membersRes = await db
    .from("project_members")
    .select("id,project_id,user_id,role,created_at")
    .in("project_id", projectIdSet);
  if (membersRes.error) throw membersRes.error;
  const members = (membersRes.data || []) as ProjectBundle["members"];

  const tasksRes = await db
    .from("project_tasks")
    .select("id,project_id,title,description,status,sort_order,due_date,created_by,updated_by,completed_by,completed_at,created_at,updated_at")
    .in("project_id", projectIdSet)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (tasksRes.error) throw tasksRes.error;
  const tasks = (tasksRes.data || []) as ProjectBundle["tasks"];

  const taskIds = tasks.map((task) => task.id);

  const [assigneesRes, checklistRes, commentsRes] = taskIds.length
    ? await Promise.all([
        db.from("project_task_assignees").select("id,task_id,user_id,created_at").in("task_id", taskIds),
        db
          .from("project_checklist_items")
          .select("id,task_id,text,is_done,sort_order,done_by,done_at,created_by,created_at")
          .in("task_id", taskIds)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true }),
        db.from("project_comments").select("id,task_id,user_id,body,created_at").in("task_id", taskIds).order("created_at", { ascending: false }),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
      ];

  if (assigneesRes.error) throw assigneesRes.error;
  if (checklistRes.error) throw checklistRes.error;
  if (commentsRes.error) throw commentsRes.error;

  const userIds = [...new Set([...members.map((member) => member.user_id), ...projects.map((project) => project.created_by).filter(Boolean) as string[], ...tasks.flatMap((task) => [task.created_by, task.updated_by, task.completed_by].filter(Boolean) as string[]), ...(commentsRes.data || []).map((comment: { user_id: string }) => comment.user_id), ...(checklistRes.data || []).flatMap((item: { created_by: string | null; done_by: string | null }) => [item.created_by, item.done_by].filter(Boolean) as string[])])];

  const [usersRes, sitesRes] = await Promise.all([
    userIds.length
      ? db.from("users").select("id,name,role,is_active").in("id", userIds).order("name")
      : db.from("users").select("id,name,role,is_active").eq("is_active", true).order("name"),
    db.from("sites").select("id,name").order("name"),
  ]);

  if (usersRes.error) throw usersRes.error;
  if (sitesRes.error) throw sitesRes.error;

  return {
    projects,
    members,
    tasks,
    assignees: (assigneesRes.data || []) as ProjectBundle["assignees"],
    checklistItems: (checklistRes.data || []) as ProjectBundle["checklistItems"],
    comments: (commentsRes.data || []) as ProjectBundle["comments"],
    users: (usersRes.data || []) as ProjectBundle["users"],
    sites: (sitesRes.data || []) as ProjectBundle["sites"],
  };
}

