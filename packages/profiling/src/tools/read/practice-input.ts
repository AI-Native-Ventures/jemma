import type { JemmaDb } from '../../db'
import { canonicalSubject, sameSubject, type PracticeInput } from '../../logic'
import { ok } from '../context'
import { loadHistory } from './get-learner-history'

/**
 * What `pickPractice` needs for one learner, read from the database: the fixed gaps, the sessions finished, the strands of the learner's
 * subject with their marks (from the history the Long view builds), and the topics of the approved maps of the learner's classes.
 * The child must already be checked with `assertInSchool`. The planner and the `practice.requested` postcondition both read it here, so
 * they always agree on what there is to practise.
 */
export async function loadPracticeInput(db: JemmaDb, childId: string, now: Date): Promise<PracticeInput> {
  const enrolments = await ok(db.from('enrolments').select('class_id').eq('child_id', childId))
  const classIds = [...new Set(enrolments.map((e) => e.class_id))]
  const [classes, maps, fixed, sessions] = await Promise.all([
    classIds.length ? ok(db.from('classes').select('id, subject').in('id', classIds)) : Promise.resolve([]),
    classIds.length ? ok(db.from('curriculum_maps').select('id').eq('status', 'approved').in('class_id', classIds)) : Promise.resolve([]),
    ok(db.from('gaps').select('topic_id, topic_name, fixed_at').eq('child_id', childId).eq('stage', 'fixed')),
    ok(db.from('sessions').select('topic_id, topic_name, finished_at').eq('child_id', childId).eq('status', 'done')),
  ])
  const topics = maps.length ? await ok(db.from('topics').select('id, name, family, term, position').in('map_id', maps.map((m) => m.id))) : []

  // The past records are only read when no fixed gap decides the pick first: a fixed gap comes before them.
  let strands: PracticeInput['strands'] = []
  if (fixed.length === 0) {
    const { history } = await loadHistory({ db }, childId)
    const subjects = new Set(classes.map((c) => canonicalSubject(c.subject)))
    strands = history.subjects
      .filter((s) => subjects.size === 0 || [...subjects].some((own) => sameSubject(own, s.subject)))
      .flatMap((s) => s.families.map((f) => ({ subject: s.subject, family: f.family, label: f.label, byTerm: f.bySlot.map(({ year, term, percent }) => ({ year, term, percent })) })))
  }

  return {
    now,
    fixedGaps: fixed.map((g) => ({ topicId: g.topic_id, topicName: g.topic_name, fixedAt: g.fixed_at })),
    finishedSessions: sessions.flatMap((s) => (s.finished_at ? [{ topicId: s.topic_id, topicName: s.topic_name, finishedAt: s.finished_at }] : [])),
    strands,
    mapTopics: topics.map((t) => ({ id: t.id, name: t.name, family: t.family, term: t.term, position: t.position })),
  }
}
