-- P161: family plans. A parent pays for more practice for all their children together: one plan on the parent's account, and the plan's
-- practices of a month are one pool the children share (Light 150, Regular 300, Heavy 600 a month). Without a plan a learner has 2 practices a
-- day. Lessons are never counted. The parent pays on PayFast, by the year; PayFast tells Jemma about each payment (its ITN), and Jemma writes
-- the rows here with the service role. Also: where a sign-up came from (the tags of an ad link, and the country), for the owner's admin pages.
--
-- Additive: three new tables, their indexes and policies, and one index on `events`. Nothing changes in a table that holds data. Safe to apply
-- once to a database that holds data, and safe to apply again (`if not exists`, `drop policy if exists`). The code that runs today does not use
-- any of it. The files run in name order, so this one uses only what 0001 to 0030 made.

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  parent_id uuid not null references auth.users (id) on delete cascade,
  plan text not null check (plan in ('light', 'regular', 'heavy')),
  -- pending: the parent went to PayFast and has not paid yet. active: paid, and it renews each year. cancelled: no renewal, it works to
  -- period_end. failed: a renewal was not paid, it works to grace_until. ended: it gives no practice any more.
  status text not null default 'pending' check (status in ('pending', 'active', 'cancelled', 'failed', 'ended')),
  provider text not null default 'payfast',
  -- PayFast's token of the subscription, from the first payment's notice. Jemma cancels and changes the plan with it.
  token text,
  -- The family's country when the plan was bought: prices follow it (P162: twice the price in the US).
  country text,
  -- What the parent was shown, in whole dollars a year, and what PayFast takes each year, in rand cents.
  price_usd integer not null check (price_usd > 0),
  amount_zar_cents integer not null check (amount_zar_cents > 0),
  period_end timestamptz,
  grace_until timestamptz,
  -- A smaller plan that starts at the next payment.
  next_plan text check (next_plan in ('light', 'regular', 'heavy')),
  cancelled_at timestamptz,
  ended_at timestamptz,
  -- "Turn it back on": the new plan that follows a cancelled one starts its paid year where the old one ends.
  follows uuid references public.subscriptions (id) on delete set null,
  -- A bigger plan the parent is paying the difference for (a payment of once on PayFast): it starts when that payment comes in.
  upgrade_plan text check (upgrade_plan in ('light', 'regular', 'heavy')),
  upgrade_usd integer,
  upgrade_zar_cents integer
);

create index if not exists subscriptions_parent on public.subscriptions (parent_id, created_at desc);
create unique index if not exists subscriptions_token on public.subscriptions (token) where token is not null;

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- A deleted account keeps its payments for the books, without the person: both links become null.
  subscription_id uuid references public.subscriptions (id) on delete set null,
  parent_id uuid references auth.users (id) on delete set null,
  kind text not null default 'plan' check (kind in ('plan', 'renewal', 'upgrade')),
  status text not null check (status in ('paid', 'failed', 'refunded')),
  -- PayFast's own number of the payment (unique, so a notice that comes twice is written once), and Jemma's number it was sent with.
  pf_payment_id text,
  m_payment_id text,
  amount_gross_zar_cents integer,
  amount_fee_zar_cents integer,
  amount_net_zar_cents integer,
  price_usd integer,
  paid_at timestamptz,
  -- The notice as PayFast sent it, without the signature and without the buyer's name and email.
  details jsonb not null default '{}'::jsonb
);

create unique index if not exists payments_pf on public.payments (pf_payment_id) where pf_payment_id is not null;
create index if not exists payments_parent on public.payments (parent_id, created_at desc);
create index if not exists payments_created on public.payments (created_at);

-- Where a person came from when they made their account: the country Cloudflare saw, and the tags of the link (utm_source, utm_medium,
-- utm_campaign) or "shared" for a link a person shared. No cookie of any ad network: Jemma reads the tags of its own address.
create table if not exists public.signups (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  country text,
  source text,
  medium text,
  campaign text,
  landing text
);

create index if not exists signups_created on public.signups (created_at);
-- In the US a learner under 13 needs a parent to make the account (COPPA): true when a person said they were born 13 or more years ago, null when
-- they were not asked (outside the US). Only the yes or no is kept, never the year.
alter table public.signups add column if not exists over_13 boolean;

-- Counting a learner's practices (2 a day without a plan, a month's pool with one) reads the practice events of a few learners in a window.
create index if not exists events_practice_child on public.events ((payload ->> 'childId'), created_at) where type = 'practice.requested';

alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;
alter table public.signups enable row level security;

-- Read: a parent reads their own plans and payments. Nobody else reads them in the app; the owner's admin pages read with the service role.
-- There is no insert, update or delete policy: only the service role writes (the payment notice from PayFast, and the parent's own actions on
-- the server after the parent is checked). `signups` has no policy at all: only the service role reads and writes it.
drop policy if exists subscriptions_select on public.subscriptions;
create policy subscriptions_select on public.subscriptions for select to authenticated using (parent_id = auth.uid());

drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments for select to authenticated using (parent_id = auth.uid());
