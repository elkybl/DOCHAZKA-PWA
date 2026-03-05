-- Add programmer flag and rates
alter table public.users
  add column if not exists is_programmer boolean default false,
  add column if not exists programming_rate numeric;

alter table public.user_site_rates
  add column if not exists programming_rate numeric;

-- Store programming split on OUT events
alter table public.attendance_events
  add column if not exists programming_hours numeric,
  add column if not exists programming_note text;
