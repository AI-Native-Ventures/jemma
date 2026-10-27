-- retag_results without a temp table, so it can run more than once in a transaction.

create or replace function retag_results(map uuid) returns void
language plpgsql security invoker set search_path = public as $$
declare
  cls uuid;
begin
  select class_id into cls from curriculum_maps where id = map;
  if cls is null then
    return;
  end if;

  update question_results q set topic_id = (
    select t.id from topics t where t.map_id = map and lower(t.name) = lower(q.topic_name) order by t.position limit 1
  )
  where q.child_id in (select child_id from enrolments where class_id = cls)
    and exists (select 1 from topics t where t.map_id = map and lower(t.name) = lower(q.topic_name));

  update gaps g set topic_id = (
    select t.id from topics t where t.map_id = map and lower(t.name) = lower(g.topic_name) order by t.position limit 1
  )
  where g.child_id in (select child_id from enrolments where class_id = cls)
    and exists (select 1 from topics t where t.map_id = map and lower(t.name) = lower(g.topic_name));

  update lessons l set topic_id = (
    select t.id from topics t where t.map_id = map and lower(t.name) = lower(l.topic_name) order by t.position limit 1
  )
  where l.child_id in (select child_id from enrolments where class_id = cls)
    and exists (select 1 from topics t where t.map_id = map and lower(t.name) = lower(l.topic_name));
end;
$$;
