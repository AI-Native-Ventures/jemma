import { describe, expect, test } from 'vitest'
import { EventSchema } from '../src/schemas/events'
import { jobPlan, postconditions } from '../src/plans'
import { memoryDb, type MemoryDb } from './helpers/memory-db'

// The job plan and the postcondition of `practice.requested`, from the database state (the plan is made again after every job). Tables are in
// memory: no database, no network.

const CHILD = '33333333-3333-4333-8333-333333333333'
const CLASS = '22222222-2222-4222-8222-222222222222'
const MAP = '44444444-4444-4444-8444-444444444444'
const NOW = new Date('2026-11-13T15:00:00.000Z')
const TODAY = '2026-11-13'

type Row = Record<string, unknown>
const event = { type: 'practice.requested' as const, childId: CHILD }

const session = (planned_for: string, lesson: string | null, over: Row = {}): Row => ({ id: crypto.randomUUID(), child_id: CHILD, lesson_id: lesson, status: 'planned', planned_for, ...over })
const lesson = (id: string, content: unknown): Row => ({ id, child_id: CHILD, content })
const withQuestions = { questions: [{ n: 1 }] }

function world(over: Record<string, Row[]> = {}): MemoryDb {
  return memoryDb({
    sessions: [], lessons: [], gaps: [], enrolments: [{ child_id: CHILD, class_id: CLASS }], classes: [{ id: CLASS, subject: 'Mathematics' }],
    curriculum_maps: [], topics: [], learner_records: [], question_results: [], observations: [],
    children: [{ id: CHILD, school_id: 's', first_name: 'Amina', grade: 6 }],
    ...over,
  })
}
const plan = (db: MemoryDb) => jobPlan(EventSchema.parse(event), db, NOW)
const unmet = (db: MemoryDb) => postconditions(EventSchema.parse(event), db, NOW)

describe('the event', () => {
  test('practice.requested names a learner and nothing else', () => {
    expect(EventSchema.parse({ type: 'practice.requested', childId: 'c1' })).toEqual({ type: 'practice.requested', childId: 'c1' })
    expect(EventSchema.safeParse({ type: 'practice.requested' }).success).toBe(false)
  })
})

describe('the job plan of practice.requested', () => {
  test('a planned session for today whose lesson has questions: nothing to do', async () => {
    const db = world({ sessions: [session(TODAY, 'l1')], lessons: [lesson('l1', withQuestions)] })
    expect(await plan(db)).toEqual([])
  })

  test('a planned session of an earlier day whose lesson has questions: nothing to do either', async () => {
    const db = world({ sessions: [session('2026-11-10', 'l1')], lessons: [lesson('l1', withQuestions)] })
    expect(await plan(db)).toEqual([])
  })

  test('such a session whose lesson has no questions yet: write_lesson', async () => {
    for (const content of [{}, { questions: [] }, null]) {
      const db = world({ sessions: [session(TODAY, 'l1')], lessons: [lesson('l1', content)] })
      expect(await plan(db)).toEqual([{ job: 'write_lesson', ids: { childId: CHILD } }])
    }
  })

  test('a session with no lesson row at all is a session without questions', async () => {
    expect(await plan(world({ sessions: [session(TODAY, null)] }))).toEqual([{ job: 'write_lesson', ids: { childId: CHILD } }])
  })

  test('no such session: plan_next_session with practice 1, then write_lesson', async () => {
    expect(await plan(world())).toEqual([
      { job: 'plan_next_session', ids: { childId: CHILD, practice: '1' } },
      { job: 'write_lesson', ids: { childId: CHILD } },
    ])
  })

  test('a session still ahead is not a session for today: the plan asks the planner, which brings it forward', async () => {
    const db = world({ sessions: [session('2026-11-14', 'l1')], lessons: [lesson('l1', withQuestions)] })
    expect((await plan(db)).map((s) => s.job)).toEqual(['plan_next_session', 'write_lesson'])
  })

  test('a finished session and the session of another learner are not planned sessions', async () => {
    const db = world({
      sessions: [session(TODAY, 'l1', { status: 'done' }), session(TODAY, 'l2', { child_id: '99999999-9999-4999-8999-999999999999' })],
      lessons: [lesson('l1', withQuestions), lesson('l2', withQuestions)],
    })
    expect((await plan(db)).map((s) => s.job)).toEqual(['plan_next_session', 'write_lesson'])
  })

  test('the plan is made again after every job: once the session is planned it is write_lesson, once written it is nothing', async () => {
    const db = world()
    expect((await plan(db)).map((s) => s.job)).toEqual(['plan_next_session', 'write_lesson'])
    db.tables.sessions!.push(session(TODAY, 'l1'))
    db.tables.lessons!.push(lesson('l1', {}))
    expect((await plan(db)).map((s) => s.job)).toEqual(['write_lesson'])
    db.tables.lessons![0]!.content = withQuestions
    expect(await plan(db)).toEqual([])
  })
})

describe('the postcondition of practice.requested', () => {
  test('met: a planned session for today or earlier with a lesson that has questions', async () => {
    expect(await unmet(world({ sessions: [session(TODAY, 'l1')], lessons: [lesson('l1', withQuestions)] }))).toEqual([])
  })

  test('not met: a session whose lesson has no questions', async () => {
    expect(await unmet(world({ sessions: [session(TODAY, 'l1')], lessons: [lesson('l1', {})] }))).toEqual([`no practice written for child ${CHILD}`])
  })

  test('not met: no session while there is something to practise (a fixed gap, past records, a map)', async () => {
    const fixed = { id: 'g1', child_id: CHILD, topic_id: null, topic_name: 'Adding decimals', stage: 'fixed', fixed_at: '2026-10-20T08:00:00Z' }
    expect(await unmet(world({ gaps: [fixed] }))).toEqual([`no practice written for child ${CHILD}`])
    expect(await unmet(world({ curriculum_maps: [{ id: MAP, class_id: CLASS, status: 'approved' }], topics: [{ id: 't1', map_id: MAP, name: 'Angles', family: 'shapes', term: 4, position: 1 }] }))).toEqual([`no practice written for child ${CHILD}`])
  })

  test('not met: no session and an open gap (the planner always plans an open gap)', async () => {
    const open = { id: 'g1', child_id: CHILD, topic_id: null, topic_name: 'Adding decimals', stage: 'new' }
    expect(await unmet(world({ gaps: [open] }))).toEqual([`no practice written for child ${CHILD}`])
  })

  test('met: no session, no open gap and nothing for pickPractice to pick', async () => {
    expect(await unmet(world())).toEqual([])
  })
})
