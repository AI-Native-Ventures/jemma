-- A demo sandbox has a kind: the made-up school Hillview Primary (every sandbox so far), or an empty school with one teacher,
-- for a visitor who wants to start from nothing. Additive only: the default keeps the deployed code, which does not name a kind,
-- writing valid rows (they are the Hillview kind).
alter table demo_sandboxes add column kind text not null default 'hillview';
alter table demo_sandboxes add constraint demo_sandboxes_kind_check check (kind in ('hillview', 'empty'));
