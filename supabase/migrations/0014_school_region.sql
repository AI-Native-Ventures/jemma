-- Region and grade range shown under a school name on boards. Null hides the line.
alter table public.schools add column if not exists region text;
alter table public.schools add column if not exists grades text;
