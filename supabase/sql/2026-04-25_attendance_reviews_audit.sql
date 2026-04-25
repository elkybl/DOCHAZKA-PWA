create table if not exists public.attendance_day_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  day date not null,
  site_id uuid null references public.sites(id) on delete set null,
  status text not null default 'pending',
  note text null,
  approved_by uuid null references public.users(id) on delete set null,
  approved_at timestamptz null,
  updated_by uuid null references public.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists attendance_day_reviews_unique_idx
  on public.attendance_day_reviews (user_id, day, coalesce(site_id, '00000000-0000-0000-0000-000000000000'::uuid));

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'attendance_day_reviews_status_check'
  ) then
    alter table public.attendance_day_reviews
      add constraint attendance_day_reviews_status_check
      check (status in ('pending', 'approved', 'returned')) not valid;
  end if;
end $$;

alter table public.attendance_day_reviews validate constraint attendance_day_reviews_status_check;

create table if not exists public.attendance_audit_log (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id text not null,
  action text not null,
  actor_user_id uuid null references public.users(id) on delete set null,
  user_id uuid null references public.users(id) on delete set null,
  site_id uuid null references public.sites(id) on delete set null,
  day date null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists attendance_audit_log_day_idx
  on public.attendance_audit_log (day, user_id, site_id, created_at desc);
