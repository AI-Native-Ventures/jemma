-- P94: a learner's own private workspace ("My own") beside the school one ("My school").
-- A private workspace is a second `children` row for the same learner (the "twin"), in a school of its own that holds only that learner,
-- with one private class for each grade the learner has added. Everything a learner does is scoped by child id and school id, so the twin
-- is fully separate from the school child: its own sessions, gaps and counts, and never in a school's class list.
--
-- Additive for the code that runs today: `kind` defaults to 'school' and `private_of` is null for every old row, so every old row and every
-- insert from old code behaves exactly as before.
-- The files run in name order, so this one must not use anything from a later file.

alter table schools add column kind text not null default 'school';
alter table schools add constraint schools_kind_check check (kind in ('school', 'private'));

-- The twin points at the school child it belongs to. When the school child goes, its twin goes with it.
-- One twin for each learner: the unique index covers only the rows that are twins.
alter table children add column private_of uuid references children (id) on delete cascade;
create unique index children_private_of_key on children (private_of) where private_of is not null;

-- A parent who may act for the learner (an approved link) may also read and act in My own: `parent_of` also answers true for the twin of a
-- child the user is an approved parent of. The first branch is the old body, unchanged. No other policy changes: the learner reaches the
-- twin through `is_child_user` (the twin has the same `user_id`), and a teacher never reaches it (it is in another school).
create or replace function parent_of(child uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from parent_links
    where child_id = child and parent_id = auth.uid() and status = 'approved'
  )
  or exists (
    select 1 from children twin
    join parent_links l on l.child_id = twin.private_of
    where twin.id = child and l.parent_id = auth.uid() and l.status = 'approved'
  )
$$;

-- To undo (kept here so the change can be reversed; parent_of below is what jemma-dev had before):
--   create or replace function parent_of(child uuid) returns boolean
--   language sql stable security definer set search_path = public as $$
--     select exists (select 1 from parent_links where child_id = child and parent_id = auth.uid() and status = 'approved')
--   $$;
--   drop index children_private_of_key;
--   alter table children drop column private_of;
--   alter table schools drop constraint schools_kind_check;
--   alter table schools drop column kind;
