-- AI runner: cloud or a desktop runner claimed by a user.

create type runner as enum ('cloud', 'desktop');

alter table schools add column ai_runner runner not null default 'cloud';
alter table events add column runner runner not null default 'cloud';
alter table events add column claimed_by uuid;

create table runner_presence (
  runner_id uuid primary key,
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users (id) on delete cascade,
  agents jsonb not null default '{}'::jsonb,
  chosen text,
  last_seen timestamptz not null default now()
);
create index on runner_presence (user_id);

alter table runner_presence enable row level security;
create policy runner_presence_own on runner_presence for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table mcp_tokens add column user_id uuid references auth.users (id) on delete cascade;
alter table mcp_tokens alter column school_id drop not null;
alter table mcp_tokens add constraint mcp_tokens_one_owner check (num_nonnulls(user_id, school_id) = 1);
