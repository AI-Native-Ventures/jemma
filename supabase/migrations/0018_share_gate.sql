-- P50b: share with parents. A class test stays hidden from the family (an approved parent and the learner) until the
-- teacher shares it. One tap per test, and the teacher's name and the time are kept.
--
-- Additive for the code that runs today: `held` defaults to false, so every old row and every insert from old code
-- behaves exactly as before. New tests are inserted with `held = true` by the new `createTest`.
-- The files run in name order, so this one must not use anything from 0019.

alter table tests
  add column held boolean not null default false,
  add column shared_at timestamptz,
  add column shared_by uuid references auth.users (id);

-- A paper is shared when it belongs to no test (homework, the seeded Term 3 paper) or its test is not held.
-- Security definer so the answer does not depend on what the caller may read.
create function paper_shared(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from papers pa join tests t on t.id = pa.test_id where pa.id = p and t.held
  )
$$;

-- An activity line is shared unless its event names a paper (payload.paperId) whose test is held. No event is shared.
-- The paper id is compared as text, so a payload that holds something else cannot raise an error inside a policy.
create function event_shared(ev uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (
    select 1
    from events e
    join papers pa on pa.id::text = e.payload ->> 'paperId'
    join tests t on t.id = pa.test_id
    where e.id = ev and t.held
  )
$$;

-- A gap is shared when it has no evidence, or at least one of its evidence rows is an answer of a paper that is shared.
-- The held rows themselves stay hidden by the question_results policy.
create function gap_shared(evidence uuid[]) returns boolean
language sql stable security definer set search_path = public as $$
  select cardinality(evidence) = 0
    or exists (select 1 from question_results q where q.id = any (evidence) and paper_shared(q.paper_id))
$$;

-- The child's family: an approved parent or the learner's own login.
create function is_family(child uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select parent_of(child) or is_child_user(child)
$$;

revoke execute on function paper_shared(uuid), event_shared(uuid), gap_shared(uuid[]), is_family(uuid) from public, anon;
grant execute on function paper_shared(uuid), event_shared(uuid), gap_shared(uuid[]), is_family(uuid) to authenticated, service_role;

-- The teacher branch of each policy is unchanged. The family branch needs the test to be shared.
drop policy papers_select on papers;
create policy papers_select on papers for select to authenticated
  using (
    (child_id is not null and (teaches_child(child_id) or (is_family(child_id) and paper_shared(id))))
    or (test_id is not null and exists (select 1 from tests t where t.id = papers.test_id and teaches_class(t.class_id)))
  );

-- paper_pages_select stays as it is: it asks for the paper through the papers policy above.

drop policy question_results_select on question_results;
create policy question_results_select on question_results for select to authenticated
  using (teaches_child(child_id) or (is_family(child_id) and paper_shared(paper_id)));

drop policy gaps_select on gaps;
create policy gaps_select on gaps for select to authenticated
  using (teaches_child(child_id) or (is_family(child_id) and gap_shared(evidence)));

drop policy activity_log_select on activity_log;
create policy activity_log_select on activity_log for select to authenticated
  using (
    (child_id is not null and (teaches_child(child_id) or (is_family(child_id) and event_shared(event_id))))
    or (child_id is null and school_id = my_school())
  );

-- To undo (kept here so the change can be reversed; the definitions below are what jemma-dev had before):
--   drop policy papers_select on papers;
--   create policy papers_select on papers for select to authenticated using (((child_id is not null) and can_see_child(child_id)) or ((test_id is not null) and exists (select 1 from tests t where t.id = papers.test_id and teaches_class(t.class_id))));
--   drop policy question_results_select on question_results;
--   create policy question_results_select on question_results for select to authenticated using (can_see_child(child_id));
--   drop policy gaps_select on gaps;
--   create policy gaps_select on gaps for select to authenticated using (can_see_child(child_id));
--   drop policy activity_log_select on activity_log;
--   create policy activity_log_select on activity_log for select to authenticated using (((child_id is not null) and can_see_child(child_id)) or ((child_id is null) and (school_id = my_school())));
--   drop function gap_shared(uuid[]), event_shared(uuid), paper_shared(uuid), is_family(uuid);
--   alter table tests drop column held, drop column shared_at, drop column shared_by;
