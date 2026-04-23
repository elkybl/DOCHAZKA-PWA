-- Adds employee availability as a calendar item type.
-- Run after 2026-04-23_calendar_items.sql.

alter table public.calendar_items
  drop constraint if exists calendar_items_type_check;

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
    'custom',
    'availability'
  ));
