create table if not exists public.user_rate_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  effective_from date not null,
  hourly_rate numeric null,
  km_rate numeric null,
  programming_rate numeric null,
  created_by uuid null references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists user_rate_history_user_day_idx
  on public.user_rate_history(user_id, effective_from);

create index if not exists user_rate_history_lookup_idx
  on public.user_rate_history(user_id, effective_from desc);

create table if not exists public.user_site_rate_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  effective_from date not null,
  hourly_rate numeric null,
  km_rate numeric null,
  programming_rate numeric null,
  created_by uuid null references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists user_site_rate_history_user_site_day_idx
  on public.user_site_rate_history(user_id, site_id, effective_from);

create index if not exists user_site_rate_history_lookup_idx
  on public.user_site_rate_history(user_id, site_id, effective_from desc);

insert into public.user_rate_history (user_id, effective_from, hourly_rate, km_rate, programming_rate)
select
  u.id,
  date '2000-01-01',
  u.hourly_rate,
  u.km_rate,
  u.programming_rate
from public.users u
where not exists (
  select 1
  from public.user_rate_history h
  where h.user_id = u.id
    and h.effective_from = date '2000-01-01'
);

insert into public.user_site_rate_history (user_id, site_id, effective_from, hourly_rate, km_rate, programming_rate)
select
  r.user_id,
  r.site_id,
  date '2000-01-01',
  r.hourly_rate,
  r.km_rate,
  r.programming_rate
from public.user_site_rates r
where not exists (
  select 1
  from public.user_site_rate_history h
  where h.user_id = r.user_id
    and h.site_id = r.site_id
    and h.effective_from = date '2000-01-01'
);
