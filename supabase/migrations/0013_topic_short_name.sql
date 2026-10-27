-- Short label for boards (at most 3 words). Null means the full name is short enough.
alter table public.topics add column if not exists short_name text;
