-- P163: the level check. A learner new to Jemma answers 12 questions in their own space, 2 on each of 6 topics of their grade, and Jemma finds where to
-- start: the topics the learner is solid on, the topics to start with (a new gap each), and the ones where it is too early to tell.
--
-- Additive: one new table and its index. Nothing changes in a table that holds data. Safe to apply again (`if not exists`). The code that runs today
-- does not use it. The files run in name order, so this one uses only what 0001 to 0031 made.

create table if not exists public.level_checks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  child_id uuid not null references public.children (id) on delete cascade,
  -- The class of the learner's own space whose map the topics come from (the learner's grade).
  class_id uuid references public.classes (id) on delete set null,
  grade int,
  -- writing: Jemma is writing the questions. ready: the learner can answer them. done: all answered, the result is saved. failed: Jemma could not
  -- write them (the learner can ask again, which writes them again).
  status text not null default 'writing' check (status in ('writing', 'ready', 'done', 'failed')),
  -- The 6 topics, in the order of the year: [{ "topicId", "topicName", "family" }].
  topics jsonb not null default '[]'::jsonb,
  -- The questions, in order: [{ "topicId", "topicName", "question" }]. A question holds its answer, so no learner and no parent reads this table: the
  -- app reads it on the server with the service role, after it has checked who may see the child.
  questions jsonb not null default '[]'::jsonb,
  -- The answers so far, in order: [{ "n", "answer", "correct", "skipped", "seconds" }].
  answers jsonb not null default '[]'::jsonb,
  -- The event that asked Jemma to write the questions: its status tells a failure apart from a slow write.
  event_id uuid,
  started_at timestamptz,
  finished_at timestamptz
);

create index if not exists level_checks_child on public.level_checks (child_id, created_at desc);

-- No policy at all: only the service role reads and writes it (see `questions`).
alter table public.level_checks enable row level security;
