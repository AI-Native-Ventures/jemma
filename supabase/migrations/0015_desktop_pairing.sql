-- Jemma Desktop pairing: a signed-in user gets a one-time code, the desktop swaps it for a per-user MCP token.
-- Codes are stored as sha256 only. No policies: service role only (the pairing routes).

create table desktop_pairing_codes (
  code_hash text primary key,
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null,
  claimed_at timestamptz
);
create index on desktop_pairing_codes (user_id);

-- One row per claim try, keyed by the hash of the code that was typed (right or wrong), for the rate limit.
create table desktop_pairing_attempts (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null,
  at timestamptz not null default now()
);
create index on desktop_pairing_attempts (code_hash, at);

alter table desktop_pairing_codes enable row level security;
alter table desktop_pairing_attempts enable row level security;
