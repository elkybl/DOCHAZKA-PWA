"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppNav";
import { Button, Card, Pill, SubCard } from "@/app/components/ui";
import {
  projectStatusLabel,
  taskStatusLabel,
  type Project,
  type ProjectBundle,
  type ProjectChecklistItem,
  type ProjectComment,
  type ProjectMember,
  type ProjectSite,
  type ProjectTask,
  type ProjectTaskAssignee,
  type ProjectUser,
  type TaskStatus,
} from "@/lib/projects";

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
  if (!value) return "Bez termínu";
  return new Date(`${value}T12:00:00`).toLocaleDateString("cs-CZ");
}

function fmtDateTime(value: string | null | undefined) {
  if (!value) return "";
  return new Date(value).toLocaleString("cs-CZ");
}

const emptyBundle: ProjectBundle = {
  projects: [],
  members: [],
  tasks: [],
  assignees: [],
  checklistItems: [],
  comments: [],
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

export default function ProjectsPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<{ id: string; name: string; role: "admin" | "worker" } | null>(null);
  const [bundle, setBundle] = useState<ProjectBundle>(emptyBundle);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedTaskId, setSelectedTaskId] = useState<string>("");
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
  const [commentBody, setCommentBody] = useState("");
  const [newChecklistText, setNewChecklistText] = useState("");

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
      if (!res.ok) throw new Error(data.error || "Nepodařilo se načíst projekty.");
      setBundle({
        projects: data.projects || [],
        members: data.members || [],
        tasks: data.tasks || [],
        assignees: data.assignees || [],
        checklistItems: data.checklistItems || [],
        comments: data.comments || [],
        users: data.users || [],
        sites: data.sites || [],
      });
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Nepodařilo se načíst projekty.");
    }
  }

  useEffect(() => {
    if (!token) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!selectedProjectId && bundle.projects.length) setSelectedProjectId(bundle.projects[0].id);
    if (selectedProjectId && !bundle.projects.some((project) => project.id === selectedProjectId)) {
      setSelectedProjectId(bundle.projects[0]?.id || "");
    }
  }, [bundle.projects, selectedProjectId]);

  const selectedProject = useMemo(
    () => bundle.projects.find((project) => project.id === selectedProjectId) || null,
    [bundle.projects, selectedProjectId],
  );

  const selectedProjectMembers = useMemo(
    () => bundle.members.filter((member) => member.project_id === selectedProjectId),
    [bundle.members, selectedProjectId],
  );

  const selectedProjectTasks = useMemo(
    () => bundle.tasks.filter((task) => task.project_id === selectedProjectId),
    [bundle.tasks, selectedProjectId],
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

  const usersById = useMemo(() => new Map(bundle.users.map((user) => [user.id, user])), [bundle.users]);
  const sitesById = useMemo(() => new Map(bundle.sites.map((site) => [site.id, site])), [bundle.sites]);

  const taskAssignees = useMemo(() => {
    if (!selectedTask) return [];
    return bundle.assignees
      .filter((assignee) => assignee.task_id === selectedTask.id)
      .map((assignee) => usersById.get(assignee.user_id))
      .filter(Boolean) as ProjectUser[];
  }, [bundle.assignees, selectedTask, usersById]);

  const taskChecklist = useMemo(() => {
    if (!selectedTask) return [];
    return bundle.checklistItems.filter((item) => item.task_id === selectedTask.id);
  }, [bundle.checklistItems, selectedTask]);

  const taskComments = useMemo(() => {
    if (!selectedTask) return [];
    return bundle.comments.filter((comment) => comment.task_id === selectedTask.id);
  }, [bundle.comments, selectedTask]);

  const isAdmin = me?.role === "admin";
  const availableMembers = useMemo(() => {
    const memberSet = new Set(selectedProjectMembers.map((member) => member.user_id));
    return bundle.users.filter((user) => memberSet.has(user.id));
  }, [bundle.users, selectedProjectMembers]);

  const groupedTasks = useMemo(() => {
    const init: Record<TaskStatus, ProjectTask[]> = { todo: [], doing: [], done: [] };
    for (const task of selectedProjectTasks) init[task.status].push(task);
    return init;
  }, [selectedProjectTasks]);

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
      if (!res.ok) throw new Error(data.error || "Nešlo založit projekt.");
      setInfo("Projekt je uložený.");
      setProjectFormOpen(false);
      setProjectTitle("");
      setProjectDescription("");
      setProjectSiteId("");
      setProjectMemberIds([]);
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Nešlo založit projekt.");
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
      if (!res.ok) throw new Error(data.error || "Nešlo založit úkol.");
      setInfo("Úkol je uložený.");
      setTaskFormOpen(false);
      setTaskForm(initialTaskForm);
      await load();
      if (data.task?.id) setSelectedTaskId(data.task.id);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Nešlo založit úkol.");
    } finally {
      setBusy(null);
    }
  }

  async function updateTaskStatus(taskId: string, status: TaskStatus) {
    if (!token) return;
    setBusy(`task-status-${taskId}`);
    setErr(null);
    try {
      const res = await fetch(`/api/projects/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Nešlo změnit stav úkolu.");
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Nešlo změnit stav úkolu.");
    } finally {
      setBusy(null);
    }
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
      if (!res.ok) throw new Error(data.error || "Nešlo uložit checklist.");
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Nešlo uložit checklist.");
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
      if (!res.ok) throw new Error(data.error || "Nešlo přidat bod checklistu.");
      setNewChecklistText("");
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Nešlo přidat bod checklistu.");
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
      if (!res.ok) throw new Error(data.error || "Nešlo uložit komentář.");
      setCommentBody("");
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Nešlo uložit komentář.");
    } finally {
      setBusy(null);
    }
  }

  async function deleteTask(taskId: string) {
    if (!token || !confirm("Opravdu smazat tento úkol?")) return;
    setBusy(`task-delete-${taskId}`);
    setErr(null);
    try {
      const res = await fetch(`/api/projects/tasks/${taskId}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Nešlo smazat úkol.");
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Nešlo smazat úkol.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <AppShell
      area="auto"
      title="Projekty a úkoly"
      subtitle="Jedno místo pro akce, body k řešení, checklisty, komentáře a přehled kdo co dokončil."
      actions={
        <>
          <Button variant="secondary" onClick={load}>Obnovit</Button>
          {isAdmin ? <Button variant="secondary" onClick={() => setProjectFormOpen((value) => !value)}>Nový projekt</Button> : null}
          {isAdmin && selectedProject ? <Button onClick={() => setTaskFormOpen((value) => !value)}>Nový úkol</Button> : null}
        </>
      }
    >
      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)_380px]">
        <Card>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Projekty</h2>
              <p className="mt-1 text-sm text-slate-600">Akce, servis, realizace i interní úkoly na jednom místě.</p>
            </div>
            <Pill tone="neutral">{bundle.projects.length}</Pill>
          </div>

          {projectFormOpen ? (
            <div className="mt-4 space-y-3 rounded-2xl border bg-slate-50 p-4">
              <Field label="Název projektu">
                <input className="mt-2 w-full rounded-2xl border bg-white px-3 py-2 text-sm" value={projectTitle} onChange={(e) => setProjectTitle(e.target.value)} />
              </Field>
              <Field label="Popis">
                <textarea className="mt-2 w-full rounded-2xl border bg-white px-3 py-2 text-sm" rows={4} value={projectDescription} onChange={(e) => setProjectDescription(e.target.value)} />
              </Field>
              <Field label="Stavba">
                <select className="mt-2 w-full rounded-2xl border bg-white px-3 py-2 text-sm" value={projectSiteId} onChange={(e) => setProjectSiteId(e.target.value)}>
                  <option value="">Bez stavby</option>
                  {bundle.sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
                </select>
              </Field>
              <Field label="Členové projektu">
                <div className="mt-2 flex flex-wrap gap-2">
                  {bundle.users.filter((user) => user.is_active !== false).map((user) => {
                    const active = projectMemberIds.includes(user.id);
                    return (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => setProjectMemberIds((current) => active ? current.filter((id) => id !== user.id) : [...current, user.id])}
                        className={`rounded-full border px-3 py-2 text-xs font-semibold ${active ? "border-blue-200 bg-blue-50 text-blue-900" : "border-slate-200 bg-white text-slate-600"}`}
                      >
                        {user.name}
                      </button>
                    );
                  })}
                </div>
              </Field>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setProjectFormOpen(false)}>Zrušit</Button>
                <Button onClick={createProject} disabled={busy === "project-create"}>{busy === "project-create" ? "Ukládám" : "Uložit projekt"}</Button>
              </div>
            </div>
          ) : null}

          <div className="mt-4 space-y-3">
            {bundle.projects.length ? bundle.projects.map((project) => {
              const active = project.id === selectedProjectId;
              const count = bundle.tasks.filter((task) => task.project_id === project.id).length;
              const site = project.site_id ? sitesById.get(project.site_id)?.name : null;
              return (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => setSelectedProjectId(project.id)}
                  className={`w-full rounded-2xl border px-4 py-4 text-left transition ${active ? "border-blue-200 bg-blue-50 shadow-sm" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-950">{project.title}</div>
                      {site ? <div className="mt-1 text-xs text-slate-500">{site}</div> : null}
                    </div>
                    <Pill tone={project.status === "active" ? "ok" : "neutral"}>{projectStatusLabel[project.status]}</Pill>
                  </div>
                  <div className="mt-3 text-xs text-slate-500">{count} úkolů</div>
                </button>
              );
            }) : <EmptyState title="Zatím tu není žádný projekt" text="Začni založením první akce, ke které pak přidáš úkoly a body k dokončení." />}
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
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{selectedProject.description || "Bez doplňujícího popisu projektu."}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm text-slate-600 sm:grid-cols-3">
                    <MiniStat label="Členové" value={String(selectedProjectMembers.length)} />
                    <MiniStat label="Úkoly" value={String(selectedProjectTasks.length)} />
                    <MiniStat label="Hotovo" value={String(groupedTasks.done.length)} />
                  </div>
                </div>

                {taskFormOpen && isAdmin ? (
                  <div className="mt-4 rounded-2xl border bg-slate-50 p-4">
                    <div className="text-sm font-semibold">Nový úkol</div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <Field label="Název úkolu">
                        <input className="mt-2 w-full rounded-2xl border bg-white px-3 py-2 text-sm" value={taskForm.title} onChange={(e) => setTaskForm((current) => ({ ...current, title: e.target.value }))} />
                      </Field>
                      <Field label="Termín">
                        <input type="date" className="mt-2 w-full rounded-2xl border bg-white px-3 py-2 text-sm" value={taskForm.due_date} onChange={(e) => setTaskForm((current) => ({ ...current, due_date: e.target.value }))} />
                      </Field>
                      <Field label="Popis">
                        <textarea className="mt-2 w-full rounded-2xl border bg-white px-3 py-2 text-sm" rows={4} value={taskForm.description} onChange={(e) => setTaskForm((current) => ({ ...current, description: e.target.value }))} />
                      </Field>
                      <Field label="Řešitelé">
                        <div className="mt-2 flex flex-wrap gap-2">
                          {availableMembers.map((member) => {
                            const active = taskForm.assignee_ids.includes(member.id);
                            return (
                              <button
                                key={member.id}
                                type="button"
                                onClick={() => setTaskForm((current) => ({
                                  ...current,
                                  assignee_ids: active ? current.assignee_ids.filter((id) => id !== member.id) : [...current.assignee_ids, member.id],
                                }))}
                                className={`rounded-full border px-3 py-2 text-xs font-semibold ${active ? "border-blue-200 bg-blue-50 text-blue-900" : "border-slate-200 bg-white text-slate-600"}`}
                              >
                                {member.name}
                              </button>
                            );
                          })}
                        </div>
                      </Field>
                    </div>
                    <Field label="Checklist (jeden bod na řádek)">
                      <textarea className="mt-2 w-full rounded-2xl border bg-white px-3 py-2 text-sm" rows={5} value={taskForm.checklistText} onChange={(e) => setTaskForm((current) => ({ ...current, checklistText: e.target.value }))} />
                    </Field>
                    <div className="mt-4 flex justify-end gap-2">
                      <Button variant="secondary" onClick={() => setTaskFormOpen(false)}>Zrušit</Button>
                      <Button onClick={createTask} disabled={busy === "task-create"}>{busy === "task-create" ? "Ukládám" : "Uložit úkol"}</Button>
                    </div>
                  </div>
                ) : null}

                <div className="mt-5 grid gap-4 xl:grid-cols-3">
                  <TaskColumn
                    title={taskStatusLabel.todo}
                    tone="amber"
                    tasks={groupedTasks.todo}
                    selectedTaskId={selectedTaskId}
                    assignees={bundle.assignees}
                    usersById={usersById}
                    onSelect={setSelectedTaskId}
                    onStatusChange={updateTaskStatus}
                    busy={busy}
                  />
                  <TaskColumn
                    title={taskStatusLabel.doing}
                    tone="blue"
                    tasks={groupedTasks.doing}
                    selectedTaskId={selectedTaskId}
                    assignees={bundle.assignees}
                    usersById={usersById}
                    onSelect={setSelectedTaskId}
                    onStatusChange={updateTaskStatus}
                    busy={busy}
                  />
                  <TaskColumn
                    title={taskStatusLabel.done}
                    tone="ok"
                    tasks={groupedTasks.done}
                    selectedTaskId={selectedTaskId}
                    assignees={bundle.assignees}
                    usersById={usersById}
                    onSelect={setSelectedTaskId}
                    onStatusChange={updateTaskStatus}
                    busy={busy}
                  />
                </div>
              </>
            ) : <EmptyState title="Vyber projekt" text="Po výběru projektu tady uvidíš úkoly, body k odškrtnutí i komentáře." />}
          </Card>
        </div>

        <Card>
          {selectedTask ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone={selectedTask.status === "done" ? "ok" : selectedTask.status === "doing" ? "neutral" : "warn"}>{taskStatusLabel[selectedTask.status]}</Pill>
                    {selectedTask.completed_at ? <Pill tone="ok">Dokončeno {fmtDateTime(selectedTask.completed_at)}</Pill> : null}
                  </div>
                  <h2 className="mt-3 text-xl font-semibold text-slate-950">{selectedTask.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{selectedTask.description || "Bez doplňujícího popisu úkolu."}</p>
                </div>
                {isAdmin ? <Button variant="secondary" onClick={() => deleteTask(selectedTask.id)} disabled={busy === `task-delete-${selectedTask.id}`}>Smazat</Button> : null}
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <SubCard>
                  <div className="text-xs font-medium text-slate-500">Termín</div>
                  <div className="mt-2 text-sm font-semibold text-slate-950">{fmtDate(selectedTask.due_date)}</div>
                </SubCard>
                <SubCard>
                  <div className="text-xs font-medium text-slate-500">Řešitelé</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {taskAssignees.length ? taskAssignees.map((user) => (
                      <span key={user.id} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">{user.name}</span>
                    )) : <span className="text-sm text-slate-500">Bez přiřazených lidí</span>}
                  </div>
                </SubCard>
              </div>

              <section className="mt-5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-base font-semibold">Checklist</h3>
                  <Pill tone="neutral">{taskChecklist.length}</Pill>
                </div>
                <div className="mt-3 space-y-2">
                  {taskChecklist.length ? taskChecklist.map((item) => {
                    const doneBy = item.done_by ? usersById.get(item.done_by)?.name : null;
                    return (
                      <label key={item.id} className={`flex items-start gap-3 rounded-2xl border px-3 py-3 ${item.is_done ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"}`}>
                        <input type="checkbox" checked={item.is_done} onChange={(e) => toggleChecklist(item, e.target.checked)} disabled={busy === `check-${item.id}`} className="mt-1 h-4 w-4 rounded border-slate-300" />
                        <div className="min-w-0">
                          <div className={`text-sm ${item.is_done ? "font-semibold text-emerald-900 line-through" : "text-slate-800"}`}>{item.text}</div>
                          {doneBy ? <div className="mt-1 text-xs text-slate-500">Označil: {doneBy} · {fmtDateTime(item.done_at)}</div> : null}
                        </div>
                      </label>
                    );
                  }) : <EmptyInline text="Tento úkol ještě nemá checklist." />}
                </div>
                {isAdmin ? (
                  <div className="mt-3 flex gap-2">
                    <input className="flex-1 rounded-2xl border px-3 py-2 text-sm" placeholder="Přidat další bod checklistu" value={newChecklistText} onChange={(e) => setNewChecklistText(e.target.value)} />
                    <Button onClick={addChecklist} disabled={busy === "check-create"}>{busy === "check-create" ? "Přidávám" : "Přidat"}</Button>
                  </div>
                ) : null}
              </section>

              <section className="mt-5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-base font-semibold">Komentáře</h3>
                  <Pill tone="neutral">{taskComments.length}</Pill>
                </div>
                <div className="mt-3 space-y-3">
                  {taskComments.length ? taskComments.map((comment) => (
                    <div key={comment.id} className="rounded-2xl border bg-slate-50 px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="font-semibold text-slate-700">{usersById.get(comment.user_id)?.name || "Pracovník"}</span>
                        <span>{fmtDateTime(comment.created_at)}</span>
                      </div>
                      <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{comment.body}</div>
                    </div>
                  )) : <EmptyInline text="Zatím bez komentářů." />}
                </div>
                <div className="mt-3 space-y-2">
                  <textarea className="w-full rounded-2xl border px-3 py-2 text-sm" rows={4} placeholder="Poznámka, postup, dotaz nebo potvrzení dokončení..." value={commentBody} onChange={(e) => setCommentBody(e.target.value)} />
                  <div className="flex justify-end">
                    <Button onClick={addComment} disabled={busy === "comment-create"}>{busy === "comment-create" ? "Ukládám" : "Přidat komentář"}</Button>
                  </div>
                </div>
              </section>
            </>
          ) : <EmptyState title="Vyber úkol" text="Po kliknutí na kartu úkolu tady uvidíš detail, checklist, komentáře a historii dokončení." />}
        </Card>
      </div>

      {err ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</div> : null}
      {info ? <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{info}</div> : null}
    </AppShell>
  );
}

function TaskColumn({
  title,
  tone,
  tasks,
  selectedTaskId,
  assignees,
  usersById,
  onSelect,
  onStatusChange,
  busy,
}: {
  title: string;
  tone: "amber" | "blue" | "ok";
  tasks: ProjectTask[];
  selectedTaskId: string;
  assignees: ProjectTaskAssignee[];
  usersById: Map<string, ProjectUser>;
  onSelect: (id: string) => void;
  onStatusChange: (id: string, status: TaskStatus) => void;
  busy: string | null;
}) {
  const toneClass =
    tone === "amber" ? "border-amber-200 bg-amber-50" : tone === "blue" ? "border-blue-200 bg-blue-50" : "border-emerald-200 bg-emerald-50";
  return (
    <div className={`rounded-3xl border p-4 ${toneClass}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-slate-950">{title}</div>
        <Pill tone={tone === "ok" ? "ok" : tone === "amber" ? "warn" : "neutral"}>{tasks.length}</Pill>
      </div>
      <div className="mt-4 space-y-3">
        {tasks.length ? tasks.map((task) => {
          const members = assignees
            .filter((assignee) => assignee.task_id === task.id)
            .map((assignee) => usersById.get(assignee.user_id)?.name)
            .filter(Boolean) as string[];
          return (
            <button
              key={task.id}
              type="button"
              onClick={() => onSelect(task.id)}
              className={`w-full rounded-2xl border bg-white px-4 py-4 text-left shadow-sm transition ${selectedTaskId === task.id ? "border-slate-950" : "border-slate-200 hover:bg-slate-50"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-950">{task.title}</div>
                  <div className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{task.description || "Bez doplňujícího popisu."}</div>
                </div>
                {task.due_date ? <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700">{fmtDate(task.due_date)}</span> : null}
              </div>
              {members.length ? <div className="mt-3 flex flex-wrap gap-2">{members.map((name) => <span key={name} className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700">{name}</span>)}</div> : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {(["todo", "doing", "done"] as TaskStatus[]).map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onStatusChange(task.id, status);
                    }}
                    disabled={busy === `task-status-${task.id}` || task.status === status}
                    className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${task.status === status ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-600"}`}
                  >
                    {taskStatusLabel[status]}
                  </button>
                ))}
              </div>
            </button>
          );
        }) : <EmptyInline text="Zatím bez úkolů v tomto sloupci." />}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium text-slate-600">
      {label}
      {children}
    </label>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-slate-50 px-3 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-950">{value}</div>
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

