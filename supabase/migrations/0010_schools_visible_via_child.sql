-- Parents and learners see the school of any child they can see (for headers such as "Grade 6 · Hillview Primary").
create policy schools_select_via_child on public.schools
  for select to authenticated
  using (exists (select 1 from public.children c where c.school_id = schools.id and public.can_see_child(c.id)));
