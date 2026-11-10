-- Operator runner: the owner's own Mac serves the hosted app with his Claude Code.
-- Additive only. Everything here is executable by service_role only (the operator runner holds the service key).

-- One row per running operator runner. last_seen is the server clock.
create table operator_presence (
  runner_id uuid primary key,
  last_seen timestamptz not null default now(),
  agent text,
  version text
);
alter table operator_presence enable row level security; -- no policies: service role only
revoke all on operator_presence from public, anon, authenticated;

create function operator_heartbeat(runner uuid, agent_in text, version_in text) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into operator_presence (runner_id, last_seen, agent, version)
  values (runner, now(), agent_in, version_in)
  on conflict (runner_id) do update
    set last_seen = now(), agent = excluded.agent, version = excluded.version;
end;
$$;

-- Claims the oldest event an operator may run, or returns zero rows. An event qualifies when it is queued with
-- runner 'desktop' and EITHER the cloud handed it off (payload.route = 'operator') OR its school runs on a desktop and
-- nobody of that school has a Jemma Desktop heartbeat from the last 2 minutes. One event per school runs at a time,
-- so two papers of one test never race for the test's tail. Two operators never get the same event.
-- With only_handoffs true the second kind (desktop schools) is left alone: for a shared database, where a runner must
-- not take other people's desktop-school events. Callers that pass only `runner` get the default, false.
create function claim_operator_event(runner uuid, only_handoffs boolean default false) returns setof events
language plpgsql security definer set search_path = public as $$
declare
  cand record;
  picked uuid;
  got boolean;
  busy boolean;
begin
  if not exists (select 1 from operator_presence where operator_presence.runner_id = runner) then
    raise exception 'unknown runner';
  end if;

  for cand in
    select e.id, e.school_id from events e
    where e.status = 'queued' and e.runner = 'desktop'
      and (
        e.payload->>'route' = 'operator'
        or (
          not only_handoffs
          and exists (select 1 from schools s where s.id = e.school_id and s.ai_runner = 'desktop')
          and not exists (
            select 1 from runner_presence rp
            where rp.last_seen > now() - interval '2 minutes'
              and (
                rp.user_id in (select p.user_id from profiles p where p.school_id = e.school_id)
                or rp.user_id in (select c.teacher_id from classes c where c.school_id = e.school_id)
              )
          )
        )
      )
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

revoke all on function operator_heartbeat(uuid, text, text), claim_operator_event(uuid, boolean), finish_operator_event(uuid, event_status, text)
  from public, anon, authenticated;
grant execute on function operator_heartbeat(uuid, text, text), claim_operator_event(uuid, boolean), finish_operator_event(uuid, event_status, text)
  to service_role;
