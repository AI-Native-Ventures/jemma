-- P112: a learner who signed up alone joins their school class with the teacher's class code, and the teacher says yes.
-- The request is one row: which class, which of the learner's own records asked (the independent child, in a personal school), the name the learner
-- gave, and what the teacher decided. When the teacher approves, the code that does it (the web server, with the service role) gives the learner a
-- school record in the class (an existing learner of the class with no login yet, or a new one) and makes the learner's own record that school
-- child's twin (`children.private_of`, migration 0024): "My school" is then the official side and "My own" keeps the grades and practice the learner
-- already had.
--
-- Additive: one new table, one new value for the Needs you kinds, nothing changed in any table that holds data. Safe to apply once to a database
-- that holds data. Nothing in the table is read by the code that runs today.
-- The files run in name order, so this one uses only what 0001 to 0025 made.

create table class_join_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  class_id uuid not null references classes (id) on delete cascade,
  -- The learner's own record (an independent child). When it goes, its requests go with it.
  own_child_id uuid not null references children (id) on delete cascade,
  -- The first name the learner gave, kept so the teacher reads the name the learner chose even if the record changes.
  requested_name text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz
);

-- One waiting request for each learner at a time. A learner may ask again after a no.
create unique index class_join_requests_one_pending on class_join_requests (own_child_id) where status = 'pending';
create index class_join_requests_class_status on class_join_requests (class_id, status);

alter table class_join_requests enable row level security;

-- The teacher of the class reads and decides the class's requests. The learner reads their own requests (the record that asked has their login).
-- There is no insert or delete policy: only the service role (the web server) writes a new request, and the teacher's own tap goes through the
-- server too, so the update policy is the one a teacher's own session could use and nothing else.
create policy class_join_requests_select on class_join_requests for select to authenticated
  using (teaches_class(class_id) or is_child_user(own_child_id));
create policy class_join_requests_update on class_join_requests for update to authenticated
  using (teaches_class(class_id)) with check (teaches_class(class_id));

-- The teacher's Needs you gets one item for each waiting request. A new value for the kinds, as 0009, 0019 and 0022 did.
alter type public.need_kind add value if not exists 'approve_join';

-- To undo (kept here so the change can be reversed; no other table was changed. The Needs you value cannot be taken out of an enum: leave it):
--   drop policy class_join_requests_update on class_join_requests;
--   drop policy class_join_requests_select on class_join_requests;
--   drop table class_join_requests;
