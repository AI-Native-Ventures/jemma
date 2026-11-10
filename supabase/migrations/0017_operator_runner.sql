-- Operator runner: the owner's own Mac serves the hosted app with his Claude Code.
-- Additive only. Everything here is executable by service_role only (the operator runner holds the service key).
--
-- An operator serves ONLY events the cloud handed to it (payload.route = 'operator'), never the events of a school that
-- runs on a desktop. A routing tag keeps separate stacks that share one database apart: the cloud writes
-- payload.route_tag on a hand-off, and an operator only sees events and presence rows of its own tag.

-- One row per running operator runner. last_seen is the server clock.
create table operator_presence (
  runner_id uuid primary key,
  last_seen timestamptz not null default now(),
  agent text,
  version text,
  tag text not null default 'default'
);
alter table operator_presence enable row level security; -- no policies: service role only
revoke all on operator_presence from public, anon, authenticated;

create function operator_heartbeat(runner uuid, agent_in text, version_in text, tag_in text default 'default') returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into operator_presence (runner_id, last_seen, agent, version, tag)
  values (runner, now(), agent_in, version_in, coalesce(tag_in, 'default'))
  on conflict (runner_id) do update
    set last_seen = now(), agent = excluded.agent, version = excluded.version, tag = excluded.tag;
end;
$$;

-- Claims the oldest event this operator may run, or returns zero rows. An event qualifies when it is queued with
-- runner 'desktop', the cloud handed it off (payload.route = 'operator') and its payload.route_tag (default 'default')
-- is the operator's tag. Events of a school that runs on a desktop are never claimed. One event per school runs at a time, so two papers of one test never race for the test's tail.
-- Two operators never get the same event. The runner must have a presence row with the same tag.
create function claim_operator_event(runner uuid, tag_in text default 'default') returns setof events
language plpgsql security definer set search_path = public as $$
declare
  cand record;
  picked uuid;
  got boolean;
  busy boolean;
  wanted text := coalesce(tag_in, 'default');
begin
  if not exists (select 1 from operator_presence where operator_presence.runner_id = runner and operator_presence.tag = wanted) then
    raise exception 'unknown runner';
  end if;

  for cand in
    select e.id, e.school_id from events e
    where e.status = 'queued' and e.runner = 'desktop'
      and e.payload->>'route' = 'operator'
      and coalesce(e.payload->>'route_tag', 'default') = wanted
      and not exists (select 1 from schools s where s.id = e.school_id and s.ai_runner = 'desktop') -- never a desktop school's events
    order by e.created_at, e.id
    for update of e skip locked
  loop
    -- The lock is taken in its own statement: the check below then sees what the previous claimer committed.
    got := pg_try_advisory_xact_lock(hashtextextended('operator-school:' || cand.school_id::text, 0));
    if got then
      select exists (select 1 from events r where r.school_id = cand.school_id and r.runner = 'desktop' and r.status = 'running') into busy;
      if not busy then
        picked := cand.id;
        exit;
      end if;
    end if;
  end loop;

  if picked is null then
    return;
  end if;

  return query
    update events set status = 'running', claimed_by = null, attempts = attempts + 1
    where id = picked and status = 'queued'
    returning *;
end;
$$;

-- Settles an event an operator ran. Same rule as finish_event, for events no user's Desktop claimed.
create function finish_operator_event(event uuid, status_in event_status, error_in text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if status_in not in ('done', 'failed') then
    raise exception 'finish_operator_event takes done or failed';
  end if;
  update events set status = status_in, error = case when status_in = 'failed' then coalesce(error_in, 'failed') else null end,
    finished_at = now()
  where id = event and runner = 'desktop' and claimed_by is null and status in ('running', 'done', 'failed');
end;
$$;

revoke all on function operator_heartbeat(uuid, text, text, text), claim_operator_event(uuid, text), finish_operator_event(uuid, event_status, text)
  from public, anon, authenticated;
grant execute on function operator_heartbeat(uuid, text, text, text), claim_operator_event(uuid, text), finish_operator_event(uuid, event_status, text)
  to service_role;
