-- Needs you item for "Jemma Desktop is off" gets its own kind.
alter type public.need_kind add value if not exists 'desktop_off';
