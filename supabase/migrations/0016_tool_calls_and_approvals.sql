-- P50a: a saved record of every tool call, and the name of the person behind every approval.
-- Additive only. Both tables are written by the service role (the agent and the web server), never by a user token:
-- there are no insert, update or delete policies.

-- One row per tool call: Jemma's own tools (cloud job or MCP) and the calls a runner reports from other servers.
create table tool_calls (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  school_id uuid not null references schools (id) on delete cascade,
  event_id uuid references events (id) on delete set null,
  server text not null default 'jemma',
  tool text not null,
  via text not null default 'cloud' check (via in ('cloud', 'mcp', 'runner')),
  engine text,
  model text,
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  ok boolean not null,
  error text,
  started_at timestamptz not null,
  duration_ms int not null default 0
);
create index on tool_calls (school_id, started_at desc);
create index on tool_calls (event_id);

-- One row per human decision, with the person's name as it was when they decided.
create table approvals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  school_id uuid not null references schools (id) on delete cascade,
  kind text not null,
  ref_id uuid not null,
  child_id uuid references children (id) on delete cascade,
  decision text not null check (decision in ('approved', 'declined', 'edited', 'confirmed', 'shared')),
  decided_by uuid not null references auth.users (id),
  decided_by_name text not null,
  decided_at timestamptz not null default now(),
  note text
);
create index on approvals (school_id, decided_at desc);

alter table tool_calls enable row level security;
alter table approvals enable row level security;

-- Teachers of the school read the tool log. Parents and learners never do.
create policy tool_calls_select on tool_calls for select to authenticated
  using (school_id = my_school() and my_role() = 'teacher');

-- Teachers of the school read every approval of the school. Anyone can read the approvals they gave themselves.
create policy approvals_select on approvals for select to authenticated
  using ((school_id = my_school() and my_role() = 'teacher') or decided_by = auth.uid());
