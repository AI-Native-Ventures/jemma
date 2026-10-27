-- A planned session knows its topic, format and length before its lesson is written.
alter table public.sessions
  alter column lesson_id drop not null,
  add column if not exists topic_id uuid null references public.topics (id) on delete set null,
  add column if not exists topic_name text null,
  add column if not exists format public.lesson_format null,
  add column if not exists planned_minutes integer null,
  add column if not exists question_count integer null;
