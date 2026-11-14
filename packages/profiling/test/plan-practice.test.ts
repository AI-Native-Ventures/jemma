import { describe, expect, test } from 'vitest'
import { MemoryStore } from '../src/ai/stores'
import { codeJobs } from '../src/orchestrator'
import type { ToolContext } from '../src/tools/context'
import { planNextSession, SessionPlanSchema } from '../src/tools/save/plan-next-session'
import { memoryDb, type MemoryDb } from './helpers/memory-db'

// plan_next_session with `practice: true`: the learner asked to practise now. Tables are in memory (helpers/memory-db.ts): no database,
// no network. Without `practice` nothing changes: the cases the other tests cover, and not one query of the practice path.

const SCHOOL = '11111111-1111-4111-8111-111111111111'
const CLASS = '22222222-2222-4222-8222-222222222222'
const CHILD = '33333333-3333-4333-8333-333333333333'
const MAP = '44444444-4444-4444-8444-444444444444'
const T_FRAC = '55555555-5555-4555-8555-555555555551'
const T_DEC = '55555555-5555-4555-8555-555555555552'
const T_SHAPE = '55555555-5555-4555-8555-555555555553'
const NOW = new Date('2026-11-13T15:00:00.000Z') // a Friday, term 4
const TODAY = '2026-11-13'
const TOMORROW = '2026-11-14'

type Row = Record<string, unknown>

const topics: Row[] = [
  { id: T_FRAC, map_id: MAP, name: 'Fractions with different denominators', family: 'fractions', term: 4, position: 2, prerequisite_ids: [] },
  { id: T_DEC, map_id: MAP, name: 'Adding decimals', family: 'decimals', term: 4, position: 1, prerequisite_ids: [] },
  { id: T_SHAPE, map_id: MAP, name: 'Angles', family: 'shapes', term: 2, position: 1, prerequisite_ids: [] },
]

function world(over: Record<string, Row[]> = {}): MemoryDb {
  return memoryDb({
    children: [{ id: CHILD, school_id: SCHOOL, first_name: 'Amina', grade: 6 }],
    enrolments: [{ child_id: CHILD, class_id: CLASS }],
    classes: [{ id: CLASS, school_id: SCHOOL, subject: 'Mathematics', teacher_id: 'teacher' }],
    curriculum_maps: [],
    topics: [],
    gaps: [],
    sessions: [],
    lessons: [],
    attendance: [],
    format_trials: [],
    activities: [],
    learner_records: [],
    question_results: [],
    observations: [],
    tool_calls: [],
    ...over,
  })
}
const withMap = { curriculum_maps: [{ id: MAP, class_id: CLASS, status: 'approved' }], topics }

const ctx = (db: MemoryDb): ToolContext => ({ db, schoolId: SCHOOL, eventId: null, env: { replayStore: new MemoryStore() }, now: () => NOW })
const plan = (db: MemoryDb, practice?: boolean, choice?: { topicId?: string | null; topicName: string }) =>
  planNextSession.run(ctx(db), { childId: CHILD, ...(practice === undefined ? {} : { practice }), ...(choice ? { choice } : {}) }) as Promise<ReturnType<typeof SessionPlanSchema.parse>>
const record = (family: string, marks: number, term = 3, year = 2026): Row => ({
  id: crypto.randomUUID(), child_id: CHILD, source: 'quiz', grade: 6, year, term, happened_on: `${year}-0${term * 3 - 2}-15`, logged_at: `${year}-0${term * 3 - 2}-16T08:00:00Z`,
  teacher_name: 'Mrs Naidoo', title: `Quiz on ${family}`, family, topic_name: null, marks, out_of: 10, quality: 'clear', text: null, present: null, total: null,
  subject: 'Mathematics', import_id: null, added_by: null, added_by_name: null,
})
const gap = (name: string, stage: string, id: string | null, extra: Row = {}): Row => ({ id: crypto.randomUUID(), child_id: CHILD, topic_id: id, topic_name: name, stage, created_at: '2026-10-01T08:00:00Z', fixed_at: stage === 'fixed' ? '2026-10-20T08:00:00Z' : null, ...extra })
const planned = (planned_for: string, over: Row = {}): [Row, Row] => {
  const lessonId = crypto.randomUUID()
  return [
    { id: crypto.randomUUID(), child_id: CHILD, lesson_id: lessonId, status: 'planned', planned_for, created_at: '2026-11-10T08:00:00Z', topic_id: T_FRAC, topic_name: 'Fractions with different denominators', format: 'reading', warmup: [], ...over },
    { id: lessonId, child_id: CHILD, topic_id: T_FRAC, topic_name: 'Fractions with different denominators', format: 'reading', content: { questions: [{ n: 1 }] } },
  ]
}
const sessions = (db: MemoryDb) => db.tables.sessions!

describe('without practice nothing changes', () => {
  test('an open gap is planned for the next free day, as before, whether practice is missing or false', async () => {
    for (const practice of [undefined, false]) {
      const db = world({ ...withMap, gaps: [gap('Adding decimals', 'new', T_DEC)] })
      const out = await plan(db, practice)
      expect(out).toMatchObject({ planned: true, reused: false, topicName: 'Adding decimals', topicId: T_DEC, plannedFor: TOMORROW, queue: [{ reason: 'gap' }] })
      expect(sessions(db)).toHaveLength(1)
    }
  })

  test('a learner with only fixed gaps, past records and a map gets nothing, and the practice queries are never made', async () => {
    const db = world({ ...withMap, gaps: [gap('Adding decimals', 'fixed', T_DEC)], learner_records: [record('fractions', 3)] })
    const asked: string[] = []
    const watched = { ...db, from: (table: string) => (asked.push(table), (db as unknown as { from: (t: string) => unknown }).from(table)) } as unknown as MemoryDb
    expect(await plan(watched)).toMatchObject({ planned: false, sessionId: null, queue: [] })
    expect(sessions(db)).toHaveLength(0)
    expect(asked).not.toContain('learner_records')
    expect(asked).not.toContain('question_results')
  })

  test('a session ahead is returned as it is, and stays ahead', async () => {
    const [session, lesson] = planned(TOMORROW)
    const db = world({ ...withMap, sessions: [session], lessons: [lesson] })
    expect(await plan(db)).toMatchObject({ planned: true, reused: true, sessionId: session.id, plannedFor: TOMORROW })
    expect(sessions(db)[0]!.planned_for).toBe(TOMORROW)
  })
})

describe('practice: true', () => {
  test('a planned session for today that is not finished is returned as it is', async () => {
    const [session, lesson] = planned(TODAY)
    const db = world({ ...withMap, sessions: [session], lessons: [lesson] })
    expect(await plan(db, true)).toMatchObject({ planned: true, reused: true, sessionId: session.id, lessonId: lesson.id, plannedFor: TODAY, topicName: 'Fractions with different denominators', format: 'reading' })
    expect(sessions(db)).toHaveLength(1)
  })

  test('a planned session of an earlier day is returned as it is too (the learner never started it)', async () => {
    const [session, lesson] = planned('2026-11-10')
    const db = world({ ...withMap, sessions: [session], lessons: [lesson] })
    expect(await plan(db, true)).toMatchObject({ reused: true, sessionId: session.id, plannedFor: '2026-11-10' })
    expect(sessions(db)[0]!.planned_for).toBe('2026-11-10')
  })

  test('a finished session is not a planned one: a new practice is planned', async () => {
    const [session, lesson] = planned(TODAY, { status: 'done', finished_at: '2026-11-13T09:00:00Z' })
    const db = world({ ...withMap, sessions: [session], lessons: [lesson], gaps: [gap('Adding decimals', 'fixed', T_DEC)] })
    const out = await plan(db, true)
    expect(out).toMatchObject({ planned: true, reused: false, topicName: 'Adding decimals', plannedFor: TODAY })
    expect(sessions(db)).toHaveLength(2)
  })

  test('a session still ahead is brought forward to today and returned, and no second one is made', async () => {
    const [session, lesson] = planned(TOMORROW)
    const db = world({ ...withMap, sessions: [session], lessons: [lesson] })
    const out = await plan(db, true)
    expect(out).toMatchObject({ planned: true, reused: true, sessionId: session.id, lessonId: lesson.id, plannedFor: TODAY })
    expect(sessions(db)).toHaveLength(1)
    expect(sessions(db)[0]!.planned_for).toBe(TODAY)
    expect(db.tables.lessons).toHaveLength(1)
  })

  test('with an open gap the gap is planned for today, not for the next free day', async () => {
    const db = world({ ...withMap, gaps: [gap('Adding decimals', 'new', T_DEC), gap('Angles', 'fixed', T_SHAPE)] })
    const out = await plan(db, true)
    expect(out).toMatchObject({ planned: true, reused: false, topicName: 'Adding decimals', topicId: T_DEC, plannedFor: TODAY })
    expect(out.queue.map((q) => q.reason)).toEqual(['gap'])
    expect(sessions(db)[0]).toMatchObject({ planned_for: TODAY, status: 'planned', topic_id: T_DEC })
  })

  test('a day away from school is planned for today too (the normal plan, with the day changed)', async () => {
    const db = world({ ...withMap, attendance: [{ child_id: CHILD, day: '2026-11-11', status: 'away' }] })
    const out = await plan(db, true)
    expect(out).toMatchObject({ planned: true, plannedFor: TODAY })
    expect(out.queue[0]!.reason).toBe('away')
  })

  test('with only fixed gaps, the fixed gap practised longest ago is planned, with the reason review', async () => {
    const db = world({
      ...withMap,
      gaps: [gap('Fractions with different denominators', 'fixed', T_FRAC), gap('Adding decimals', 'fixed', T_DEC, { fixed_at: '2026-10-25T08:00:00Z' })],
      sessions: [{ id: crypto.randomUUID(), child_id: CHILD, status: 'done', planned_for: '2026-11-01', created_at: '2026-11-01T08:00:00Z', finished_at: '2026-11-12T16:00:00Z', topic_id: T_FRAC, topic_name: 'Fractions with different denominators' }],
    })
    const out = await plan(db, true)
    expect(out).toMatchObject({ planned: true, reused: false, topicName: 'Adding decimals', topicId: T_DEC, plannedFor: TODAY, queue: [{ topicName: 'Adding decimals', topicId: T_DEC, reason: 'review' }] })
    // a placeholder lesson and a session row exactly as the normal path makes them
    const made = sessions(db).find((s) => s.id === out.sessionId)!
    expect(made).toMatchObject({ child_id: CHILD, lesson_id: out.lessonId, status: 'planned', planned_for: TODAY, topic_id: T_DEC, topic_name: 'Adding decimals', warmup: [] })
    expect(db.tables.lessons!.find((l) => l.id === out.lessonId)).toMatchObject({ child_id: CHILD, topic_id: T_DEC, topic_name: 'Adding decimals', content: {} })
    // the practice opened no gap and reopened none
    expect(db.tables.gaps!.map((g) => g.stage)).toEqual(['fixed', 'fixed'])
  })

  test('the format is the one with the fewest trials on the family, ties in the order diagram, reading, audio', async () => {
    const trial = (format: string) => ({ child_id: CHILD, topic_family: 'decimals', format, score: 3 })
    const fixedOnly = { ...withMap, gaps: [gap('Adding decimals', 'fixed', T_DEC)] }
    expect((await plan(world({ ...fixedOnly, format_trials: [trial('diagram'), trial('reading')] }), true)).format).toBe('audio')
    expect((await plan(world({ ...fixedOnly, format_trials: [trial('diagram'), trial('audio')] }), true)).format).toBe('reading')
    expect((await plan(world(fixedOnly), true)).format).toBe('diagram')
    // trials of another family do not count
    expect((await plan(world({ ...fixedOnly, format_trials: [{ child_id: CHILD, topic_family: 'fractions', format: 'diagram', score: 1 }] }), true)).format).toBe('diagram')
  })

  test('with only past records, the weakest strand is planned: its label, no topic id, today', async () => {
    const db = world({ learner_records: [record('whole_numbers', 9), record('fractions', 3), record('decimals', 7)] })
    const out = await plan(db, true)
    expect(out).toMatchObject({ planned: true, reused: false, topicName: 'Fractions', topicId: null, plannedFor: TODAY, queue: [{ topicName: 'Fractions', topicId: null, reason: 'review' }] })
    expect(sessions(db)[0]).toMatchObject({ topic_id: null, topic_name: 'Fractions', planned_for: TODAY, status: 'planned' })
    expect(db.tables.lessons![0]).toMatchObject({ topic_id: null, topic_name: 'Fractions', content: {} })
  })

  test('the format of a strand counts the trials recorded under its key or under its label', async () => {
    const records = [record('fractions', 3)]
    const trial = (family: string, format: string) => ({ child_id: CHILD, topic_family: family, format, score: 1 })
    const out = await plan(world({ learner_records: records, format_trials: [trial('fractions', 'diagram'), trial('Fractions', 'reading')] }), true)
    expect(out.format).toBe('audio')
  })

  test('with only a map, the first topic of the current term is planned', async () => {
    const out = await plan(world(withMap), true)
    expect(out).toMatchObject({ planned: true, topicName: 'Adding decimals', topicId: T_DEC, plannedFor: TODAY, queue: [{ reason: 'review' }] })
  })

  test('with nothing at all it answers planned: false and writes nothing', async () => {
    const db = world()
    expect(await plan(db, true)).toEqual({ planned: false, reused: false, sessionId: null, lessonId: null, topicName: null, topicId: null, format: null, plannedFor: null, queue: [] })
    expect(sessions(db)).toHaveLength(0)
    expect(db.tables.lessons).toHaveLength(0)
  })

  test('asked again straight away, the practice is returned and not planned twice', async () => {
    const db = world({ ...withMap, gaps: [gap('Adding decimals', 'fixed', T_DEC)] })
    const first = await plan(db, true)
    const second = await plan(db, true)
    expect(second).toMatchObject({ reused: true, sessionId: first.sessionId, plannedFor: TODAY })
    expect(sessions(db)).toHaveLength(1)
  })

  test('the practice plan fits the schema of the tool, with reason review in the queue', async () => {
    const out = await plan(world(withMap), true)
    expect(SessionPlanSchema.parse(out).queue[0]!.reason).toBe('review')
  })
})


// The learner chooses what to practise (`choice`, only together with `practice: true`).
describe('practice: true with a choice', () => {
  const OTHER_CLASS = '22222222-2222-4222-8222-2222222222ff'
  const OTHER_MAP = '44444444-4444-4444-8444-4444444444ff'
  const OTHER_TOPIC = '55555555-5555-4555-8555-5555555555ff'
  const twoClasses = {
    curriculum_maps: [{ id: MAP, class_id: CLASS, status: 'approved' }, { id: OTHER_MAP, class_id: OTHER_CLASS, status: 'approved' }],
    topics: [...topics, { id: OTHER_TOPIC, map_id: OTHER_MAP, name: 'Probability puzzles', family: 'data', term: 4, position: 1, prerequisite_ids: [] }],
  }
  const planned_ = (db: MemoryDb) => sessions(db).filter((s) => s.status === 'planned')

  test('a session that is due stays what it is and is returned: one thing at a time', async () => {
    const [session, lesson] = planned(TODAY)
    const db = world({ ...withMap, sessions: [session], lessons: [lesson] })
    expect(await plan(db, true, { topicName: 'Angles', topicId: T_SHAPE })).toMatchObject({ planned: true, reused: true, sessionId: session.id, plannedFor: TODAY, topicName: 'Fractions with different denominators' })
    expect(sessions(db)).toHaveLength(1)
  })

  test('a session planned for a later day stays where it is, and the choice is planned for today as its own session', async () => {
    const [ahead, lesson] = planned(TOMORROW)
    const db = world({ ...withMap, sessions: [ahead], lessons: [lesson] })
    const out = await plan(db, true, { topicName: 'ADDING decimals' })
    expect(out).toMatchObject({ planned: true, reused: false, topicName: 'Adding decimals', topicId: T_DEC, plannedFor: TODAY, queue: [{ topicName: 'Adding decimals', topicId: T_DEC, reason: 'review' }] })
    expect(out.sessionId).not.toBe(ahead.id)
    expect(planned_(db)).toHaveLength(2)
    expect(sessions(db).find((s) => s.id === ahead.id)!.planned_for).toBe(TOMORROW)
    expect(sessions(db).find((s) => s.id === out.sessionId)).toMatchObject({ planned_for: TODAY, topic_id: T_DEC, topic_name: 'Adding decimals', status: 'planned', warmup: [] })
    expect(db.tables.lessons!.find((l) => l.id === out.lessonId)).toMatchObject({ topic_id: T_DEC, topic_name: 'Adding decimals', content: {} })
  })

  test('without a session ahead the choice is planned for today, whatever the learner\'s gaps are (the normal plan does not run)', async () => {
    const db = world({ ...withMap, gaps: [gap('Adding decimals', 'new', T_DEC)] })
    const out = await plan(db, true, { topicId: T_SHAPE, topicName: 'Angles' })
    expect(out).toMatchObject({ planned: true, topicName: 'Angles', topicId: T_SHAPE, plannedFor: TODAY, queue: [{ reason: 'review' }] })
  })

  test('the choice is planned once: asked again it returns the session it planned', async () => {
    const db = world(withMap)
    const first = await plan(db, true, { topicName: 'Angles' })
    const second = await plan(db, true, { topicName: 'Adding decimals' })
    expect(second).toMatchObject({ reused: true, sessionId: first.sessionId })
    expect(sessions(db)).toHaveLength(1)
  })

  test('a topic of another class\'s map, a name nobody knows and an empty name are refused: planned false, nothing written', async () => {
    for (const choice of [{ topicName: 'Probability puzzles', topicId: OTHER_TOPIC }, { topicName: 'Quadratic equations' }, { topicName: '' }, { topicName: '   ', topicId: T_DEC }, { topicName: 'Shapes', topicId: 'nope' }]) {
      const db = world({ ...twoClasses })
      const out = await plan(db, true, choice)
      expect(out, JSON.stringify(choice)).toMatchObject({ planned: false, sessionId: null, queue: [] })
      expect(sessions(db)).toHaveLength(0)
      expect(db.tables.lessons).toHaveLength(0)
    }
  })

  test('a refused choice leaves a session that is ahead where it is', async () => {
    const [ahead, lesson] = planned(TOMORROW)
    const db = world({ ...withMap, sessions: [ahead], lessons: [lesson] })
    expect(await plan(db, true, { topicName: 'Quadratic equations' })).toMatchObject({ planned: false })
    expect(sessions(db)).toHaveLength(1)
    expect(sessions(db)[0]!.planned_for).toBe(TOMORROW)
  })

  test('a topic of the map by id, the name of a gap (open or fixed) and the label of a strand are accepted', async () => {
    expect(await plan(world(withMap), true, { topicName: 'x', topicId: T_FRAC })).toMatchObject({ planned: true, topicName: 'Fractions with different denominators', topicId: T_FRAC })
    const mental = await plan(world({ ...withMap, gaps: [gap('Mental sums', 'fixed', null)] }), true, { topicName: 'mental sums' })
    expect(mental).toMatchObject({ planned: true, topicName: 'Mental sums', topicId: null })
    const strandDb = world(withMap)
    const strand = await plan(strandDb, true, { topicName: 'Measurement' })
    expect(strand).toMatchObject({ planned: true, topicName: 'Measurement', topicId: null, plannedFor: TODAY })
    expect(sessions(strandDb)[0]).toMatchObject({ topic_id: null, topic_name: 'Measurement' })
  })

  test('the format is the one with the fewest trials on the family; a strand\'s trials are recorded under its label', async () => {
    const trial = (family: string, format: string) => ({ child_id: CHILD, topic_family: family, format, score: 1 })
    expect((await plan(world({ ...withMap, format_trials: [trial('decimals', 'diagram'), trial('decimals', 'reading')] }), true, { topicName: 'Adding decimals' })).format).toBe('audio')
    expect((await plan(world({ ...withMap, format_trials: [trial('fractions', 'diagram'), trial('Fractions', 'reading')] }), true, { topicName: 'Fractions' })).format).toBe('audio')
  })

  test('a choice does nothing without practice: the normal plan runs, as it always did', async () => {
    const db = world({ ...withMap, gaps: [gap('Adding decimals', 'new', T_DEC)] })
    const out = await plan(db, undefined, { topicName: 'Angles', topicId: T_SHAPE })
    expect(out).toMatchObject({ topicName: 'Adding decimals', plannedFor: TOMORROW, queue: [{ reason: 'gap' }] })
    const noPractice = await plan(world(withMap), false, { topicName: 'Angles' })
    expect(noPractice.planned).toBe(false)
  })

  test('a practice with no choice is P79\'s: a session ahead is brought forward', async () => {
    const [ahead, lesson] = planned(TOMORROW)
    const db = world({ ...withMap, sessions: [ahead], lessons: [lesson] })
    expect(await plan(db, true)).toMatchObject({ sessionId: ahead.id, plannedFor: TODAY })
    expect(sessions(db)[0]!.planned_for).toBe(TODAY)
  })
})


describe('the built-in plan step of the orchestrator', () => {
  const step = (db: MemoryDb, ids: Record<string, string>) => codeJobs.plan_next_session!(ctx(db), 'event-1', ids)

  test('passes practice only for ids.practice 1, and the choice the ids carry', async () => {
    const chosen = world(withMap)
    await step(chosen, { childId: CHILD, practice: '1', topicName: 'Angles', topicId: T_SHAPE })
    expect(sessions(chosen)).toMatchObject([{ topic_name: 'Angles', topic_id: T_SHAPE, planned_for: TODAY }])

    const picked = world({ ...withMap, gaps: [gap('Adding decimals', 'fixed', T_DEC)] })
    await step(picked, { childId: CHILD, practice: '1' })
    expect(sessions(picked)).toMatchObject([{ topic_name: 'Adding decimals', planned_for: TODAY }])

    // not a practice: the ids of a normal plan, and a choice in them is ignored
    const normal = world({ ...withMap, gaps: [gap('Adding decimals', 'new', T_DEC)] })
    await step(normal, { childId: CHILD, topicName: 'Angles' })
    expect(sessions(normal)).toMatchObject([{ topic_name: 'Adding decimals', planned_for: TOMORROW }])
  })
})
