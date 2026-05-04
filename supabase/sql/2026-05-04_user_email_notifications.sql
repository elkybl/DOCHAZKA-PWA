alter table public.users
  add column if not exists email text null;

create index if not exists users_email_idx
  on public.users (lower(email))
  where email is not null;

create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references public.users(id) on delete set null,
  email text null,
  kind text not null,
  subject text not null,
  body_text text not null,
  entity_type text not null,
  entity_id text not null,
  actor_user_id uuid null references public.users(id) on delete set null,
  provider text null,
  external_id text null,
  status text not null default 'queued',
  error_message text null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists notification_events_user_idx
  on public.notification_events (user_id, created_at desc);

create index if not exists notification_events_entity_idx
  on public.notification_events (entity_type, entity_id, created_at desc);
