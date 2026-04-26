import { z } from "zod";

export const projectStatuses = ["active", "archived"] as const;
export const taskStatuses = ["todo", "doing", "done"] as const;
export const memberRoles = ["owner", "member"] as const;

export type ProjectStatus = (typeof projectStatuses)[number];
export type TaskStatus = (typeof taskStatuses)[number];
export type ProjectMemberRole = (typeof memberRoles)[number];

export const projectStatusLabel: Record<ProjectStatus, string> = {
  active: "Aktivní",
  archived: "Archiv",
};

export const taskStatusLabel: Record<TaskStatus, string> = {
  todo: "K řešení",
  doing: "Probíhá",
  done: "Hotovo",
};

export const projectCreateSchema = z.object({
  title: z.string().min(2).max(160),
  description: z.string().max(4000).nullable().optional(),
  site_id: z.string().uuid().nullable().optional(),
  status: z.enum(projectStatuses).default("active"),
  member_ids: z.array(z.string().uuid()).max(50).default([]),
});

export const projectUpdateSchema = projectCreateSchema.partial().extend({
  id: z.string().uuid().optional(),
  member_ids: z.array(z.string().uuid()).max(50).optional(),
});

export const projectTaskCreateSchema = z.object({
  project_id: z.string().uuid(),
  title: z.string().min(2).max(200),
  description: z.string().max(5000).nullable().optional(),
  status: z.enum(taskStatuses).default("todo"),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  assignee_ids: z.array(z.string().uuid()).max(50).default([]),
  checklist: z.array(z.string().min(1).max(400)).max(50).default([]),
});

export const projectTaskUpdateSchema = z.object({
  title: z.string().min(2).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  status: z.enum(taskStatuses).optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  assignee_ids: z.array(z.string().uuid()).max(50).optional(),
});

export const checklistCreateSchema = z.object({
  text: z.string().min(1).max(400),
});

export const checklistToggleSchema = z.object({
  is_done: z.boolean(),
});

export const projectCommentCreateSchema = z.object({
  body: z.string().min(1).max(3000),
});

export type ProjectUser = {
  id: string;
  name: string;
  role?: "admin" | "worker";
  is_active?: boolean;
};

export type ProjectMember = {
  id: string;
  project_id: string;
  user_id: string;
  role: ProjectMemberRole;
  created_at: string;
};

export type ProjectTaskAssignee = {
  id: string;
  task_id: string;
  user_id: string;
  created_at: string;
};

export type ProjectChecklistItem = {
  id: string;
  task_id: string;
  text: string;
  is_done: boolean;
  sort_order: number;
  done_by: string | null;
  done_at: string | null;
  created_by: string | null;
  created_at: string;
};

export type ProjectComment = {
  id: string;
  task_id: string;
  user_id: string;
  body: string;
  created_at: string;
};

export type ProjectTask = {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  sort_order: number;
  due_date: string | null;
  created_by: string | null;
  updated_by: string | null;
  completed_by: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Project = {
  id: string;
  title: string;
  description: string | null;
  site_id: string | null;
  status: ProjectStatus;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectSite = {
  id: string;
  name: string;
};

export type ProjectBundle = {
  projects: Project[];
  members: ProjectMember[];
  tasks: ProjectTask[];
  assignees: ProjectTaskAssignee[];
  checklistItems: ProjectChecklistItem[];
  comments: ProjectComment[];
  users: ProjectUser[];
  sites: ProjectSite[];
};

export function isProjectMember(sessionUserId: string, projectId: string, members: ProjectMember[]) {
  return members.some((member) => member.project_id === projectId && member.user_id === sessionUserId);
}

export function isProjectOwner(sessionUserId: string, projectId: string, members: ProjectMember[]) {
  return members.some((member) => member.project_id === projectId && member.user_id === sessionUserId && member.role === "owner");
}

