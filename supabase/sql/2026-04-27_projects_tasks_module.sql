create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text null,
  site_id uuid null references public.sites(id) on delete set null,
  status text not null default 'active',
  created_by uuid null references public.users(id) on delete set null,
  updated_by uuid null references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null default 'member',
  created_at timestamptz not null default now()
);

create unique index if not exists project_members_project_user_idx
  on public.project_members(project_id, user_id);

create table if not exists public.project_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  description text null,
  status text not null default 'todo',
  sort_order integer not null default 0,
  due_date date null,
  created_by uuid null references public.users(id) on delete set null,
  updated_by uuid null references public.users(id) on delete set null,
  completed_by uuid null references public.users(id) on delete set null,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_tasks_project_status_idx
  on public.project_tasks(project_id, status, sort_order, created_at desc);

create table if not exists public.project_task_assignees (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.project_tasks(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create unique index if not exists project_task_assignees_task_user_idx
  on public.project_task_assignees(task_id, user_id);

create table if not exists public.project_checklist_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.project_tasks(id) on delete cascade,
  text text not null,
  is_done boolean not null default false,
  sort_order integer not null default 0,
  done_by uuid null references public.users(id) on delete set null,
  done_at timestamptz null,
  created_by uuid null references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists project_checklist_items_task_idx
  on public.project_checklist_items(task_id, sort_order, created_at);

create table if not exists public.project_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.project_tasks(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists project_comments_task_idx
  on public.project_comments(task_id, created_at desc);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'projects_status_check'
  ) then
    alter table public.projects
      add constraint projects_status_check
      check (status in ('active', 'archived')) not valid;
  end if;
end $$;

alter table public.projects validate constraint projects_status_check;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'project_members_role_check'
  ) then
    alter table public.project_members
      add constraint project_members_role_check
      check (role in ('owner', 'member')) not valid;
  end if;
end $$;

alter table public.project_members validate constraint project_members_role_check;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'project_tasks_status_check'
  ) then
    alter table public.project_tasks
      add constraint project_tasks_status_check
      check (status in ('todo', 'doing', 'done')) not valid;
  end if;
end $$;

alter table public.project_tasks validate constraint project_tasks_status_check;

