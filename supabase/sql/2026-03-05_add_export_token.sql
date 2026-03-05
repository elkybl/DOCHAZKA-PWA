-- Per-user token for Google Sheets export (do NOT share admin token with employees)
alter table public.users
add column if not exists export_token text;

create unique index if not exists users_export_token_ux
on public.users(export_token);
