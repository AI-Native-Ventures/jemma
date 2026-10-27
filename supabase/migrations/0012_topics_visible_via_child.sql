-- Parents and learners see the topics of the maps used by their child's classes.
create or replace function public.can_see_map(map uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from curriculum_maps m
    where m.id = map
      and (teaches_class(m.class_id)
           or exists (select 1 from enrolments e where e.class_id = m.class_id and can_see_child(e.child_id)))
  )
$$;

create policy topics_select_via_child on public.topics
  for select to authenticated
  using (public.can_see_map(map_id));
