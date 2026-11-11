-- The Long view knows the subject of each result, so one learner can be followed in Mathematics, English and Natural Sciences at once.
-- Additive only. Code that does not know about subjects keeps working: a record with a family and no subject reads as Mathematics,
-- and a pattern row it writes gets the default subject.

-- A record's subject. Null for notes and attendance (they belong to the learner, not to a subject), and for rows an older seed wrote.
alter table learner_records add column subject text;
update learner_records set subject = 'Mathematics' where family is not null and subject is null;

-- A pattern belongs to a subject. The default keeps the deployed code, which does not name one, writing valid rows.
alter table long_view_patterns add column subject text not null default 'Mathematics';

-- The new identity of a pattern: learner, kind, subject and strand. The old unique key (child_id, kind, family) stays until
-- 0021: the deployed code still upserts on it. Until then two subjects cannot both hold a pattern of the same kind in the same strand name.
create unique index long_view_patterns_child_kind_subject_family_key on long_view_patterns (child_id, kind, subject, family);
