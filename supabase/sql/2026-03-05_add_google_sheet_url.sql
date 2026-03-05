-- Safe migration: adds per-user Google Sheet link.
-- Run in Supabase SQL editor.

alter table public.users
add column if not exists google_sheet_url text;
