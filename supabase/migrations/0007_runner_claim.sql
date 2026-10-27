-- Desktop runner: heartbeat, claim one queued desktop event, finish it.
-- All three run as the signed-in user and only touch rows of the caller's own school and runner.

create function heartbeat(runner uuid, agents_in jsonb, chosen_in text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  insert into runner_presence (runner_id, user_id, agents, chosen, last_seen)
  values (runner, auth.uid(), coalesce(agents_in, '{}'::jsonb), chosen_in, now())
  on conflict (runner_id) do update
    set agents = excluded.agents, chosen = excluded.chosen, last_seen = now()
    where runner_presence.user_id = auth.uid();
end;
$$;

-- Claims the oldest queued desktop event of the caller's school. Returns zero rows when there is none.
-- for update skip locked: two runners at once never get the same event.
create function claim_event(runner uuid) returns setof events
language plpgsql security definer set search_path = public as $$
declare
  picked uuid;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if not exists (select 1 from runner_presence where runner_id = runner and user_id = auth.uid()) then
    raise exception 'unknown runner';
  end if;

  select e.id into picked from events e
  where e.status = 'queued' and e.runner = 'desktop' and e.school_id = my_school()
  order by e.created_at
  limit 1
  for update skip locked;

  if picked is null then
    return;
  end if;

  return query
    update events set status = 'running', claimed_by = auth.uid(), attempts = attempts + 1
    where id = picked
    returning *;
end;
$$;

-- The runner settles the event after its whole job plan (complete_job marks it after every job).
create function finish_event(event uuid, status_in event_status, error_in text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if status_in not in ('done', 'failed') then
    raise exception 'finish_event takes done or failed';
  end if;
  update events set status = status_in, error = case when status_in = 'failed' then coalesce(error_in, 'failed') else null end,
    finished_at = now()
  where id = event and claimed_by = auth.uid() and status in ('running', 'done', 'failed');
end;
$$;

revoke execute on function heartbeat(uuid, jsonb, text), claim_event(uuid), finish_event(uuid, event_status, text) from public, anon;
grant execute on function heartbeat(uuid, jsonb, text), claim_event(uuid), finish_event(uuid, event_status, text) to authenticated, service_role;
