import type { JemmaDb } from '../../db'
import { canonicalSubject, DEFAULT_SUBJECT, sameSubject, type ChoiceRules, type MyMathsInput, type PracticeInput } from '../../logic'
import { ok } from '../context'
import { loadHistory } from './get-learner-history'

/** The classes the learner is in, with their subject, and the topics of their approved maps (with the topics each one needs). */
export async function loadLearnerMap(db: JemmaDb, childId: string) {
  const enrolments = await ok(db.from('enrolments').select('class_id').eq('child_id', childId))
  const classIds = [...new Set(enrolments.map((e) => e.class_id))]
  const [classes, maps] = await Promise.all([
    classIds.length ? ok(db.from('classes').select('id, subject').in('id', classIds)) : Promise.resolve([]),
    classIds.length ? ok(db.from('curriculum_maps').select('id').eq('status', 'approved').in('class_id', classIds)) : Promise.resolve([]),
  ])
  const topics = maps.length ? await ok(db.from('topics').select('id, name, family, term, position, prerequisite_ids').in('map_id', maps.map((m) => m.id))) : []
  return { classes, topics }
}

/**
 * What `pickPractice` needs for one learner, read from the database: the fixed gaps, the sessions finished, the strands of the learner's
 * subject with their marks (from the history the Long view builds), and the topics of the approved maps of the learner's classes.
 * The child must already be checked with `assertInSchool`. The planner and the `practice.requested` postcondition both read it here, so
 * they always agree on what there is to practise.
 */
export async function loadPracticeInput(db: JemmaDb, childId: string, now: Date): Promise<PracticeInput> {
  const [{ classes, topics }, fixed, sessions] = await Promise.all([
    loadLearnerMap(db, childId),
    ok(db.from('gaps').select('topic_id, topic_name, fixed_at').eq('child_id', childId).eq('stage', 'fixed')),
    ok(db.from('sessions').select('topic_id, topic_name, finished_at').eq('child_id', childId).eq('status', 'done')),
  ])

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

/**
 * What decides whether a choice is the learner's to make (`resolveChoice`): the topics of the approved maps of the learner's classes, the
 * learner's gaps (open or fixed) and the subject of their class. The planner and the server action that asks for a practice both read it here.
 */
export async function loadChoiceRules(db: JemmaDb, childId: string): Promise<ChoiceRules> {
  const [{ classes, topics }, gaps] = await Promise.all([loadLearnerMap(db, childId), ok(db.from('gaps').select('topic_id, topic_name').eq('child_id', childId))])
  return {
    mapTopics: topics.map((t) => ({ id: t.id, name: t.name, family: t.family })),
    gaps: gaps.map((g) => ({ topicId: g.topic_id, topicName: g.topic_name })),
    subject: classes[0] ? canonicalSubject(classes[0].subject) : null,
  }
}

/**
 * Everything `buildMyMaths` needs for one learner, read by this learner's id only: the topics of this year's approved maps, the gaps, the
 * marked answers (with the state of their paper and whether their test is still held), the sessions with their items, and the strands of
 * the past records (used only to pick a suggestion). The child must already be checked with `assertInSchool`, or be the signed-in learner.
 */
export async function loadMyMathsInput(db: JemmaDb, childId: string, now: Date): Promise<MyMathsInput> {
  const [{ classes, topics }, practice, gaps, sessions, results] = await Promise.all([
    loadLearnerMap(db, childId),
    loadPracticeInput(db, childId, now),
    ok(db.from('gaps').select('topic_id, topic_name, stage, created_at, fixed_at').eq('child_id', childId)),
    ok(db.from('sessions').select('id, topic_id, topic_name, status, finished_at').eq('child_id', childId)),
    ok(db.from('question_results').select('topic_id, topic_name, correct, paper_id').eq('child_id', childId)),
  ])
  const doneIds = sessions.filter((s) => s.status === 'done').map((s) => s.id)
  const paperIds = [...new Set(results.map((r) => r.paper_id))]
  const [items, papers] = await Promise.all([
    doneIds.length ? ok(db.from('session_items').select('session_id, phase, correct').in('session_id', doneIds)) : Promise.resolve([]),
    paperIds.length ? ok(db.from('papers').select('id, status, test_id').in('id', paperIds)) : Promise.resolve([]),
  ])
  const testIds = [...new Set(papers.map((p) => p.test_id).filter((t): t is string => !!t))]
  const tests = testIds.length ? await ok(db.from('tests').select('id, held').in('id', testIds)) : []
  // The family of a topic that is on no current map (an older map's), so its answers still find their strand.
  const known = new Set(topics.map((t) => t.id))
  const otherIds = [...new Set([...results.map((r) => r.topic_id), ...sessions.map((s) => s.topic_id)].filter((id): id is string => !!id && !known.has(id)))]
  const others = otherIds.length ? await ok(db.from('topics').select('id, family').in('id', otherIds)) : []
  const familyOf = new Map([...topics, ...others].map((t) => [t.id, t.family]))

  const paperOf = new Map(papers.map((p) => [p.id, p]))
  const heldOf = new Map(tests.map((t) => [t.id, t.held]))
  // One subject: the first class's (Mathematics only for now). A learner in no class has the default.
  const subject = classes[0] ? canonicalSubject(classes[0].subject) : DEFAULT_SUBJECT
  return {
    now,
    subject,
    topics: topics.map((t) => ({ id: t.id, name: t.name, family: t.family, term: t.term, position: t.position, prerequisiteIds: t.prerequisite_ids ?? [] })),
    gaps: gaps.map((g) => ({ topicId: g.topic_id, topicName: g.topic_name, stage: g.stage, createdAt: g.created_at, fixedAt: g.fixed_at })),
    answers: results.flatMap((r) => {
      const paper = paperOf.get(r.paper_id)
      if (!paper) return []
      return [{ topicId: r.topic_id, topicName: r.topic_name, family: r.topic_id ? (familyOf.get(r.topic_id) ?? null) : null, correct: r.correct, paperStatus: paper.status, testHeld: paper.test_id ? (heldOf.get(paper.test_id) ?? true) : null }]
    }),
    sessions: sessions.map((s) => ({
      topicId: s.topic_id,
      topicName: s.topic_name,
      family: s.topic_id ? (familyOf.get(s.topic_id) ?? null) : null,
      status: s.status,
      finishedAt: s.finished_at,
      items: items.filter((i) => i.session_id === s.id).map((i) => ({ phase: i.phase, correct: i.correct })),
    })),
    history: practice.strands,
  }
}
