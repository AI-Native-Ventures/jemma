-- Class gap explanation fields shown on the teacher-gap board.
alter table public.reteach_plans
  add column if not exists test_id uuid null references public.tests (id) on delete cascade,
  add column if not exists why text null,
  add column if not exists missing_basic text null,
  add column if not exists explanation text null;
