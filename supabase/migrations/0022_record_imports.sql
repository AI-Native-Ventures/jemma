-- Past records brought in from a file, a pasted table or one typed result.
-- Additive only. Nothing here changes an existing column, policy or function. Code that does not know about the new columns keeps working:
-- every new column is nullable, and the deployed code never names them.

-- One import: a teacher's file (or pasted table), what the model made of its columns, every row as code read it, and the problems found.
-- Written by the service role only. The class teacher reads it. Nothing reaches `learner_records` until a named teacher approves it.
create table record_imports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  school_id uuid not null references schools (id) on delete cascade,
  class_id uuid not null references classes (id) on delete cascade,
  created_by uuid not null,
  file_name text not null,
  -- The file as it was uploaded, in the private `records` bucket. Null when there is none.
  file_path text,
  status text not null default 'drafting' check (status in ('drafting', 'ready', 'approved', 'discarded', 'failed')),
  mapping jsonb,
  rows jsonb,
  problems jsonb,
  approved_by uuid,
  approved_by_name text,
  approved_at timestamptz
);
create index on record_imports (class_id, created_at desc);

alter table record_imports enable row level security;

create policy record_imports_select on record_imports for select to authenticated
  using (teaches_class(class_id));

-- No write policy: only the service role writes.

-- Where a record came from. `source` stays the kind of piece (quiz, assignment, project, note, attendance): the pattern finder counts only
-- the first three. `import_id` set means a file, `added_by` set with no `import_id` means a teacher typed it, both null means the seed.
alter table learner_records add column import_id uuid references record_imports (id) on delete cascade;
alter table learner_records add column source_row int;
alter table learner_records add column added_by uuid;
alter table learner_records add column added_by_name text;
create index on learner_records (import_id);

-- The "Check N past results" item on the teacher's home. The value is not used in this file, so it can share the transaction.
alter type public.need_kind add value if not exists 'check_records';

-- Private bucket for the uploaded files. No storage policies: access is by service role.
insert into storage.buckets (id, name, public)
values ('records', 'records', false)
on conflict (id) do update set public = false;
