-- Shared planning calendar for work, absences and appointments.
-- Safe to run multiple times.

create table if not exists public.calendar_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  type text not null,
  title text not null,
  date date not null,
  start_time time null,
  end_time time null,
  all_day boolean not null default false,
  location text null,
  notes text null,
  planned_hours numeric null,
  actual_hours numeric null,
  status text not null default 'planned',
  seen_confirmed boolean not null default false,
  seen_at timestamptz null,
  attendance_status text null,
  check_in_at timestamptz null,
  check_out_at timestamptz null,
  attendance_note text null,
  approved_by uuid null references public.users(id) on delete set null,
  approved_at timestamptz null,
  created_by uuid null references public.users(id) on delete set null,
  updated_by uuid null references public.users(id) on delete set null,
  deleted_by uuid null references public.users(id) on delete set null,
  deleted_at timestamptz null,
  recurrence_rule text null,
  recurrence_group_id uuid null,
  parent_event_id uuid null references public.calendar_items(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists calendar_items_user_date_idx
  on public.calendar_items(user_id, date)
  where deleted_at is null;

create index if not exists calendar_items_date_idx
  on public.calendar_items(date)
  where deleted_at is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'calendar_items_type_check'
  ) then
    alter table public.calendar_items
      add constraint calendar_items_type_check
      check (type in (
        'work_shift',
        'service_visit',
        'installation_job',
        'meeting',
        'training',
        'vacation',
        'sick_leave',
        'doctor',
        'personal_leave',
        'obstacle',
        'custom'
      )) not valid;
  end if;
end $$;

alter table public.calendar_items validate constraint calendar_items_type_check;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'calendar_items_status_check'
  ) then
    alter table public.calendar_items
      add constraint calendar_items_status_check
      check (status in ('planned', 'in_progress', 'done', 'cancelled')) not valid;
  end if;
end $$;

alter table public.calendar_items validate constraint calendar_items_status_check;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'calendar_items_attendance_status_check'
  ) then
    alter table public.calendar_items
      add constraint calendar_items_attendance_status_check
      check (attendance_status is null or attendance_status in ('pending', 'checked_in', 'confirmed', 'missed', 'excused')) not valid;
  end if;
end $$;

alter table public.calendar_items validate constraint calendar_items_attendance_status_check;
