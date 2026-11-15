-- P106: the teacher sends the guidance card. Jemma writes a new card for a school child to `guidance_drafts`, where only the child's teachers
-- can read it. `guidance_cards` stays exactly as it is and now means "what the family sees": the teacher's "Send to family" copies the draft
-- into it and removes the draft. A learner's own record (a twin, or a child whose school does not use Jemma) has no teacher and is still
-- written to `guidance_cards` at once.
--
-- Additive: one new table, and nothing is changed in `guidance_cards` (no rewrite, no new column, no new policy), so it is safe to apply once to a
-- database that holds data. Every card that exists now stays a card: it counts as already sent.
-- The files run in name order, so this one uses only what 0001 to 0024 made.

create table guidance_drafts (
  child_id uuid primary key references children (id) on delete cascade,
  created_at timestamptz not null default now(),
  content jsonb not null,
  updated_at timestamptz not null default now()
);

alter table guidance_drafts enable row level security;

-- The class teachers of the child read the draft: `teaches_child` is the helper behind every teacher-only read of a child. A parent, the learner and
-- a teacher of another school read nothing. There is no insert, update or delete policy: only the service role (the agent worker and the web
-- server's service client) writes.
create policy guidance_drafts_select on guidance_drafts for select to authenticated using (teaches_child(child_id));

-- To undo (kept here so the change can be reversed; no card is lost, because `guidance_cards` was never touched):
--   drop policy guidance_drafts_select on guidance_drafts;
--   drop table guidance_drafts;
