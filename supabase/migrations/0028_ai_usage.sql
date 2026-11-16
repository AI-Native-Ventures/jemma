-- P137: the real tokens of every AI call. Each model call that completes writes one row: which job asked, which provider and model answered (after any
-- fallback), and the three counts the provider reported. A reply that carries no usage is a row with null counts and `reported = false`: Jemma never
-- estimates a count. The agent worker writes the rows, after each AI job step and as a best effort (a failed insert is logged and never fails the job).
-- The teacher reads the numbers on the class gap page and the learner page ("AI used 12 345 tokens"). Cost in money comes later, from these counts.
--
-- Additive: one new table with its indexes and one policy, nothing changed in any table that holds data. Safe to apply once to a database that holds
-- data, and safe to apply again (`if not exists`, `drop policy if exists`). Nothing in the table is needed by the code that runs today: while it is
-- missing the agent logs one line and carries on, and the teacher screens show nothing.
-- The files run in name order, so this one uses only what 0001 to 0027 made.

create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- What the call was for. A reference that goes away (a demo sandbox is swept, a test is deleted) leaves the row with a null there; it never blocks.
  school_id uuid references public.schools (id) on delete set null,
  class_id uuid references public.classes (id) on delete set null,
  child_id uuid references public.children (id) on delete set null,
  test_id uuid references public.tests (id) on delete set null,
  lesson_id uuid references public.lessons (id) on delete set null,
  session_id uuid references public.sessions (id) on delete set null,
  -- The job name the agent already has: draft_map, read_key, read_paper, read_marked_test, diagnose, class_report, write_lesson, guidance, long_view, map_records.
  job text not null,
  provider text,
  model text,
  prompt_tokens integer,
  completion_tokens integer,
  total_tokens integer,
  -- False when the reply held no usage: the three counts are then null.
  reported boolean not null default true
);

create index if not exists ai_usage_class_created on public.ai_usage (class_id, created_at);
create index if not exists ai_usage_child on public.ai_usage (child_id);

alter table public.ai_usage enable row level security;

-- Read: the teacher of the class reads the rows of the class, and the people who can see a learner (the learner's class teacher, the linked parent and the
-- learner) read the rows of that learner: `can_see_child` is the helper behind every read of a child. A row with no learner (a class report) is the
-- teacher's alone. There is no insert, update or delete policy: only the service role (the agent worker) writes.
drop policy if exists ai_usage_select on public.ai_usage;
create policy ai_usage_select on public.ai_usage for select to authenticated
  using ((class_id is not null and teaches_class(class_id)) or (child_id is not null and can_see_child(child_id)));

-- To undo (kept here so the change can be reversed; nothing else was touched, and the agent and the screens carry on without the table):
--   drop policy ai_usage_select on public.ai_usage;
--   drop table public.ai_usage;
