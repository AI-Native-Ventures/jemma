-- retag_results(map): after a curriculum map is approved, attach topic_id to existing rows whose
-- topic_name matches a topic in the map (case-insensitive), for children enrolled in the map's class.
-- Service role only.

create function retag_results(map uuid) returns void
language plpgsql security invoker set search_path = public as $$
declare
  cls uuid;
begin
  select class_id into cls from curriculum_maps where id = map;
  if cls is null then
    return;
  end if;

  create temp table _retag on commit drop as
    select distinct on (lower(t.name)) lower(t.name) as lname, t.id as topic_id
    from topics t where t.map_id = map
    order by lower(t.name), t.position;

  update question_results q set topic_id = r.topic_id
  from _retag r
  where lower(q.topic_name) = r.lname
    and q.child_id in (select child_id from enrolments where class_id = cls);

  update gaps g set topic_id = r.topic_id
  from _retag r
  where lower(g.topic_name) = r.lname
    and g.child_id in (select child_id from enrolments where class_id = cls);

  update lessons l set topic_id = r.topic_id
  from _retag r
  where lower(l.topic_name) = r.lname
    and l.child_id in (select child_id from enrolments where class_id = cls);
end;
$$;

revoke execute on function retag_results(uuid) from public, anon, authenticated;
grant execute on function retag_results(uuid) to service_role;
