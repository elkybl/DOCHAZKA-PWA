"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppNav";
import { Button, Card, Pill, SubCard } from "@/app/components/ui";
import {
  checklistTemplates,
  projectFileCategoryLabel,
  projectStatusLabel,
  taskStatusLabel,
  type ProjectActivityLog,
  type ProjectAttachment,
  type ProjectBundle,
  type ProjectChecklistItem,
  type ProjectFileCategory,
  type ProjectFileActivityLog,
  type ProjectFile,
  type ProjectTask,
  type ProjectTaskAssignee,
  type ProjectTaskLabel,
  type ProjectUser,
  type ProjectStatus,
  type TaskStatus,
} from "@/lib/projects";

const UI = {
  title: "Projekty a \u00fakoly",
  subtitle:
    "Jedno m\u00edsto pro akce, servis, body k dokon\u010den\u00ed, checklisty, koment\u00e1\u0159e i p\u0159ehled kdo co ud\u011blal.",
  refresh: "Obnovit",
  newProject: "Nov\u00fd projekt",
  newTask: "Nov\u00fd \u00fakol",
  projects: "Projekty",
  projectsSubtitle: "Akce, servis, realizace i intern\u00ed \u00fakoly na jednom m\u00edst\u011b.",
  createProject: "Ulo\u017eit projekt",
  saveTask: "Ulo\u017eit \u00fakol",
  saveChanges: "Ulo\u017eit zm\u011bny",
  save: "Ulo\u017eit",
  cancel: "Zru\u0161it",
  close: "Zav\u0159\u00edt",
  delete: "Smazat",
  open: "Otev\u0159\u00edt",
  add: "P\u0159idat",
  uploadAttachment: "P\u0159idat p\u0159\u00edlohu",
  addComment: "P\u0159idat koment\u00e1\u0159",
  editTask: "Upravit \u00fakol",
  searchProjects: "Hledat v projektech, \u00fakolech a koment\u00e1\u0159\u00edch",
  noDeadline: "Bez term\u00ednu",
  noProjectDescription: "Bez dopl\u0148uj\u00edc\u00edho popisu projektu.",
  noTaskDescription: "Bez dopl\u0148uj\u00edc\u00edho popisu \u00fakolu.",
  noItems: "Zat\u00edm bez polo\u017eek.",
  emptyProjectsTitle: "Zat\u00edm tu nen\u00ed \u017e\u00e1dn\u00fd projekt",
  emptyProjectsText: "Za\u010dni zalo\u017een\u00edm prvn\u00ed akce, ke kter\u00e9 pak p\u0159id\u00e1\u0161 \u00fakoly, checklist a koment\u00e1\u0159e.",
  emptyProjectTitle: "Vyber projekt",
  emptyProjectText: "Po v\u00fdb\u011bru projektu tady uvid\u00ed\u0161 \u00fakoly, checklisty, koment\u00e1\u0159e i posledn\u00ed aktivitu.",
  emptyTaskTitle: "Vyber \u00fakol",
  emptyTaskText: "Po kliknut\u00ed na kartu \u00fakolu tady uvid\u00ed\u0161 detail, checklist, koment\u00e1\u0159e, p\u0159\u00edlohy a historii zm\u011bn.",
};

function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

function getUser() {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("user");
  return raw ? (JSON.parse(raw) as { id: string; name: string; role: "admin" | "worker" }) : null;
}

function fmtDate(value: string | null | undefined) {
  if (!value) return UI.noDeadline;
  return new Date(`${value}T12:00:00`).toLocaleDateString("cs-CZ");
}

function fmtDateTime(value: string | null | undefined) {
  if (!value) return "";
  return new Date(value).toLocaleString("cs-CZ");
}

function fmtSize(value: number | null | undefined) {
  const size = Number(value) || 0;
  if (!size) return "0 B";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageFile(file: Pick<ProjectFile, "category" | "content_type" | "file_name">) {
  return file.category === "photo" || !!file.content_type?.startsWith("image/");
}

function isPdfFile(file: Pick<ProjectFile, "category" | "content_type" | "file_name">) {
  return file.category === "pdf" || !!file.content_type?.includes("pdf") || file.file_name.toLowerCase().endsWith(".pdf");
}

function matchesProjectFileFilter(file: ProjectFile, filter: ProjectFileFilter) {
  switch (filter) {
    case "photo":
      return isImageFile(file);
    case "pdf":
      return isPdfFile(file);
    case "drawing":
      return file.category === "drawing";
    case "handover":
      return file.category === "handover";
    default:
      return true;
  }
}

const emptyBundle: ProjectBundle = {
  projects: [],
  members: [],
  tasks: [],
  assignees: [],
  checklistItems: [],
  comments: [],
  projectFiles: [],
  projectFileActivityLogs: [],
  attachments: [],
  activityLogs: [],
  labels: [],
  users: [],
  sites: [],
};

type TaskFormState = {
  title: string;
  description: string;
  due_date: string;
  assignee_ids: string[];
  checklistText: string;
};

const initialTaskForm: TaskFormState = {
  title: "",
  description: "",
  due_date: "",
  assignee_ids: [],
  checklistText: "",
};

type EditTaskState = {
  title: string;
  description: string;
  due_date: string;
  assignee_ids: string[];
};

type ProjectFileFilter = "all" | "photo" | "pdf" | "drawing" | "handover";

export default function ProjectsPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<{ id: string; name: string; role: "admin" | "worker" } | null>(null);
  const [bundle, setBundle] = useState<ProjectBundle>(emptyBundle);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [projectFormOpen, setProjectFormOpen] = useState(false);
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [projectTitle, setProjectTitle] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [projectSiteId, setProjectSiteId] = useState("");
  const [projectMemberIds, setProjectMemberIds] = useState<string[]>([]);
  const [taskForm, setTaskForm] = useState<TaskFormState>(initialTaskForm);
  const [editTaskOpen, setEditTaskOpen] = useState(false);
  const [editTask, setEditTask] = useState<EditTaskState | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [newChecklistText, setNewChecklistText] = useState("");
  const [labelsInput, setLabelsInput] = useState("");
  const [projectQuery, setProjectQuery] = useState("");
  const [projectStatusFilter, setProjectStatusFilter] = useState<"active" | "archived" | "all">("active");
  const [taskTemplateKey, setTaskTemplateKey] = useState("");
  const [checklistTemplateKey, setChecklistTemplateKey] = useState("");
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<TaskStatus | null>(null);
  const [projectFileCategory, setProjectFileCategory] = useState<ProjectFileCategory>("other");
  const [projectFileFilter, setProjectFileFilter] = useState<ProjectFileFilter>("all");
  const [projectFilePreview, setProjectFilePreview] = useState<{ name: string; url: string; contentType: string | null } | null>(null);

  useEffect(() => {
    const nextToken = getToken();
    const nextUser = getUser();
    setToken(nextToken);
    setMe(nextUser);
    if (!nextToken || !nextUser) router.push("/login");
  }, [router]);

  async function load() {
    if (!token) return;
    setErr(null);
    try {
      const res = await fetch("/api/projects", { headers: { authorization: `Bearer ${token}` } });
      const data = (await res.json().catch(() => ({}))) as ProjectBundle & { error?: string };
      if (!res.ok) throw new Error(data.error || "Nepoda\u0159ilo se na\u010d\u00edst projekty.");
      setBundle({
        projects: data.projects || [],
        members: data.members || [],
        tasks: data.tasks || [],
        assignees: data.assignees || [],
        checklistItems: data.checklistItems || [],
        comments: data.comments || [],
        projectFiles: data.projectFiles || [],
        projectFileActivityLogs: data.projectFileActivityLogs || [],
        attachments: data.attachments || [],
        activityLogs: data.activityLogs || [],
        labels: data.labels || [],
        users: data.users || [],
        sites: data.sites || [],
      });
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Nepoda\u0159ilo se na\u010d\u00edst projekty.");
    }
  }

  useEffect(() => {
    if (!token) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const projectsById = useMemo(() => new Map(bundle.projects.map((project) => [project.id, project])), [bundle.projects]);
  const commentsByProject = useMemo(() => {
    const taskById = new Map(bundle.tasks.map((task) => [task.id, task]));
    const map = new Map<string, string[]>();
    for (const comment of bundle.comments) {
      const task = taskById.get(comment.task_id);
      if (!task) continue;
      map.set(task.project_id, [...(map.get(task.project_id) || []), comment.body]);
    }
    return map;
  }, [bundle.comments, bundle.tasks]);
  const projectTaskCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const task of bundle.tasks) map.set(task.project_id, (map.get(task.project_id) || 0) + 1);
    return map;
  }, [bundle.tasks]);
  const usersById = useMemo(() => new Map(bundle.users.map((user) => [user.id, user])), [bundle.users]);
  const sitesById = useMemo(() => new Map(bundle.sites.map((site) => [site.id, site])), [bundle.sites]);

  const filteredProjects = useMemo(() => {
    const needle = projectQuery.trim().toLocaleLowerCase("cs");
    return bundle.projects.filter((project) => {
      if (projectStatusFilter !== "all" && project.status !== projectStatusFilter) return false;
      if (!needle) return true;
      const site = project.site_id ? sitesById.get(project.site_id)?.name || "" : "";
      const taskTexts = bundle.tasks
        .filter((task) => task.project_id === project.id)
        .map((task) => `${task.title} ${task.description || ""}`)
        .join(" ");
      const commentTexts = (commentsByProject.get(project.id) || []).join(" ");
      const labelTexts = bundle.labels
        .filter((label) => {
          const task = bundle.tasks.find((item) => item.id === label.task_id);
          return task?.project_id === project.id;
        })
        .map((label) => label.label)
        .join(" ");
      const haystack = `${project.title} ${project.description || ""} ${site} ${taskTexts} ${commentTexts} ${labelTexts}`.toLocaleLowerCase("cs");
      return haystack.includes(needle);
    });
  }, [bundle.projects, projectStatusFilter, projectQuery, sitesById, bundle.tasks, commentsByProject, bundle.labels]);

  useEffect(() => {
    if (!selectedProjectId && filteredProjects.length) setSelectedProjectId(filteredProjects[0].id);
    if (selectedProjectId && !filteredProjects.some((project) => project.id === selectedProjectId)) {
      setSelectedProjectId(filteredProjects[0]?.id || "");
    }
  }, [filteredProjects, selectedProjectId]);

  const selectedProject = useMemo(
    () => projectsById.get(selectedProjectId) || null,
    [projectsById, selectedProjectId],
  );
  const selectedProjectMembers = useMemo(
    () => bundle.members.filter((member) => member.project_id === selectedProjectId),
    [bundle.members, selectedProjectId],
  );
  const selectedProjectTasks = useMemo(
    () => bundle.tasks.filter((task) => task.project_id === selectedProjectId),
    [bundle.tasks, selectedProjectId],
  );
  const selectedProjectFiles = useMemo(
    () => bundle.projectFiles.filter((item) => item.project_id === selectedProjectId),
    [bundle.projectFiles, selectedProjectId],
  );
  const filteredProjectFiles = useMemo(
    () => selectedProjectFiles.filter((file) => matchesProjectFileFilter(file, projectFileFilter)),
    [selectedProjectFiles, projectFileFilter],
  );
  const projectGalleryFiles = useMemo(
    () => selectedProjectFiles.filter((file) => isImageFile(file)).slice(0, 12),
    [selectedProjectFiles],
  );
  const selectedProjectFileActivity = useMemo(
    () => bundle.projectFileActivityLogs.filter((item) => item.project_id === selectedProjectId).slice(0, 8),
    [bundle.projectFileActivityLogs, selectedProjectId],
  );

  useEffect(() => {
    if (!selectedTaskId && selectedProjectTasks.length) setSelectedTaskId(selectedProjectTasks[0].id);
    if (selectedTaskId && !selectedProjectTasks.some((task) => task.id === selectedTaskId)) {
      setSelectedTaskId(selectedProjectTasks[0]?.id || "");
    }
  }, [selectedProjectTasks, selectedTaskId]);

  const selectedTask = useMemo(
    () => selectedProjectTasks.find((task) => task.id === selectedTaskId) || null,
    [selectedProjectTasks, selectedTaskId],
  );

  const taskAssignees = useMemo(() => {
    if (!selectedTask) return [];
    return bundle.assignees
      .filter((assignee) => assignee.task_id === selectedTask.id)
      .map((assignee) => usersById.get(assignee.user_id))
      .filter(Boolean) as ProjectUser[];
  }, [bundle.assignees, selectedTask, usersById]);
  const taskChecklist = useMemo(
    () => (selectedTask ? bundle.checklistItems.filter((item) => item.task_id === selectedTask.id) : []),
    [bundle.checklistItems, selectedTask],
  );
  const taskComments = useMemo(
    () => (selectedTask ? bundle.comments.filter((comment) => comment.task_id === selectedTask.id) : []),
    [bundle.comments, selectedTask],
  );
  const taskAttachments = useMemo(
    () => (selectedTask ? bundle.attachments.filter((item) => item.task_id === selectedTask.id) : []),
    [bundle.attachments, selectedTask],
  );
  const taskActivity = useMemo(
    () => (selectedTask ? bundle.activityLogs.filter((item) => item.task_id === selectedTask.id) : []),
    [bundle.activityLogs, selectedTask],
  );
  const taskLabels = useMemo(
    () => (selectedTask ? bundle.labels.filter((item) => item.task_id === selectedTask.id) : []),
    [bundle.labels, selectedTask],
  );

  const isAdmin = me?.role === "admin";
  const availableMembers = useMemo(() => {
    const memberSet = new Set(selectedProjectMembers.map((member) => member.user_id));
    return bundle.users.filter((user) => memberSet.has(user.id));
  }, [bundle.users, selectedProjectMembers]);

  const groupedTasks = useMemo(() => {
    const grouped: Record<TaskStatus, ProjectTask[]> = { todo: [], doing: [], done: [] };
    for (const task of selectedProjectTasks) grouped[task.status].push(task);
    for (const status of Object.keys(grouped) as TaskStatus[]) {
      grouped[status].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
    }
    return grouped;
  }, [selectedProjectTasks]);

  const myTaskIdSet = useMemo(() => {
    if (!me) return new Set<string>();
    return new Set(bundle.assignees.filter((assignee) => assignee.user_id === me.id).map((assignee) => assignee.task_id));
  }, [bundle.assignees, me]);

  const myTasks = useMemo(() => selectedProjectTasks.filter((task) => myTaskIdSet.has(task.id)), [selectedProjectTasks, myTaskIdSet]);

  const overdueTasks = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return myTasks.filter((task) => {
      if (task.status === "done" || !task.due_date) return false;
      const due = new Date(`${task.due_date}T12:00:00`);
      return due.getTime() < today.getTime();
    });
  }, [myTasks]);

  const recentProjectActivity = useMemo(() => {
    const taskIds = new Set(selectedProjectTasks.map((task) => task.id));
    return bundle.activityLogs
      .filter((item) => taskIds.has(item.task_id))
      .filter((item) => item.actor_user_id !== me?.id)
      .slice(0, 5);
  }, [bundle.activityLogs, selectedProjectTasks, me]);

  const activeProjectCount = bundle.projects.filter((project) => project.status === "active").length;
  const archivedProjectCount = bundle.projects.filter((project) => project.status === "archived").length;

  useEffect(() => {
    if (!selectedTask) {
      setEditTask(null);
      return;
    }
    setEditTask({
      title: selectedTask.title,
      description: selectedTask.description || "",
      due_date: selectedTask.due_date || "",
      assignee_ids: bundle.assignees.filter((assignee) => assignee.task_id === selectedTask.id).map((assignee) => assignee.user_id),
    });
    setLabelsInput(bundle.labels.filter((item) => item.task_id === selectedTask.id).map((item) => item.label).join(", "));
  }, [selectedTask, bundle.assignees, bundle.labels]);

  useEffect(() => {
    setProjectFilePreview(null);
  }, [selectedProjectId]);

  async function createProject() {
    if (!token) return;
    setBusy("project-create");
    setErr(null);
    setInfo(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: projectTitle,
          description: projectDescription,
          site_id: projectSiteId || null,
          member_ids: projectMemberIds,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Ne\u0161lo zalo\u017eit projekt.");
      setInfo("Projekt je ulo\u017een\u00fd.");
      setProjectFormOpen(false);
      setProjectTitle("");
      setProjectDescription("");
      setProjectSiteId("");
      setProjectMemberIds([]);
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Ne\u0161lo zalo\u017eit projekt.");
    } finally {
      setBusy(null);
    }
  }

  async function createTask() {
    if (!token || !selectedProjectId) return;
    setBusy("task-create");
    setErr(null);
    setInfo(null);
    try {
      const checklist = taskForm.checklistText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      const res = await fetch("/api/projects/tasks", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({
          project_id: selectedProjectId,
          title: taskForm.title,
          description: taskForm.description,
          due_date: taskForm.due_date || null,
          assignee_ids: taskForm.assignee_ids,
          checklist,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Ne\u0161lo zalo\u017eit \u00fakol.");
      setInfo("\u00dakol je ulo\u017een\u00fd.");
      setTaskFormOpen(false);
      setTaskForm(initialTaskForm);
      setTaskTemplateKey("");
      await load();
      if (data.task?.id) setSelectedTaskId(data.task.id);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Ne\u0161lo zalo\u017eit \u00fakol.");
    } finally {
      setBusy(null);
    }
  }

  async function updateTaskStatus(taskId: string, status: TaskStatus, sortOrder?: number) {
    if (!token) return;
    setBusy(`task-status-${taskId}`);
    setErr(null);
    try {
      const res = await fetch(`/api/projects/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({
          status,
          ...(sortOrder !== undefined ? { sort_order: sortOrder } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Ne\u0161lo zm\u011bnit stav \u00fakolu.");
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Ne\u0161lo zm\u011bnit stav \u00fakolu.");
    } finally {
      setBusy(null);
    }
  }

  async function moveTaskToStatus(taskId: string, status: TaskStatus) {
    const targetTasks = groupedTasks[status].filter((task) => task.id !== taskId);
    const nextSortOrder = targetTasks.length ? Math.max(...targetTasks.map((task) => task.sort_order || 0)) + 100 : 100;
    await updateTaskStatus(taskId, status, nextSortOrder);
  }

  async function toggleChecklist(item: ProjectChecklistItem, isDone: boolean) {
    if (!token) return;
    setBusy(`check-${item.id}`);
    setErr(null);
    try {
      const res = await fetch(`/api/projects/checklist/${item.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ is_done: isDone }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Ne\u0161lo ulo\u017eit checklist.");
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Ne\u0161lo ulo\u017eit checklist.");
    } finally {
      setBusy(null);
    }
  }

  async function addChecklist() {
    if (!token || !selectedTask || !newChecklistText.trim()) return;
    setBusy("check-create");
    setErr(null);
    try {
      const res = await fetch("/api/projects/checklist", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ task_id: selectedTask.id, text: newChecklistText }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Ne\u0161lo p\u0159idat bod checklistu.");
      setNewChecklistText("");
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Ne\u0161lo p\u0159idat bod checklistu.");
    } finally {
      setBusy(null);
    }
  }

  async function addComment() {
    if (!token || !selectedTask || !commentBody.trim()) return;
    setBusy("comment-create");
    setErr(null);
    try {
      const res = await fetch(`/api/projects/tasks/${selectedTask.id}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ body: commentBody }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Ne\u0161lo ulo\u017eit koment\u00e1\u0159.");
      setCommentBody("");
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Ne\u0161lo ulo\u017eit koment\u00e1\u0159.");
    } finally {
      setBusy(null);
    }
  }

  async function deleteTask(taskId: string) {
    if (!token || !confirm("Opravdu smazat tento \u00fakol?")) return;
    setBusy(`task-delete-${taskId}`);
    setErr(null);
    try {
      const res = await fetch(`/api/projects/tasks/${taskId}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Ne\u0161lo smazat \u00fakol.");
      if (selectedTaskId === taskId) setSelectedTaskId("");
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Ne\u0161lo smazat \u00fakol.");
    } finally {
      setBusy(null);
    }
  }

  async function saveTaskEdit() {
    if (!token || !selectedTask || !editTask) return;
    setBusy("task-edit");
    setErr(null);
    try {
      const res = await fetch(`/api/projects/tasks/${selectedTask.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: editTask.title,
          description: editTask.description,
          due_date: editTask.due_date || null,
          assignee_ids: editTask.assignee_ids,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Ne\u0161lo upravit \u00fakol.");
      setInfo("\u00dakol je upraven\u00fd.");
      setEditTaskOpen(false);
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Ne\u0161lo upravit \u00fakol.");
    } finally {
      setBusy(null);
    }
  }

  async function uploadAttachment(file: File) {
    if (!token || !selectedTask) return;
    const form = new FormData();
    form.set("file", file);
    setBusy("attachment-upload");
    setErr(null);
    try {
      const res = await fetch(`/api/projects/tasks/${selectedTask.id}/attachments`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Ne\u0161lo nahr\u00e1t p\u0159\u00edlohu.");
      setInfo("P\u0159\u00edloha je nahran\u00e1.");
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Ne\u0161lo nahr\u00e1t p\u0159\u00edlohu.");
    } finally {
      setBusy(null);
    }
  }

  async function uploadProjectFile(file: File) {
    if (!token || !selectedProject) return;
    const form = new FormData();
    form.set("file", file);
    form.set("category", projectFileCategory);
    setBusy("project-file-upload");
    setErr(null);
    try {
      const res = await fetch(`/api/projects/${selectedProject.id}/attachments`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "NeĹˇlo nahrĂˇt soubor k projektu.");
      setInfo("Soubor projektu je nahranĂ˝.");
      setProjectFileCategory("other");
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "NeĹˇlo nahrĂˇt soubor k projektu.");
    } finally {
      setBusy(null);
    }
  }

  async function openAttachment(attachment: ProjectAttachment) {
    if (!token || !selectedTask) return;
    setBusy(`attachment-open-${attachment.id}`);
    setErr(null);
    try {
      const res = await fetch(`/api/projects/tasks/${selectedTask.id}/attachments?attachment_id=${encodeURIComponent(attachment.id)}`, {
        method: "GET",
        headers: { authorization: `Bearer ${token}` },
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; signed_url?: string | null };
      if (!res.ok || !data.signed_url) throw new Error(data.error || "Ne\u0161lo otev\u0159\u00edt p\u0159\u00edlohu.");
      window.open(data.signed_url, "_blank", "noopener,noreferrer");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Ne\u0161lo otev\u0159\u00edt p\u0159\u00edlohu.");
    } finally {
      setBusy(null);
    }
  }

  async function openProjectFile(file: ProjectFile) {
    if (!token || !selectedProject) return;
    setBusy(`project-file-open-${file.id}`);
    setErr(null);
    try {
      const res = await fetch(`/api/projects/${selectedProject.id}/attachments?file_id=${encodeURIComponent(file.id)}`, {
        method: "GET",
        headers: { authorization: `Bearer ${token}` },
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; signed_url?: string | null };
      if (!res.ok || !data.signed_url) throw new Error(data.error || "NeĹˇlo otevĹ™Ă­t soubor projektu.");
      window.open(data.signed_url, "_blank", "noopener,noreferrer");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "NeĹˇlo otevĹ™Ă­t soubor projektu.");
    } finally {
      setBusy(null);
    }
  }

  async function previewProjectFile(file: ProjectFile) {
    if (!token || !selectedProject) return;
    setBusy(`project-file-preview-${file.id}`);
    setErr(null);
    try {
      const res = await fetch(`/api/projects/${selectedProject.id}/attachments?file_id=${encodeURIComponent(file.id)}`, {
        method: "GET",
        headers: { authorization: `Bearer ${token}` },
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; signed_url?: string | null };
      if (!res.ok || !data.signed_url) throw new Error(data.error || "NeĹˇlo naÄŤĂ­st nĂˇhled souboru projektu.");
      setProjectFilePreview({
        name: file.file_name,
        url: data.signed_url,
        contentType: file.content_type,
      });
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "NeĹˇlo naÄŤĂ­st nĂˇhled souboru projektu.");
    } finally {
      setBusy(null);
    }
  }

  async function deleteAttachment(attachment: ProjectAttachment) {
    if (!token || !selectedTask || !confirm(`Smazat p\u0159\u00edlohu "${attachment.file_name}"?`)) return;
    setBusy(`attachment-delete-${attachment.id}`);
    setErr(null);
    try {
      const res = await fetch(`/api/projects/tasks/${selectedTask.id}/attachments?attachment_id=${encodeURIComponent(attachment.id)}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Ne\u0161lo smazat p\u0159\u00edlohu.");
      setInfo("P\u0159\u00edloha je smazan\u00e1.");
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Ne\u0161lo smazat p\u0159\u00edlohu.");
    } finally {
      setBusy(null);
    }
  }

  async function deleteProjectFile(file: ProjectFile) {
    if (!token || !selectedProject || !confirm(`Smazat soubor projektu "${file.file_name}"?`)) return;
    setBusy(`project-file-delete-${file.id}`);
    setErr(null);
    try {
      const res = await fetch(`/api/projects/${selectedProject.id}/attachments?file_id=${encodeURIComponent(file.id)}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "NeĹˇlo smazat soubor projektu.");
      setInfo("Soubor projektu je smazanĂ˝.");
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "NeĹˇlo smazat soubor projektu.");
    } finally {
      setBusy(null);
    }
  }

  async function saveLabels() {
    if (!token || !selectedTask) return;
    setBusy("labels-save");
    setErr(null);
    try {
      const labels = labelsInput
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      const res = await fetch(`/api/projects/tasks/${selectedTask.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ labels }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Ne\u0161lo ulo\u017eit \u0161t\u00edtky.");
      setInfo("\u0160t\u00edtky jsou ulo\u017een\u00e9.");
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Ne\u0161lo ulo\u017eit \u0161t\u00edtky.");
    } finally {
      setBusy(null);
    }
  }

  async function updateProjectStatus(status: ProjectStatus) {
    if (!token || !selectedProject || !isAdmin) return;
    setBusy("project-status");
    setErr(null);
    setInfo(null);
    try {
      const res = await fetch(`/api/projects/${selectedProject.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "NeĹˇlo zmÄ›nit stav projektu.");
      setInfo(status === "archived" ? "Projekt je pĹ™esunutĂ˝ do archivu." : "Projekt je znovu aktivnĂ­.");
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "NeĹˇlo zmÄ›nit stav projektu.");
    } finally {
      setBusy(null);
    }
  }

  function applyTemplateToTaskForm() {
    if (!taskTemplateKey) return;
    const template = checklistTemplates.find((item) => item.key === taskTemplateKey);
    if (!template) return;
    setTaskForm((current) => {
      const existing = current.checklistText.trim();
      const next = template.items.join("\n");
      return { ...current, checklistText: existing ? `${existing}\n${next}` : next };
    });
  }

  async function applyTemplateToSelectedTask() {
    if (!token || !selectedTask || !checklistTemplateKey) return;
    const template = checklistTemplates.find((item) => item.key === checklistTemplateKey);
    if (!template) return;
    setBusy("check-template");
    setErr(null);
    try {
      for (const text of template.items) {
        const res = await fetch("/api/projects/checklist", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
          body: JSON.stringify({ task_id: selectedTask.id, text }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "NeĹˇlo vloĹľit Ĺˇablonu checklistu.");
      }
      setChecklistTemplateKey("");
      setInfo("Checklist Ĺˇablona je pĹ™idanĂˇ.");
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "NeĹˇlo vloĹľit Ĺˇablonu checklistu.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <AppShell
      area="auto"
      title={UI.title}
      subtitle={UI.subtitle}
      actions={
        <>
          <Button variant="secondary" onClick={load}>
            {UI.refresh}
          </Button>
          {isAdmin ? (
            <Button variant="secondary" onClick={() => setProjectFormOpen((value) => !value)}>
              {UI.newProject}
            </Button>
          ) : null}
          {isAdmin && selectedProject ? (
            <Button onClick={() => setTaskFormOpen((value) => !value)} disabled={selectedProject.status === "archived"}>
              {UI.newTask}
            </Button>
          ) : null}
        </>
      }
    >
      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)_400px]">
        <Card>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">{UI.projects}</h2>
              <p className="mt-1 text-sm text-slate-600">{UI.projectsSubtitle}</p>
            </div>
            <Pill tone="neutral">{filteredProjects.length}</Pill>
          </div>

          <div className="mt-4 space-y-3 rounded-2xl border bg-slate-50 p-4">
            <input
              className="w-full rounded-2xl border bg-white px-3 py-2 text-sm"
              placeholder={UI.searchProjects}
              value={projectQuery}
              onChange={(e) => setProjectQuery(e.target.value)}
            />
            <div className="grid grid-cols-3 gap-2 rounded-2xl border bg-white p-1">
              {([
                ["active", `AktivnĂ­ ${activeProjectCount}`],
                ["archived", `Archiv ${archivedProjectCount}`],
                ["all", `VĹˇe ${bundle.projects.length}`],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setProjectStatusFilter(value)}
                  className={`rounded-xl px-3 py-2 text-xs font-semibold ${
                    projectStatusFilter === value ? "bg-slate-950 text-white" : "text-slate-600"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {projectFormOpen ? (
            <div className="mt-4 space-y-3 rounded-2xl border bg-slate-50 p-4">
              <Field label={"N\u00e1zev projektu"}>
                <input className="mt-2 w-full rounded-2xl border bg-white px-3 py-2 text-sm" value={projectTitle} onChange={(e) => setProjectTitle(e.target.value)} />
              </Field>
              <Field label={"Popis"}>
                <textarea className="mt-2 w-full rounded-2xl border bg-white px-3 py-2 text-sm" rows={4} value={projectDescription} onChange={(e) => setProjectDescription(e.target.value)} />
              </Field>
              <Field label={"Stavba"}>
                <select className="mt-2 w-full rounded-2xl border bg-white px-3 py-2 text-sm" value={projectSiteId} onChange={(e) => setProjectSiteId(e.target.value)}>
                  <option value="">{"Bez stavby"}</option>
                  {bundle.sites.map((site) => (
                    <option key={site.id} value={site.id}>{site.name}</option>
                  ))}
                </select>
              </Field>
              <Field label={"\u010clenov\u00e9 projektu"}>
                <div className="mt-2 flex flex-wrap gap-2">
                  {bundle.users.filter((user) => user.is_active !== false).map((user) => {
                    const active = projectMemberIds.includes(user.id);
                    return (
                      <button key={user.id} type="button" onClick={() => setProjectMemberIds((current) => active ? current.filter((id) => id !== user.id) : [...current, user.id])} className={`rounded-full border px-3 py-2 text-xs font-semibold ${active ? "border-blue-200 bg-blue-50 text-blue-900" : "border-slate-200 bg-white text-slate-600"}`}>
                        {user.name}
                      </button>
                    );
                  })}
                </div>
              </Field>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setProjectFormOpen(false)}>{UI.cancel}</Button>
                <Button onClick={createProject} disabled={busy === "project-create"}>{busy === "project-create" ? "Ukl\u00e1d\u00e1m" : UI.createProject}</Button>
              </div>
            </div>
          ) : null}

          <div className="mt-4 space-y-3">
            {filteredProjects.length ? filteredProjects.map((project) => {
              const active = project.id === selectedProjectId;
              const count = projectTaskCounts.get(project.id) || 0;
              const site = project.site_id ? sitesById.get(project.site_id)?.name : null;
              return (
                <button key={project.id} type="button" onClick={() => setSelectedProjectId(project.id)} className={`w-full rounded-2xl border px-4 py-4 text-left transition ${active ? "border-blue-200 bg-blue-50 shadow-sm" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-950">{project.title}</div>
                      {site ? <div className="mt-1 text-xs text-slate-500">{site}</div> : null}
                    </div>
                    <Pill tone={project.status === "active" ? "ok" : "neutral"}>{projectStatusLabel[project.status]}</Pill>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-500">
                    <span>{count} {"\u00fakol\u016f"}</span>
                    {project.status === "archived" ? <span>Jen ke ÄŤtenĂ­ a dohledĂˇnĂ­</span> : null}
                  </div>
                </button>
              );
            }) : <EmptyState title={UI.emptyProjectsTitle} text={"Na zvolenĂ˝ filtr nebo hledĂˇnĂ­ teÄŹ nic nesedĂ­."} />}
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            {selectedProject ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-semibold text-slate-950">{selectedProject.title}</h2>
                      <Pill tone={selectedProject.status === "active" ? "ok" : "neutral"}>{projectStatusLabel[selectedProject.status]}</Pill>
                    </div>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{selectedProject.description || UI.noProjectDescription}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm text-slate-600 sm:grid-cols-3">
                    <MiniStat label={"\u010clenov\u00e9"} value={String(selectedProjectMembers.length)} />
                    <MiniStat label={"Otev\u0159en\u00e9 \u00fakoly"} value={String(selectedProjectTasks.filter((task) => task.status !== "done").length)} />
                    <MiniStat label={"Hotovo"} value={String(groupedTasks.done.length)} />
                  </div>
                </div>

                {isAdmin ? (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {selectedProject.status === "active" ? (
                      <Button variant="secondary" onClick={() => updateProjectStatus("archived")} disabled={busy === "project-status"}>
                        {busy === "project-status" ? "UklĂˇdĂˇm" : "PĹ™esunout do archivu"}
                      </Button>
                    ) : (
                      <Button variant="secondary" onClick={() => updateProjectStatus("active")} disabled={busy === "project-status"}>
                        {busy === "project-status" ? "UklĂˇdĂˇm" : "VrĂˇtit mezi aktivnĂ­"}
                      </Button>
                    )}
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
                      Archiv je pro hotovĂ© nebo pozastavenĂ© akce, aby nezavazely v dennĂ­m provozu.
                    </span>
                  </div>
                ) : null}

                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  <SubCard>
                    <div className="text-xs font-medium text-slate-500">{"Moje otev\u0159en\u00e9 \u00fakoly"}</div>
                    <div className="mt-2 text-2xl font-semibold text-slate-950">{myTasks.filter((task) => task.status !== "done").length}</div>
                    <div className="mt-2 text-xs text-slate-500">{"\u00dakoly, kter\u00e9 m\u00e1m v tomto projektu p\u0159i\u0159azen\u00e9."}</div>
                  </SubCard>
                  <SubCard>
                    <div className="text-xs font-medium text-slate-500">{"Po term\u00ednu"}</div>
                    <div className="mt-2 text-2xl font-semibold text-amber-700">{overdueTasks.length}</div>
                    <div className="mt-2 text-xs text-slate-500">{overdueTasks.length ? overdueTasks.slice(0, 2).map((task) => task.title).join(" \u00b7 ") : "V tomhle projektu te\u010f nic neho\u0159\u00ed."}</div>
                  </SubCard>
                  <SubCard>
                    <div className="text-xs font-medium text-slate-500">{"Posledn\u00ed zm\u011bny"}</div>
                    <div className="mt-2 text-2xl font-semibold text-slate-950">{recentProjectActivity.length}</div>
                    <div className="mt-2 text-xs text-slate-500">{recentProjectActivity.length ? activityLabel(recentProjectActivity[0]) : "Bez nov\u00fdch zm\u011bn od ostatn\u00edch."}</div>
                  </SubCard>
                </div>

                <div className="mt-5 rounded-2xl border bg-slate-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <SectionHeader title={"Soubory projektu"} count={selectedProjectFiles.length} />
                    <div className="grid grid-cols-2 gap-2 rounded-2xl border bg-white p-1 sm:grid-cols-5">
                      {([
                        ["all", "VĹˇe"],
                        ["photo", "Fotky"],
                        ["pdf", "PDF"],
                        ["drawing", "VĂ˝kresy"],
                        ["handover", "PĹ™edĂˇnĂ­"],
                      ] as const).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setProjectFileFilter(value)}
                          className={`rounded-xl px-3 py-2 text-xs font-semibold ${
                            projectFileFilter === value ? "bg-slate-950 text-white" : "text-slate-600"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {projectGalleryFiles.length ? (
                    <div className="mt-4">
                      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Fotogalerie projektu</div>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-6">
                        {projectGalleryFiles.map((file) => (
                          <button
                            key={`gallery-${file.id}`}
                            type="button"
                            onClick={() => previewProjectFile(file)}
                            className="overflow-hidden rounded-2xl border bg-white text-left shadow-sm transition hover:border-blue-200 hover:shadow"
                          >
                            <div className="aspect-[4/3] bg-slate-100">
                              <div className="flex h-full items-center justify-center px-3 text-center text-xs font-semibold text-slate-400">
                                {file.file_name}
                              </div>
                            </div>
                            <div className="border-t px-3 py-2 text-xs text-slate-600">{fmtDateTime(file.created_at)}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-3 space-y-2">
                    {filteredProjectFiles.length ? (
                      filteredProjectFiles.map((file) => {
                        const uploadedBy = file.uploaded_by ? usersById.get(file.uploaded_by)?.name : null;
                        return (
                          <div key={file.id} className="rounded-2xl border bg-white px-4 py-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-slate-950">{file.file_name}</div>
                                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                  <Pill tone="neutral">{projectFileCategoryLabel[file.category]}</Pill>
                                  <span>{uploadedBy ? `${uploadedBy} Â· ` : ""}{fmtDateTime(file.created_at)} Â· {fmtSize(file.size_bytes)}</span>
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Button variant="secondary" onClick={() => previewProjectFile(file)} disabled={busy === `project-file-preview-${file.id}`}>
                                  NĂˇhled
                                </Button>
                                <Button variant="secondary" onClick={() => openProjectFile(file)} disabled={busy === `project-file-open-${file.id}`}>
                                  {UI.open}
                                </Button>
                                {isAdmin ? (
                                  <Button
                                    variant="secondary"
                                    onClick={() => deleteProjectFile(file)}
                                    disabled={busy === `project-file-delete-${file.id}`}
                                  >
                                    {UI.delete}
                                  </Button>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <EmptyInline text={"Na zvolenĂ˝ filtr zatĂ­m nesedĂ­ ĹľĂˇdnĂ˝ soubor projektu."} />
                    )}
                  </div>
                  {projectFilePreview ? (
                    <div className="mt-4 rounded-2xl border bg-white p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-slate-950">{projectFilePreview.name}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            {projectFilePreview.contentType?.includes("pdf")
                              ? "NĂˇhled PDF"
                              : projectFilePreview.contentType?.startsWith("image/")
                                ? "NĂˇhled obrĂˇzku"
                                : "Soubor nelze zobrazit pĹ™Ă­mo, ale lze ho otevĹ™Ă­t."}
                          </div>
                        </div>
                        <Button variant="secondary" onClick={() => setProjectFilePreview(null)}>
                          ZavĹ™Ă­t nĂˇhled
                        </Button>
                      </div>
                      <div className="mt-4 overflow-hidden rounded-2xl border bg-slate-50">
                        {projectFilePreview.contentType?.startsWith("image/") ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={projectFilePreview.url} alt={projectFilePreview.name} className="max-h-[440px] w-full object-contain bg-white" />
                        ) : projectFilePreview.contentType?.includes("pdf") ? (
                          <iframe src={projectFilePreview.url} title={projectFilePreview.name} className="h-[440px] w-full bg-white" />
                        ) : (
                          <div className="p-6 text-sm text-slate-600">
                            Tento typ souboru nemĂˇ pĹ™Ă­mĂ˝ nĂˇhled. OtevĹ™i ho pĹ™es tlaÄŤĂ­tko <span className="font-semibold">OtevĹ™Ă­t</span>.
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <select
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
                      value={projectFileCategory}
                      onChange={(e) => setProjectFileCategory(e.target.value as ProjectFileCategory)}
                    >
                      <option value="photo">Fotky</option>
                      <option value="pdf">PDF</option>
                      <option value="drawing">VĂ˝kresy</option>
                      <option value="handover">PĹ™edĂˇnĂ­</option>
                      <option value="document">Dokumenty</option>
                      <option value="other">OstatnĂ­</option>
                    </select>
                    <label className="inline-flex cursor-pointer items-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm">
                      <input
                        type="file"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) uploadProjectFile(file);
                          e.currentTarget.value = "";
                        }}
                      />
                      {busy === "project-file-upload" ? "NahrĂˇvĂˇm soubor projektu" : "PĹ™idat soubor projektu"}
                    </label>
                    <span className="text-xs text-slate-500">
                      Sem patĹ™Ă­ podklady k celĂ© akci: nabĂ­dka, vĂ˝kres, PDF, fotky nebo pĹ™edĂˇvacĂ­ dokumenty.
                    </span>
                  </div>
                  <div className="mt-5 rounded-2xl border bg-white p-4">
                    <SectionHeader title={"Aktivita souborĹŻ projektu"} count={selectedProjectFileActivity.length} />
                    <div className="mt-3 space-y-2">
                      {selectedProjectFileActivity.length ? (
                        selectedProjectFileActivity.map((item) => (
                          <div key={item.id} className="rounded-2xl border bg-slate-50 px-4 py-3">
                            <div className="text-sm font-semibold text-slate-950">{projectFileActivityLabel(item)}</div>
                            <div className="mt-1 text-xs text-slate-500">
                              {(item.actor_user_id ? usersById.get(item.actor_user_id)?.name : "SystĂ©m") || "SystĂ©m"} Â· {fmtDateTime(item.created_at)}
                            </div>
                            {item.detail && Object.keys(item.detail).length ? (
                              <div className="mt-2 text-xs leading-5 text-slate-600">{projectFileActivityDetail(item.detail)}</div>
                            ) : null}
                          </div>
                        ))
                      ) : (
                        <EmptyInline text={"ZatĂ­m bez zapsanĂ© projektovĂ© aktivity kolem souborĹŻ."} />
                      )}
                    </div>
                  </div>
                </div>                {taskFormOpen && isAdmin ? (
                  <div className="mt-5 rounded-2xl border bg-slate-50 p-4">
                    <div className="text-sm font-semibold">{UI.newTask}</div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <Field label={"N\u00e1zev \u00fakolu"}>
                        <input className="mt-2 w-full rounded-2xl border bg-white px-3 py-2 text-sm" value={taskForm.title} onChange={(e) => setTaskForm((current) => ({ ...current, title: e.target.value }))} />
                      </Field>
                      <Field label={"Term\u00edn"}>
                        <input type="date" className="mt-2 w-full rounded-2xl border bg-white px-3 py-2 text-sm" value={taskForm.due_date} onChange={(e) => setTaskForm((current) => ({ ...current, due_date: e.target.value }))} />
                      </Field>
                      <Field label={"Popis"}>
                        <textarea className="mt-2 w-full rounded-2xl border bg-white px-3 py-2 text-sm" rows={4} value={taskForm.description} onChange={(e) => setTaskForm((current) => ({ ...current, description: e.target.value }))} />
                      </Field>
                      <Field label={"\u0158e\u0161itel\u00e9"}>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {availableMembers.map((member) => {
                            const active = taskForm.assignee_ids.includes(member.id);
                            return (
                              <button key={member.id} type="button" onClick={() => setTaskForm((current) => ({ ...current, assignee_ids: active ? current.assignee_ids.filter((id) => id !== member.id) : [...current.assignee_ids, member.id] }))} className={`rounded-full border px-3 py-2 text-xs font-semibold ${active ? "border-blue-200 bg-blue-50 text-blue-900" : "border-slate-200 bg-white text-slate-600"}`}>
                                {member.name}
                              </button>
                            );
                          })}
                        </div>
                      </Field>
                    </div>
                    <Field label={"Checklist (jeden bod na \u0159\u00e1dek)"}>
                      <textarea className="mt-2 w-full rounded-2xl border bg-white px-3 py-2 text-sm" rows={5} value={taskForm.checklistText} onChange={(e) => setTaskForm((current) => ({ ...current, checklistText: e.target.value }))} />
                    </Field>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <select className="flex-1 rounded-2xl border bg-white px-3 py-2 text-sm" value={taskTemplateKey} onChange={(e) => setTaskTemplateKey(e.target.value)}>
                        <option value="">Vybrat Ĺˇablonu checklistu</option>
                        {checklistTemplates.map((template) => (
                          <option key={template.key} value={template.key}>{template.label}</option>
                        ))}
                      </select>
                      <Button variant="secondary" onClick={applyTemplateToTaskForm}>PouĹľĂ­t Ĺˇablonu</Button>
                    </div>
                    <div className="mt-4 flex justify-end gap-2">
                      <Button variant="secondary" onClick={() => setTaskFormOpen(false)}>{UI.cancel}</Button>
                      <Button onClick={createTask} disabled={busy === "task-create"}>{busy === "task-create" ? "Ukl\u00e1d\u00e1m" : UI.saveTask}</Button>
                    </div>
                  </div>
                ) : null}

                <div className="mt-5 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-950">{"Board \u00fakol\u016f"}</div>
                    <div className="mt-1 text-xs text-slate-500">{"Karty m\u016f\u017ee\u0161 p\u0159etahovat mezi sloupci nebo m\u011bnit stav tla\u010d\u00edtkem p\u0159\u00edmo na kart\u011b."}</div>
                  </div>
                  {draggingTaskId ? <Pill tone="neutral">{"P\u0159esu\u0148 kartu do c\u00edlov\u00e9ho sloupce"}</Pill> : null}
                </div>

                <div className="mt-4 grid gap-4 xl:grid-cols-3">
                  {(["todo", "doing", "done"] as TaskStatus[]).map((status) => (
                    <TaskColumn
                      key={status}
                      status={status}
                      title={taskStatusLabel[status]}
                      tone={status === "todo" ? "amber" : status === "doing" ? "blue" : "ok"}
                      tasks={groupedTasks[status]}
                      selectedTaskId={selectedTaskId}
                      assignees={bundle.assignees}
                      labels={bundle.labels}
                      usersById={usersById}
                      busy={busy}
                      draggingTaskId={draggingTaskId}
                      dragOverStatus={dragOverStatus}
                      onSelect={setSelectedTaskId}
                      onStatusChange={updateTaskStatus}
                      onMoveTask={moveTaskToStatus}
                      onDragStart={setDraggingTaskId}
                      onDragEnd={() => {
                        setDraggingTaskId(null);
                        setDragOverStatus(null);
                      }}
                      onDragOverStatus={setDragOverStatus}
                    />
                  ))}
                </div>
              </>
            ) : <EmptyState title={UI.emptyProjectTitle} text={UI.emptyProjectText} />}
          </Card>
        </div>

        <Card>
          {selectedTask ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone={selectedTask.status === "done" ? "ok" : selectedTask.status === "doing" ? "neutral" : "warn"}>{taskStatusLabel[selectedTask.status]}</Pill>
                    {selectedTask.completed_at ? <Pill tone="ok">{"Dokon\u010deno"} {fmtDateTime(selectedTask.completed_at)}</Pill> : null}
                  </div>
                  <h2 className="mt-3 text-xl font-semibold text-slate-950">{selectedTask.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{selectedTask.description || UI.noTaskDescription}</p>
                </div>
                <div className="flex gap-2">
                  {isAdmin ? <Button variant="secondary" onClick={() => setEditTaskOpen((value) => !value)}>{UI.editTask}</Button> : null}
                  {isAdmin ? <Button variant="secondary" onClick={() => deleteTask(selectedTask.id)} disabled={busy === `task-delete-${selectedTask.id}`}>{UI.delete}</Button> : null}
                </div>
              </div>

              {editTaskOpen && isAdmin && editTask ? (
                <div className="mt-4 rounded-2xl border bg-slate-50 p-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label={"N\u00e1zev \u00fakolu"}>
                      <input className="mt-2 w-full rounded-2xl border bg-white px-3 py-2 text-sm" value={editTask.title} onChange={(e) => setEditTask((current) => (current ? { ...current, title: e.target.value } : current))} />
                    </Field>
                    <Field label={"Term\u00edn"}>
                      <input type="date" className="mt-2 w-full rounded-2xl border bg-white px-3 py-2 text-sm" value={editTask.due_date} onChange={(e) => setEditTask((current) => (current ? { ...current, due_date: e.target.value } : current))} />
                    </Field>
                    <Field label={"Popis"}>
                      <textarea className="mt-2 w-full rounded-2xl border bg-white px-3 py-2 text-sm" rows={4} value={editTask.description} onChange={(e) => setEditTask((current) => (current ? { ...current, description: e.target.value } : current))} />
                    </Field>
                    <Field label={"\u0158e\u0161itel\u00e9"}>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {availableMembers.map((member) => {
                          const active = editTask.assignee_ids.includes(member.id);
                          return (
                            <button key={member.id} type="button" onClick={() => setEditTask((current) => current ? { ...current, assignee_ids: active ? current.assignee_ids.filter((id) => id !== member.id) : [...current.assignee_ids, member.id] } : current)} className={`rounded-full border px-3 py-2 text-xs font-semibold ${active ? "border-blue-200 bg-blue-50 text-blue-900" : "border-slate-200 bg-white text-slate-600"}`}>
                              {member.name}
                            </button>
                          );
                        })}
                      </div>
                    </Field>
                  </div>
                  <div className="mt-4 flex justify-end gap-2">
                    <Button variant="secondary" onClick={() => setEditTaskOpen(false)}>{UI.close}</Button>
                    <Button onClick={saveTaskEdit} disabled={busy === "task-edit"}>{busy === "task-edit" ? "Ukl\u00e1d\u00e1m" : UI.saveChanges}</Button>
                  </div>
                </div>
              ) : null}

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <SubCard>
                  <div className="text-xs font-medium text-slate-500">{"Term\u00edn spln\u011bn\u00ed"}</div>
                  <div className={`mt-2 text-base font-semibold ${selectedTask.due_date ? "text-blue-700" : "text-slate-950"}`}>{fmtDate(selectedTask.due_date)}</div>
                </SubCard>
                <SubCard>
                  <div className="text-xs font-medium text-slate-500">{"\u0158e\u0161itel\u00e9"}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {taskAssignees.length ? taskAssignees.map((user) => <span key={user.id} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">{user.name}</span>) : <span className="text-sm text-slate-500">{"Bez p\u0159i\u0159azen\u00fdch lid\u00ed"}</span>}
                  </div>
                </SubCard>
              </div>

              <SectionHeader title={"\u0160t\u00edtky"} count={taskLabels.length} />
              <div className="mt-3 flex flex-wrap gap-2">
                {taskLabels.length ? taskLabels.map((label) => <span key={label.id} className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-900">{label.label}</span>) : <EmptyInline text={"Zat\u00edm bez \u0161t\u00edtk\u016f."} />}
              </div>
              {isAdmin ? (
                <div className="mt-3 flex gap-2">
                  <input className="flex-1 rounded-2xl border px-3 py-2 text-sm" placeholder={"Nap\u0159. urgent, revize, \u010dek\u00e1 na materi\u00e1l"} value={labelsInput} onChange={(e) => setLabelsInput(e.target.value)} />
                  <Button onClick={saveLabels} disabled={busy === "labels-save"}>{busy === "labels-save" ? "Ukl\u00e1d\u00e1m" : UI.save}</Button>
                </div>
              ) : null}

              <SectionHeader title={"Checklist"} count={taskChecklist.length} className="mt-5" />
              <div className="mt-3 space-y-2">
                {taskChecklist.length ? taskChecklist.map((item) => {
                  const doneBy = item.done_by ? usersById.get(item.done_by)?.name : null;
                  return (
                    <label key={item.id} className={`flex items-start gap-3 rounded-2xl border px-3 py-3 ${item.is_done ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"}`}>
                      <input type="checkbox" checked={item.is_done} onChange={(e) => toggleChecklist(item, e.target.checked)} disabled={busy === `check-${item.id}`} className="mt-1 h-4 w-4 rounded border-slate-300" />
                      <div className="min-w-0">
                        <div className={`text-sm ${item.is_done ? "font-semibold text-emerald-900 line-through" : "text-slate-800"}`}>{item.text}</div>
                        {doneBy ? <div className="mt-1 text-xs text-slate-500">{"Ozna\u010dil"}: {doneBy} {"\u00b7"} {fmtDateTime(item.done_at)}</div> : null}
                      </div>
                    </label>
                  );
                }) : <EmptyInline text={"Tento \u00fakol je\u0161t\u011b nem\u00e1 checklist."} />}
              </div>
              {isAdmin ? (
                <div className="mt-3 space-y-3">
                  <div className="flex gap-2">
                    <input className="flex-1 rounded-2xl border px-3 py-2 text-sm" placeholder={"P\u0159idat dal\u0161\u00ed bod checklistu"} value={newChecklistText} onChange={(e) => setNewChecklistText(e.target.value)} />
                    <Button onClick={addChecklist} disabled={busy === "check-create"}>{busy === "check-create" ? "P\u0159id\u00e1v\u00e1m" : UI.add}</Button>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <select className="flex-1 rounded-2xl border bg-white px-3 py-2 text-sm" value={checklistTemplateKey} onChange={(e) => setChecklistTemplateKey(e.target.value)}>
                      <option value="">PĹ™idat checklist ze Ĺˇablony</option>
                      {checklistTemplates.map((template) => (
                        <option key={template.key} value={template.key}>{template.label}</option>
                      ))}
                    </select>
                    <Button variant="secondary" onClick={applyTemplateToSelectedTask} disabled={busy === "check-template"}>
                      {busy === "check-template" ? "VklĂˇdĂˇm Ĺˇablonu" : "PĹ™idat Ĺˇablonu"}
                    </Button>
                  </div>
                </div>
              ) : null}

              <SectionHeader title={"P\u0159\u00edlohy"} count={taskAttachments.length} className="mt-5" />
              <div className="mt-3 space-y-2">
                {taskAttachments.length ? taskAttachments.map((attachment) => {
                  const uploadedBy = attachment.uploaded_by ? usersById.get(attachment.uploaded_by)?.name : null;
                  return (
                    <div key={attachment.id} className="rounded-2xl border bg-white px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-950">{attachment.file_name}</div>
                          <div className="mt-1 text-xs text-slate-500">{uploadedBy ? `${uploadedBy} \u00b7 ` : ""}{fmtDateTime(attachment.created_at)} {"\u00b7"} {fmtSize(attachment.size_bytes)}</div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button variant="secondary" onClick={() => openAttachment(attachment)} disabled={busy === `attachment-open-${attachment.id}`}>{UI.open}</Button>
                          {isAdmin ? <Button variant="secondary" onClick={() => deleteAttachment(attachment)} disabled={busy === `attachment-delete-${attachment.id}`}>{UI.delete}</Button> : null}
                        </div>
                      </div>
                    </div>
                  );
                }) : <EmptyInline text={"Zat\u00edm bez p\u0159\u00edloh."} />}
              </div>
              {isAdmin ? (
                <div className="mt-3">
                  <label className="inline-flex cursor-pointer items-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm">
                    <input type="file" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) uploadAttachment(file); e.currentTarget.value = ""; }} />
                    {busy === "attachment-upload" ? "Nahr\u00e1v\u00e1m p\u0159\u00edlohu" : UI.uploadAttachment}
                  </label>
                </div>
              ) : null}

              <SectionHeader title={"Koment\u00e1\u0159e"} count={taskComments.length} className="mt-5" />
              <div className="mt-3 space-y-3">
                {taskComments.length ? taskComments.map((comment) => (
                  <div key={comment.id} className="rounded-2xl border bg-slate-50 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="font-semibold text-slate-700">{usersById.get(comment.user_id)?.name || "Pracovn\u00edk"}</span>
                      <span>{fmtDateTime(comment.created_at)}</span>
                    </div>
                    <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{comment.body}</div>
                  </div>
                )) : <EmptyInline text={"Zat\u00edm bez koment\u00e1\u0159\u016f."} />}
              </div>
              <div className="mt-3 space-y-2">
                <textarea className="w-full rounded-2xl border px-3 py-2 text-sm" rows={4} placeholder={"Pozn\u00e1mka, postup, dotaz nebo potvrzen\u00ed dokon\u010den\u00ed..."} value={commentBody} onChange={(e) => setCommentBody(e.target.value)} />
                <div className="flex justify-end">
                  <Button onClick={addComment} disabled={busy === "comment-create"}>{busy === "comment-create" ? "Ukl\u00e1d\u00e1m" : UI.addComment}</Button>
                </div>
              </div>

              <SectionHeader title={"Aktivita"} count={taskActivity.length} className="mt-5" />
              <div className="mt-3 space-y-2">
                {taskActivity.length ? taskActivity.map((item) => (
                  <div key={item.id} className="rounded-2xl border bg-slate-50 px-4 py-3">
                    <div className="text-sm font-semibold text-slate-950">{activityLabel(item)}</div>
                    <div className="mt-1 text-xs text-slate-500">{(item.actor_user_id ? usersById.get(item.actor_user_id)?.name : "Syst\u00e9m") || "Syst\u00e9m"} {"\u00b7"} {fmtDateTime(item.created_at)}</div>
                    {item.detail && Object.keys(item.detail).length ? <div className="mt-2 text-xs leading-5 text-slate-600">{activityDetail(item.detail)}</div> : null}
                  </div>
                )) : <EmptyInline text={"Zat\u00edm bez zapsan\u00e9 aktivity."} />}
              </div>
            </>
          ) : <EmptyState title={UI.emptyTaskTitle} text={UI.emptyTaskText} />}
        </Card>
      </div>

      {err ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</div> : null}
      {info ? <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{info}</div> : null}
    </AppShell>
  );
}

function TaskColumn({
  status,
  title,
  tone,
  tasks,
  selectedTaskId,
  assignees,
  labels,
  usersById,
  busy,
  draggingTaskId,
  dragOverStatus,
  onSelect,
  onStatusChange,
  onMoveTask,
  onDragStart,
  onDragEnd,
  onDragOverStatus,
}: {
  status: TaskStatus;
  title: string;
  tone: "amber" | "blue" | "ok";
  tasks: ProjectTask[];
  selectedTaskId: string;
  assignees: ProjectTaskAssignee[];
  labels: ProjectTaskLabel[];
  usersById: Map<string, ProjectUser>;
  busy: string | null;
  draggingTaskId: string | null;
  dragOverStatus: TaskStatus | null;
  onSelect: (id: string) => void;
  onStatusChange: (id: string, status: TaskStatus) => void;
  onMoveTask: (id: string, status: TaskStatus) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDragOverStatus: (status: TaskStatus | null) => void;
}) {
  const toneClass = tone === "amber" ? "border-amber-200 bg-amber-50" : tone === "blue" ? "border-blue-200 bg-blue-50" : "border-emerald-200 bg-emerald-50";
  const dropActive = dragOverStatus === status && draggingTaskId;

  return (
    <div className={`rounded-3xl border p-4 transition ${toneClass} ${dropActive ? "ring-2 ring-slate-950/10" : ""}`} onDragOver={(event) => { if (!draggingTaskId) return; event.preventDefault(); onDragOverStatus(status); }} onDragLeave={() => { if (dragOverStatus === status) onDragOverStatus(null); }} onDrop={(event) => { if (!draggingTaskId) return; event.preventDefault(); onMoveTask(draggingTaskId, status); onDragEnd(); }}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-slate-950">{title}</div>
        <Pill tone={tone === "ok" ? "ok" : tone === "amber" ? "warn" : "neutral"}>{tasks.length}</Pill>
      </div>
      {dropActive ? <div className="mt-3 rounded-2xl border border-dashed border-slate-400 bg-white/70 px-3 py-3 text-center text-xs font-semibold text-slate-600">{"Pus\u0165 kartu sem"}</div> : null}
      <div className="mt-4 space-y-3">
        {tasks.length ? tasks.map((task) => {
          const members = assignees.filter((assignee) => assignee.task_id === task.id).map((assignee) => usersById.get(assignee.user_id)?.name).filter(Boolean) as string[];
          const taskLabels = labels.filter((label) => label.task_id === task.id);
          return (
            <button key={task.id} type="button" draggable onDragStart={() => onDragStart(task.id)} onDragEnd={onDragEnd} onClick={() => onSelect(task.id)} className={`w-full rounded-2xl border bg-white px-4 py-4 text-left shadow-sm transition ${selectedTaskId === task.id ? "border-slate-950" : "border-slate-200 hover:bg-slate-50"} ${draggingTaskId === task.id ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-950">{task.title}</div>
                  <div className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{task.description || "Bez dopl\u0148uj\u00edc\u00edho popisu."}</div>
                </div>
                {task.due_date ? <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700">{fmtDate(task.due_date)}</span> : null}
              </div>
              {members.length ? <div className="mt-3 flex flex-wrap gap-2">{members.map((name) => <span key={name} className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700">{name}</span>)}</div> : null}
              {taskLabels.length ? <div className="mt-2 flex flex-wrap gap-2">{taskLabels.map((item) => <span key={item.id} className="rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-900">{item.label}</span>)}</div> : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {(["todo", "doing", "done"] as TaskStatus[]).map((nextStatus) => (
                  <button key={nextStatus} type="button" onClick={(event) => { event.stopPropagation(); onStatusChange(task.id, nextStatus); }} disabled={busy === `task-status-${task.id}` || task.status === nextStatus} className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${task.status === nextStatus ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-600"}`}>
                    {taskStatusLabel[nextStatus]}
                  </button>
                ))}
              </div>
            </button>
          );
        }) : <EmptyInline text={"Zat\u00edm bez \u00fakol\u016f v tomto sloupci."} />}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-xs font-medium text-slate-600">{label}{children}</label>;
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-slate-50 px-3 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-950">{value}</div>
    </div>
  );
}

function SectionHeader({ title, count, className = "" }: { title: string; count: number; className?: string }) {
  return (
    <div className={`flex items-center justify-between gap-3 ${className}`}>
      <h3 className="text-base font-semibold">{title}</h3>
      <Pill tone="neutral">{count}</Pill>
    </div>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-3xl border border-dashed bg-slate-50 px-5 py-10 text-center">
      <div className="text-base font-semibold text-slate-950">{title}</div>
      <div className="mt-2 text-sm leading-6 text-slate-600">{text}</div>
    </div>
  );
}

function EmptyInline({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed bg-white px-4 py-4 text-sm text-slate-500">{text}</div>;
}

function activityLabel(item: ProjectActivityLog) {
  switch (item.action) {
    case "task_created":
      return "Zalo\u017een nov\u00fd \u00fakol";
    case "task_updated":
      return "Upraven\u00fd detail \u00fakolu";
    case "task_deleted":
      return "\u00dakol byl smaz\u00e1n";
    case "comment_added":
      return "P\u0159idan\u00fd koment\u00e1\u0159";
    case "checklist_done":
      return "Od\u0161krtnut\u00fd checklist";
    case "checklist_reopened":
      return "Checklist vr\u00e1cen\u00fd zp\u011bt";
    case "attachment_added":
      return "P\u0159idan\u00e1 p\u0159\u00edloha";
    case "attachment_deleted":
      return "Smazan\u00e1 p\u0159\u00edloha";
    case "labels_updated":
      return "Upraven\u00e9 \u0161t\u00edtky";
    case "task_moved":
      return "P\u0159esunut\u00fd \u00fakol";
    default:
      return item.action;
  }
}

function activityDetail(detail: Record<string, unknown>) {
  const parts: string[] = [];
  if (typeof detail.file_name === "string") parts.push(`Soubor: ${detail.file_name}`);
  if (typeof detail.status === "string") {
    const status = detail.status as TaskStatus;
    parts.push(`Stav: ${taskStatusLabel[status] ?? detail.status}`);
  }
  if (Array.isArray(detail.labels) && detail.labels.length) parts.push(`\u0160t\u00edtky: ${detail.labels.join(", ")}`);
  if (typeof detail.text === "string") parts.push(`Bod checklistu: ${detail.text}`);
  if (typeof detail.assignee_count === "number") parts.push(`\u0158e\u0161itel\u00e9: ${detail.assignee_count}`);
  if (typeof detail.checklist_count === "number") parts.push(`Checklist: ${detail.checklist_count}`);
  if (typeof detail.length === "number") parts.push(`D\u00e9lka koment\u00e1\u0159e: ${detail.length} znak\u016f`);
  if (typeof detail.sort_order === "number") parts.push(`Po\u0159ad\u00ed: ${detail.sort_order}`);
  if (typeof detail.due_date === "string" && detail.due_date) parts.push(`Term\u00edn: ${fmtDate(detail.due_date)}`);
  return parts.join(" \u00b7 ");
}

function projectFileActivityLabel(item: ProjectFileActivityLog) {
  switch (item.action) {
    case "project_file_added":
      return "PĹ™idanĂ˝ soubor projektu";
    case "project_file_deleted":
      return "SmazanĂ˝ soubor projektu";
    default:
      return item.action;
  }
}

function projectFileActivityDetail(detail: Record<string, unknown>) {
  const parts: string[] = [];
  if (typeof detail.file_name === "string") parts.push(`Soubor: ${detail.file_name}`);
  if (typeof detail.category === "string" && detail.category in projectFileCategoryLabel) {
    parts.push(`Kategorie: ${projectFileCategoryLabel[detail.category as ProjectFileCategory]}`);
  }
  if (typeof detail.size_bytes === "number") parts.push(`Velikost: ${fmtSize(detail.size_bytes)}`);
  return parts.join(" · ");
}
