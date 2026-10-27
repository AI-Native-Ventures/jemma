-- Jemma v1 schema. Enums, tables, indexes, storage buckets.

create type user_role as enum ('teacher', 'parent', 'learner');
create type link_status as enum ('pending', 'approved', 'declined');
create type map_status as enum ('draft', 'approved');
create type paper_owner as enum ('teacher', 'parent');
create type paper_kind as enum ('test', 'homework', 'textbook', 'report');
create type paper_status as enum ('queued', 'reading', 'needs_you', 'marked', 'failed');
create type gap_stage as enum ('new', 'practising', 'fixed');
create type lesson_format as enum ('reading', 'diagram', 'audio');
create type session_status as enum ('planned', 'in_progress', 'done');
create type item_phase as enum ('warmup', 'try');
create type item_adapt as enum ('easier', 'harder');
create type obs_kind as enum ('participation', 'confidence', 'effort', 'behaviour');
create type attendance_status as enum ('here', 'late', 'away');
create type activity_kind as enum ('sport', 'club', 'music', 'art', 'other');
create type need_kind as enum ('check_answer', 'unreadable_name', 'approve_map', 'approve_key', 'approve_link', 'confirm_scan');
create type need_status as enum ('open', 'done');
create type event_status as enum ('queued', 'running', 'done', 'failed', 'cancelled');

create table schools (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  country text not null,
  sandbox_id text
);

create table profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  role user_role not null,
  display_name text not null,
  school_id uuid references schools (id) on delete set null
);

create table classes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  school_id uuid not null references schools (id) on delete cascade,
  teacher_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  grade int not null,
  year int not null,
  subject text not null,
  join_code text not null unique
);

create table children (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  school_id uuid not null references schools (id) on delete cascade,
  first_name text not null,
  last_name text,
  grade int not null,
  user_id uuid references auth.users (id) on delete set null,
  parent_first_name text,
  parent_relation text
);

create table child_logins (
  code text primary key,
  created_at timestamptz not null default now(),
  child_id uuid not null references children (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  pin_set_by uuid references auth.users (id) on delete set null
);

create table child_login_attempts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  code text not null,
  at timestamptz not null default now()
);

create table enrolments (
  created_at timestamptz not null default now(),
  class_id uuid not null references classes (id) on delete cascade,
  child_id uuid not null references children (id) on delete cascade,
  primary key (class_id, child_id)
);

create table parent_links (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  parent_id uuid not null references auth.users (id) on delete cascade,
  child_id uuid not null references children (id) on delete cascade,
  class_id uuid not null references classes (id) on delete cascade,
  status link_status not null default 'pending',
  consent jsonb not null default '{"guardian": false, "teach": false, "improve": false}'::jsonb,
  decided_at timestamptz
);

create table curriculum_docs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  class_id uuid not null references classes (id) on delete cascade,
  storage_path text not null,
  title text not null,
  pages int not null default 0
);

create table curriculum_maps (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  class_id uuid not null references classes (id) on delete cascade,
  status map_status not null default 'draft',
  draft jsonb not null default '{}'::jsonb,
  approved_at timestamptz
);

create table topics (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  map_id uuid not null references curriculum_maps (id) on delete cascade,
  term int not null check (term between 1 and 4),
  position int not null,
  name text not null,
  family text not null,
  prerequisite_ids uuid[] not null default '{}',
  misconceptions text[] not null default '{}'
);

create table tests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  class_id uuid not null references classes (id) on delete cascade,
  title text not null,
  written_on date,
  out_of int not null,
  topic_ids uuid[] not null default '{}'
);

create table answer_keys (
  test_id uuid primary key references tests (id) on delete cascade,
  created_at timestamptz not null default now(),
  status map_status not null default 'draft',
  items jsonb not null default '[]'::jsonb,
  memo_path text,
  approved_at timestamptz
);

create table papers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  test_id uuid references tests (id) on delete cascade,
  child_id uuid references children (id) on delete cascade,
  owner paper_owner not null,
  kind paper_kind not null,
  status paper_status not null default 'queued',
  name_read text,
  total int,
  error text
);

create table paper_pages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  paper_id uuid not null references papers (id) on delete cascade,
  page_no int not null,
  storage_path text not null
);

create table question_results (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  paper_id uuid not null references papers (id) on delete cascade,
  child_id uuid not null references children (id) on delete cascade,
  n int not null,
  prompt text not null,
  answer_read text not null,
  read_confidence real not null,
  correct boolean not null,
  mark int not null,
  crop jsonb,
  topic_id uuid references topics (id) on delete set null,
  topic_name text not null,
  misconception text,
  gap_topic_id uuid references topics (id) on delete set null,
  previous_answer text,
  changed_by uuid references auth.users (id) on delete set null
);

create table gaps (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  child_id uuid not null references children (id) on delete cascade,
  topic_id uuid references topics (id) on delete set null,
  topic_name text not null,
  stage gap_stage not null default 'new',
  evidence uuid[] not null default '{}',
  first_practised_at timestamptz,
  fixed_at timestamptz
);

create table lessons (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  child_id uuid not null references children (id) on delete cascade,
  topic_id uuid references topics (id) on delete set null,
  topic_name text not null,
  format lesson_format not null,
  content jsonb not null,
  audio_path text
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  child_id uuid not null references children (id) on delete cascade,
  lesson_id uuid not null references lessons (id) on delete cascade,
  status session_status not null default 'planned',
  planned_for date not null,
  warmup jsonb not null default '[]'::jsonb,
  "right" int,
  minutes int,
  finished_at timestamptz
);

create table session_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  session_id uuid not null references sessions (id) on delete cascade,
  position int not null,
  phase item_phase not null,
  question jsonb not null,
  difficulty int not null,
  answer text not null,
  correct boolean not null,
  seconds int not null,
  adapted item_adapt
);

create table format_trials (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  child_id uuid not null references children (id) on delete cascade,
  topic_family text not null,
  format lesson_format not null,
  score int not null,
  session_id uuid references sessions (id) on delete set null
);

create table reteach_plans (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  class_id uuid not null references classes (id) on delete cascade,
  topic_id uuid references topics (id) on delete set null,
  topic_name text not null,
  content jsonb not null,
  done_at timestamptz
);

create table guidance_cards (
  child_id uuid primary key references children (id) on delete cascade,
  created_at timestamptz not null default now(),
  content jsonb not null,
  updated_at timestamptz not null default now()
);

create table observations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  child_id uuid not null references children (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  kind obs_kind not null,
  text text not null
);

create table attendance (
  created_at timestamptz not null default now(),
  child_id uuid not null references children (id) on delete cascade,
  day date not null,
  status attendance_status not null,
  primary key (child_id, day)
);

create table activities (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  child_id uuid not null references children (id) on delete cascade,
  kind activity_kind not null,
  name text not null,
  place text,
  days text[] not null default '{}',
  since text not null,
  created_by uuid not null references auth.users (id) on delete cascade
);

create table needs_you_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  school_id uuid not null references schools (id) on delete cascade,
  child_id uuid references children (id) on delete cascade,
  kind need_kind not null,
  ref_id uuid not null,
  status need_status not null default 'open',
  title text not null,
  detail text not null default ''
);

create table events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  school_id uuid not null references schools (id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  status event_status not null default 'queued',
  attempts int not null default 0,
  error text,
  finished_at timestamptz
);

create table activity_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  school_id uuid not null references schools (id) on delete cascade,
  class_id uuid references classes (id) on delete cascade,
  child_id uuid references children (id) on delete cascade,
  at timestamptz not null default now(),
  text text not null,
  tool text not null,
  event_id uuid references events (id) on delete set null
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  body text not null,
  href text not null,
  read_at timestamptz
);

create table ai_replays (
  key text primary key,
  created_at timestamptz not null default now(),
  model text not null,
  response jsonb not null
);

create table demo_sandboxes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  school_id uuid not null references schools (id) on delete cascade,
  logins jsonb not null default '{}'::jsonb,
  stage text not null default 'fresh'
);

create table mcp_tokens (
  token_hash text primary key,
  created_at timestamptz not null default now(),
  school_id uuid not null references schools (id) on delete cascade,
  label text not null
);

-- Foreign key and lookup indexes.
create index on profiles (school_id);
create index on classes (school_id);
create index on classes (teacher_id);
create index on children (school_id);
create index on children (user_id);
create index on child_logins (child_id);
create index on child_login_attempts (code, at);
create index on enrolments (child_id);
create index on parent_links (parent_id);
create index on parent_links (child_id);
create index on parent_links (class_id);
create index on curriculum_docs (class_id);
create index on curriculum_maps (class_id);
create index on topics (map_id);
create index on tests (class_id);
create index on papers (test_id);
create index on papers (child_id);
create index on paper_pages (paper_id);
create index on question_results (paper_id);
create index on question_results (child_id);
create index on question_results (topic_id);
create index on gaps (child_id);
create index on lessons (child_id);
create index on sessions (child_id);
create index on session_items (session_id);
create index on format_trials (child_id, topic_family);
create index on reteach_plans (class_id);
create index on observations (child_id);
create index on activities (child_id);
create index on needs_you_items (owner_id, status);
create index on events (school_id, status);
create index on activity_log (school_id, at desc);
create index on activity_log (child_id);
create index on notifications (user_id, read_at);

-- Private storage buckets. No storage policies: access is by signed URL or service role.
insert into storage.buckets (id, name, public)
values ('papers', 'papers', false),
       ('curriculum', 'curriculum', false),
       ('lesson-audio', 'lesson-audio', false),
       ('sample-papers', 'sample-papers', false)
on conflict (id) do update set public = false;
