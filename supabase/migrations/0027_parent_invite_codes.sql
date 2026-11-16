-- P114: a parent links to a learner who signed up alone, with a short code the learner shows.
-- Additive only: one new table, nothing else. No existing table, column, policy or function is changed, so the code that runs today is not touched.
-- The files run in name order, so this one must not use anything from a later file.

-- One live code for each learner: `child_id` is the key, so a new code replaces the old one. The code is 6 letters and numbers (no look-alikes) and
-- is unique across the table. It works until `expires_at` (7 days after it was made) and once: the parent who uses it takes the row away.
-- The learner reads their own row (`is_child_user`). No write policy: only the service role writes, and a parent never reads a code.
create table parent_invite_codes (
  child_id uuid primary key references children (id) on delete cascade,
  code text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table parent_invite_codes enable row level security;

create policy parent_invite_codes_select on parent_invite_codes for select to authenticated
  using (is_child_user(child_id));

-- To undo (kept here so the change can be reversed):
--   drop table parent_invite_codes;
