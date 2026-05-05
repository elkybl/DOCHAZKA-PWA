import { z } from "zod";

export const projectStatuses = ["active", "archived"] as const;
export const taskStatuses = ["todo", "doing", "done"] as const;
export const memberRoles = ["owner", "member"] as const;
export const projectFileCategories = ["photo", "pdf", "drawing", "handover", "document", "other"] as const;

export type ProjectStatus = (typeof projectStatuses)[number];
export type TaskStatus = (typeof taskStatuses)[number];
export type ProjectMemberRole = (typeof memberRoles)[number];
export type ProjectFileCategory = (typeof projectFileCategories)[number];

export const projectStatusLabel: Record<ProjectStatus, string> = {
  active: "Aktivní",
  archived: "Archiv",
};

export const taskStatusLabel: Record<TaskStatus, string> = {
  todo: "K řešení",
  doing: "Probíhá",
  done: "Hotovo",
};

export const projectFileCategoryLabel: Record<ProjectFileCategory, string> = {
  photo: "Fotky",
  pdf: "PDF",
  drawing: "Výkresy",
  handover: "Předání",
  document: "Dokumenty",
  other: "Ostatní",
};

export const checklistTemplates = [
  {
    key: "service",
    label: "Servis a opravy",
    items: [
      "Potvrdit zadání a místo zásahu",
      "Zkontrolovat stávající stav",
      "Provést opravu nebo zásah",
      "Otestovat funkčnost po zásahu",
      "Dopsat stručný výstup pro předání",
    ],
  },
  {
    key: "installation",
    label: "Montáž a realizace",
    items: [
      "Převzít podklady a rozsah práce",
      "Připravit materiál a nářadí",
      "Provést montáž",
      "Otestovat funkčnost",
      "Dopsat poznámky k dokončení",
    ],
  },
  {
    key: "inspection",
    label: "Kontrola a revize",
    items: [
      "Projít všechny kontrolní body",
      "Vyfotit nebo zdokumentovat závady",
      "Zapsat doporučení a další kroky",
      "Předat stručný souhrn",
    ],
  },
  {
    key: "meeting",
    label: "Schůzka a zápis",
    items: [
      "Sepsat hlavní body jednání",
      "Zapsat rozhodnutí",
      "Rozdělit úkoly a odpovědnosti",
      "Doplnit termíny a návaznosti",
    ],
  },
] as const;

export type ChecklistTemplateKey = (typeof checklistTemplates)[number]["key"];

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

export const projectTaskMoveSchema = z.object({
  status: z.enum(taskStatuses),
  sort_order: z.number().int().min(0).max(100000).optional(),
});

export const projectTaskLabelSchema = z.object({
  labels: z.array(z.string().min(1).max(40)).max(12),
});

export const projectFileCategorySchema = z.enum(projectFileCategories);
export const projectFileTopicSchema = z.string().min(1).max(120);
export const projectFileCaptionSchema = z.string().max(300).nullable().optional();

export type ProjectFile = {
  id: string;
  project_id: string;
  file_name: string;
  file_path: string;
  category: ProjectFileCategory;
  topic: string | null;
  caption: string | null;
  content_type: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  created_at: string;
};

export type ProjectFileActivityLog = {
  id: string;
  project_id: string;
  actor_user_id: string | null;
  action: string;
  detail: Record<string, unknown> | null;
  created_at: string;
};

export type ProjectAttachment = {
  id: string;
  task_id: string;
  file_name: string;
  file_path: string;
  content_type: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  created_at: string;
};

export type ProjectActivityLog = {
  id: string;
  task_id: string;
  actor_user_id: string | null;
  action: string;
  detail: Record<string, unknown> | null;
  created_at: string;
};

export type ProjectTaskLabel = {
  id: string;
  task_id: string;
  label: string;
  created_at: string;
};

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
  projectFiles: ProjectFile[];
  projectFileActivityLogs: ProjectFileActivityLog[];
  attachments: ProjectAttachment[];
  activityLogs: ProjectActivityLog[];
  labels: ProjectTaskLabel[];
  users: ProjectUser[];
  sites: ProjectSite[];
};

export function isProjectMember(sessionUserId: string, projectId: string, members: ProjectMember[]) {
  return members.some((member) => member.project_id === projectId && member.user_id === sessionUserId);
}

export function isProjectOwner(sessionUserId: string, projectId: string, members: ProjectMember[]) {
  return members.some(
    (member) => member.project_id === projectId && member.user_id === sessionUserId && member.role === "owner",
  );
}
