-- NOT applied with 0020. Apply it after the code that names a subject is deployed, because the code before it still upserts on this key.
-- It lets one learner hold a pattern of the same kind in the same strand name in two subjects (for example `data` in Mathematics and in
-- Natural Sciences). The new key (child_id, kind, subject, family) from 0020 stays.
alter table long_view_patterns drop constraint if exists long_view_patterns_child_id_kind_family_key;
