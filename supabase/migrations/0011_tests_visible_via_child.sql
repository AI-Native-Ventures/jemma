-- Parents and learners see the tests of the classes their child is enrolled in (titles on profile and tests screens).
create policy tests_select_via_child on public.tests
  for select to authenticated
  using (exists (select 1 from public.enrolments e where e.class_id = tests.class_id and public.can_see_child(e.child_id)));
