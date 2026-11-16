-- P142: the teaching library. Every CAPS Mathematics topic (Grades 1 to 12) gets 1 to 8 full lessons, written once, checked, stored here, and the same for
-- every learner. A learner opens them from "My maths" (a Learn button on each topic) and from the Learn step of a practice. `topic_lessons` holds the
-- lessons (one row for each lesson of a topic), `topic_lesson_progress` holds which of them a learner started and finished and how the practice at the
-- end of the lesson went.
--
-- The library is global, not for one school: a lesson is found by the grade and the CAPS name of the topic, without a trailing " (Term N)" (the
-- `base_name`: "Common fractions (Term 4)" opens the lessons of "Common fractions"). The import script (scripts/teach/import.ts) fills `topic_lessons`
-- from the files under content/lessons/, with psql, as the owner of the database. The app never writes it.
--
-- Additive: two new tables with their index, row level security and policies, nothing changed in any table that holds data. Safe to apply once to a
-- database that holds data, and safe to apply again (`if not exists`, `drop policy if exists`). Nothing in the tables is needed by the code that runs
-- today: while they are missing, or empty, a topic shows no Learn button and the Learn step of a practice is the one it has always been.
-- The files run in name order, so this one uses only what 0001 to 0028 made.

create table if not exists public.topic_lessons (
  id uuid primary key default gen_random_uuid(),
  grade integer not null,
  -- The CAPS name of the topic without " (Term N)". One set of lessons for each (grade, base name): every term row of the topic opens the same set.
  base_name text not null,
  -- The part of Mathematics the topic belongs to (the `family` of the topic): the screens choose how a lesson opens from it.
  family text not null,
  -- The order the lessons of one topic are taught in, from 1.
  position integer not null,
  title text not null,
  -- One TeachingLesson (packages/profiling/src/schemas/teaching.ts): the words, the pictures, the worked examples, the practice questions with their answers.
  content jsonb not null,
  -- Where the lesson was written from, and the credit line it must carry.
  source jsonb not null,
  status text not null check (status in ('ready', 'failed')),
  -- The result of every check the lesson went through (by code and by the second model).
  checks jsonb not null default '{}'::jsonb,
  model text not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  unique (grade, base_name, position, version)
);

create index if not exists topic_lessons_grade_name on public.topic_lessons (grade, base_name);

alter table public.topic_lessons enable row level security;

-- Read: every signed-in person reads the lessons that passed their checks. A lesson that failed is never shown. There is no insert, update or delete
-- policy: only the owner of the database (the import script, run with psql) and the service role write.
drop policy if exists topic_lessons_select on public.topic_lessons;
create policy topic_lessons_select on public.topic_lessons for select to authenticated
  using (status = 'ready');

create table if not exists public.topic_lesson_progress (
  child_id uuid not null references public.children (id) on delete cascade,
  topic_lesson_id uuid not null references public.topic_lessons (id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  practice_right integer,
  practice_total integer,
  primary key (child_id, topic_lesson_id)
);

create index if not exists topic_lesson_progress_lesson on public.topic_lesson_progress (topic_lesson_id);

alter table public.topic_lesson_progress enable row level security;

-- Read: the people who can see a learner (the learner, the linked parent, the class teacher) read that learner's progress: `can_see_child` is the helper
-- behind every read of a child. There is no insert, update or delete policy: the server actions of the learner's screens write it with the service client,
-- after finding the learner, the way every other row of a learner is written.
drop policy if exists topic_lesson_progress_select on public.topic_lesson_progress;
create policy topic_lesson_progress_select on public.topic_lesson_progress for select to authenticated
  using (can_see_child(child_id));

-- To undo (kept here so the change can be reversed; nothing else was touched, and the screens carry on without the tables):
--   drop policy topic_lesson_progress_select on public.topic_lesson_progress;
--   drop table public.topic_lesson_progress;
--   drop policy topic_lessons_select on public.topic_lessons;
--   drop table public.topic_lessons;
