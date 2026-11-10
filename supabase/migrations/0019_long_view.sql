-- The Long view: past school years in their own table, and the patterns Jemma finds across 3 or more terms.
-- Additive only. Nothing here touches papers, question_results, tests, classes or enrolments.

-- One row per piece of past work or note (a quiz, an assignment, a project, a teacher note, a term of attendance).
-- Written by the service role only. The class teacher reads it. Parents and learners never read raw history.
create table learner_records (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  school_id uuid not null references schools (id) on delete cascade,
  child_id uuid not null references children (id) on delete cascade,
  source text not null check (source in ('quiz', 'assignment', 'project', 'note', 'attendance')),
  grade int not null,
  year int not null,
  term int not null check (term between 1 and 4),
  happened_on date not null,
  logged_at timestamptz not null,
  teacher_name text not null,
  title text not null,
  family text,
  topic_name text,
  marks int,
  out_of int,
  quality text not null default 'clear' check (quality in ('clear', 'unclear')),
  text text,
  present int,
  total int
);
create index on learner_records (child_id, year, term);

-- What Jemma saw across terms. Always a draft until the teacher decides. A learner never sees the Long view.
create table long_view_patterns (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  child_id uuid not null references children (id) on delete cascade,
  kind text not null check (kind in ('strength', 'struggle')),
  family text not null,
  title text not null,
  statement text not null,
  terms jsonb not null,
  evidence jsonb not null,
  status text not null default 'draft' check (status in ('draft', 'approved', 'dismissed', 'discussed')),
  active boolean not null default true,
  approved_by uuid,
  approved_by_name text,
  approved_at timestamptz,
  discussed_by uuid,
  discussed_by_name text,
  discussed_at timestamptz,
  dismissed_by uuid,
  dismissed_at timestamptz,
  unique (child_id, kind, family)
);

alter table learner_records enable row level security;
alter table long_view_patterns enable row level security;

create policy learner_records_select on learner_records for select to authenticated
  using (teaches_child(child_id));

-- The learner (is_child_user) is deliberately not here. A parent only reads what was talked through with them.
create policy long_view_patterns_select on long_view_patterns for select to authenticated
  using (teaches_child(child_id) or (parent_of(child_id) and status = 'discussed'));

-- No write policies on either table: only the service role writes.

-- Needs you item for "look at this learner's Long view before anything is shared".
-- The value is not used in this file, so it can share the transaction (0009 had it alone only because it was the whole file).
alter type public.need_kind add value if not exists 'review_long_view';
