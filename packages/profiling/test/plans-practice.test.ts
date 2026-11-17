import { describe, expect, test } from 'vitest'
import { EventSchema } from '../src/schemas/events'
import { runEvent } from '../src/orchestrator'
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
      const due = session(TODAY, 'l1')
      const db = world({ sessions: [due], lessons: [lesson('l1', content)] })
      // the lesson is written for that session, by id: the learner may have another planned for a later day
      expect(await plan(db)).toEqual([{ job: 'write_lesson', ids: { childId: CHILD, sessionId: due.id } }])
    }
  })

  test('a session with no lesson row at all is a session without questions', async () => {
    const due = session(TODAY, null)
    expect(await plan(world({ sessions: [due] }))).toEqual([{ job: 'write_lesson', ids: { childId: CHILD, sessionId: due.id } }])
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

describe('a practice the learner chose', () => {
  const chosen = (over: Record<string, unknown>) => EventSchema.parse({ ...event, ...over })
  const run = (db: MemoryDb, over: Record<string, unknown>) => jobPlan(chosen(over), db, NOW)

  test('the event may carry the topic id and the topic name, and nothing else is needed', () => {
    expect(EventSchema.parse({ type: 'practice.requested', childId: 'c1', topicId: 't1', topicName: 'Fractions' })).toEqual({ type: 'practice.requested', childId: 'c1', topicId: 't1', topicName: 'Fractions' })
    expect(EventSchema.parse({ type: 'practice.requested', childId: 'c1', topicName: 'Fractions' })).toEqual({ type: 'practice.requested', childId: 'c1', topicName: 'Fractions' })
    expect(EventSchema.safeParse({ type: 'practice.requested', childId: 'c1', topicName: 5 }).success).toBe(false)
  })

  test('the plan step carries the choice in its ids, and the lesson step does not need it', async () => {
    expect(await run(world(), { topicId: 't-dec', topicName: 'Adding decimals' })).toEqual([
      { job: 'plan_next_session', ids: { childId: CHILD, practice: '1', topicName: 'Adding decimals', topicId: 't-dec' } },
      { job: 'write_lesson', ids: { childId: CHILD } },
    ])
    expect((await run(world(), { topicName: 'Fractions' }))[0]).toEqual({ job: 'plan_next_session', ids: { childId: CHILD, practice: '1', topicName: 'Fractions' } })
  })

  test('a topic id with no name is no choice, and an event with no choice has the ids of a practice with no choice', async () => {
    expect((await run(world(), { topicId: 't-dec' }))[0]).toEqual({ job: 'plan_next_session', ids: { childId: CHILD, practice: '1' } })
    expect((await jobPlan(EventSchema.parse(event), world(), NOW))[0]).toEqual({ job: 'plan_next_session', ids: { childId: CHILD, practice: '1' } })
  })

  test('once the choice is planned, the plan is write_lesson for that session, and once it is written nothing', async () => {
    const due = session(TODAY, 'l1', { topic_name: 'Fractions' })
    const db = world({ sessions: [due, session('2026-11-14', 'l2')], lessons: [lesson('l1', {}), lesson('l2', withQuestions)] })
    expect(await run(db, { topicName: 'Fractions' })).toEqual([{ job: 'write_lesson', ids: { childId: CHILD, sessionId: due.id } }])
    db.tables.lessons![0]!.content = withQuestions
    expect(await run(db, { topicName: 'Fractions' })).toEqual([])
  })

  // P155: tonight's lesson is never a gate. A written session that is due on ANOTHER topic is not the practice the learner chose.
  describe('while tonight\'s lesson waits on another topic', () => {
    const tonight = () => session(TODAY, 'l1', { topic_id: 't-frac', topic_name: 'Fractions', created_at: '2026-11-13T05:00:00.000Z' })
    const withTonight = () => world({ sessions: [tonight()], lessons: [lesson('l1', withQuestions)] })

    test('the choice is planned as a new session: plan_next_session with the choice, then write_lesson', async () => {
      expect(await run(withTonight(), { topicId: 't-dec', topicName: 'Adding decimals' })).toEqual([
        { job: 'plan_next_session', ids: { childId: CHILD, practice: '1', topicName: 'Adding decimals', topicId: 't-dec' } },
        { job: 'write_lesson', ids: { childId: CHILD } },
      ])
    })

    test('a choice of the same topic is tonight\'s lesson: nothing to do (by id, or by name)', async () => {
      expect(await run(withTonight(), { topicId: 't-frac', topicName: 'Fractions' })).toEqual([])
      expect(await run(withTonight(), { topicName: ' fractions ' })).toEqual([])
    })

    test('a practice with no choice is as it was: tonight\'s lesson is the practice, nothing to do', async () => {
      expect(await jobPlan(EventSchema.parse(event), withTonight(), NOW)).toEqual([])
    })

    test('once the new session is planned, the lesson is written for IT by id (not for tonight\'s), and tonight\'s lesson is never written again', async () => {
      const db = withTonight()
      const made = session(TODAY, 'l2', { topic_id: 't-dec', topic_name: 'Adding decimals', created_at: '2026-11-13T15:00:01.000Z' })
      db.tables.sessions!.push(made)
      db.tables.lessons!.push(lesson('l2', {}))
      expect(await run(db, { topicId: 't-dec', topicName: 'Adding decimals' })).toEqual([{ job: 'write_lesson', ids: { childId: CHILD, sessionId: made.id } }])
      db.tables.lessons![1]!.content = withQuestions
      expect(await run(db, { topicId: 't-dec', topicName: 'Adding decimals' })).toEqual([])
    })

    test('the postcondition is not met by tonight\'s lesson: the practice that was chosen has to be written (but met once it is, or for tonight\'s own topic)', async () => {
      const open = { id: 'g1', child_id: CHILD, topic_id: null, topic_name: 'Adding decimals', stage: 'new' }
      const at = (db: MemoryDb, over: Record<string, unknown>) => postconditions(EventSchema.parse({ ...event, ...over }), db, NOW)
      const choice = { topicId: 't-dec', topicName: 'Adding decimals' }
      const db = world({ gaps: [open], sessions: [tonight()], lessons: [lesson('l1', withQuestions)] })
      expect(await at(db, choice)).toEqual([`no practice written for child ${CHILD}`])
      // without a choice, tonight's lesson is the practice, as it always was
      expect(await at(db, {})).toEqual([])
      // the choice is tonight's own topic
      expect(await at(db, { topicId: 't-frac', topicName: 'Fractions' })).toEqual([])
      // once the chosen session is written
      db.tables.sessions!.push(session(TODAY, 'l2', { topic_id: 't-dec', topic_name: 'Adding decimals' }))
      db.tables.lessons!.push(lesson('l2', withQuestions))
      expect(await at(db, choice)).toEqual([])
    })
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

// P118: a learner who taps Start the moment the lesson appears (or even finishes it) before Jemma has checked its own work must not turn a good practice
// into "could not write". `dueSession` only sees a planned session, so with `since` (when the event was created) the check also looks at a session of any
// status whose lesson (or the session itself) was made after the event.
describe('the postcondition of practice.requested when the learner already started the practice (P118)', () => {
  // Made-up times in the order of the live run: the event, the session, the lesson, the check.
  const SINCE = '2026-11-13T14:18:18.000Z'
  const BEFORE = '2026-11-13T09:00:00.000Z'
  const SESSION_MADE = '2026-11-13T14:18:44.000Z'
  const LESSON_MADE = '2026-11-13T14:19:17.000Z'
  const MISSING = [`no practice written for child ${CHILD}`]
  const open = { id: 'g1', child_id: CHILD, topic_id: null, topic_name: 'Adding decimals', stage: 'new' }
  const since = (db: MemoryDb, at: Date | string | undefined = SINCE) => postconditions(EventSchema.parse(event), db, NOW, at)
  const made = (status: string, sessionAt: string, lessonAt: string, over: { content?: unknown; planned_for?: string; child_id?: string } = {}) => {
    const { content = withQuestions, planned_for = TODAY, child_id = CHILD } = over
    return world({
      gaps: [open],
      sessions: [session(planned_for, 'l1', { status, created_at: sessionAt, child_id })],
      lessons: [{ ...lesson('l1', content), created_at: lessonAt, child_id }],
    })
  }

  test('a session already done whose lesson was written after the event: met', async () => {
    expect(await since(made('done', SESSION_MADE, LESSON_MADE))).toEqual([])
  })

  test('a session the learner started and has not finished: met', async () => {
    expect(await since(made('in_progress', SESSION_MADE, LESSON_MADE))).toEqual([])
  })

  test('without `since` it is exactly as it was: the done and the started session are not seen', async () => {
    expect(await unmet(made('done', SESSION_MADE, LESSON_MADE))).toEqual(MISSING)
    expect(await unmet(made('in_progress', SESSION_MADE, LESSON_MADE))).toEqual(MISSING)
    expect(await postconditions(EventSchema.parse(event), made('done', SESSION_MADE, LESSON_MADE), NOW, undefined)).toEqual(MISSING)
  })

  test('the lesson or the session made after the event is enough, each alone', async () => {
    expect(await since(made('done', BEFORE, LESSON_MADE))).toEqual([])
    expect(await since(made('done', SESSION_MADE, BEFORE))).toEqual([])
  })

  test('a practice from earlier today (lesson and session made before the event) is not this practice: still not written', async () => {
    expect(await since(made('done', BEFORE, BEFORE))).toEqual(MISSING)
    expect(await since(made('in_progress', BEFORE, BEFORE))).toEqual(MISSING)
  })

  test('the moment of the event itself counts as after it', async () => {
    expect(await since(made('done', SINCE, SINCE))).toEqual([])
  })

  test('a lesson with no questions is not a practice, started or not', async () => {
    for (const content of [{}, { questions: [] }, null]) expect(await since(made('done', SESSION_MADE, LESSON_MADE, { content }))).toEqual(MISSING)
  })

  test('a session with no lesson row at all, or planned for a later day, or of another learner, does not count', async () => {
    const noLesson = world({ gaps: [open], sessions: [session(TODAY, null, { status: 'done', created_at: SESSION_MADE })] })
    expect(await since(noLesson)).toEqual(MISSING)
    expect(await since(made('done', SESSION_MADE, LESSON_MADE, { planned_for: '2026-11-14' }))).toEqual(MISSING)
    expect(await since(made('done', SESSION_MADE, LESSON_MADE, { child_id: '99999999-9999-4999-8999-999999999999' }))).toEqual(MISSING)
  })

  test('a session planned for an earlier day counts too, as a planned one does', async () => {
    expect(await since(made('done', SESSION_MADE, LESSON_MADE, { planned_for: '2026-11-10' }))).toEqual([])
  })

  test('`since` may be a Date; one that is not a date is ignored (the rule is then as it was)', async () => {
    expect(await since(made('done', SESSION_MADE, LESSON_MADE), new Date(SINCE))).toEqual([])
    expect(await since(made('done', SESSION_MADE, LESSON_MADE), 'not a date')).toEqual(MISSING)
  })

  test('the rules that came first still come first: a planned session with questions is met, nothing to practise is met, with or without `since`', async () => {
    const planned = world({ sessions: [session(TODAY, 'l1', { created_at: BEFORE })], lessons: [{ ...lesson('l1', withQuestions), created_at: BEFORE }] })
    expect(await since(planned)).toEqual([])
    expect(await since(world())).toEqual([])
  })

  test('something to practise and no session at all is still not written, with `since`', async () => {
    expect(await since(world({ gaps: [open] }))).toEqual(MISSING)
  })

  test('only a practice.requested event looks at `since`: any other event ignores it', async () => {
    const observed = EventSchema.parse({ type: 'observation.added', childId: CHILD })
    expect(await postconditions(observed, world(), NOW, SINCE)).toEqual([])
  })
})

// The wiring: `runEvent` hands the event's own `created_at` to the postconditions, so a practice the learner started meanwhile ends the event done.
describe('runEvent of a practice the learner already started (P118)', () => {
  const EVENT = '99999999-9999-4999-8999-999999999999'
  const SINCE = '2026-11-13T14:18:18.000Z'
  const BEFORE = '2026-11-13T09:00:00.000Z'
  const AFTER = '2026-11-13T14:19:17.000Z'
  const open = { id: 'g1', child_id: CHILD, topic_id: null, topic_name: 'Adding decimals', stage: 'new' }
  const asked = (): Row => ({ id: EVENT, school_id: 's', type: 'practice.requested', status: 'queued', runner: 'cloud', claimed_by: null, attempts: 0, payload: { type: 'practice.requested', childId: CHILD }, created_at: SINCE })
  // The planning and writing steps are stand-ins that write nothing: the learner has already got the session and its lesson (written at `at`).
  const run = (db: MemoryDb) =>
    runEvent(EVENT, { db, env: {} as never, jobs: { plan_next_session: async () => {}, write_lesson: async () => {} }, sleep: async () => {}, now: () => NOW })
  const ended = (at: string): MemoryDb =>
    world({
      schools: [{ id: 's' }],
      events: [asked()],
      gaps: [open],
      sessions: [session(TODAY, 'l1', { status: 'done', created_at: at })],
      lessons: [{ ...lesson('l1', withQuestions), created_at: at }],
    })

  test('the session was started and finished after the event was asked: the event ends done, not failed', async () => {
    const db = ended(AFTER)
    expect(await run(db)).toEqual({ status: 'done' })
    expect(db.tables.events![0]).toMatchObject({ status: 'done', error: null })
  })

  test('only an earlier practice today is there: the event still ends failed, with the same words as before', async () => {
    const db = ended(BEFORE)
    expect(await run(db)).toEqual({ status: 'failed' })
    expect(db.tables.events![0]).toMatchObject({ status: 'failed', error: `Jemma did not finish: no practice written for child ${CHILD}` })
  })
})

// P155, the whole wiring: tonight's lesson is written and waits (a different topic), the learner chooses another topic. The real planning step plans a new
// session, the lesson is written for that session by id, the event ends done, and tonight's session and lesson are exactly as they were.
describe('runEvent of a practice chosen while tonight\'s lesson waits (P155)', () => {
  const EVENT = '99999999-9999-4999-8999-999999999999'
  const T_FRAC = 't-frac'
  const T_ANG = 't-ang'
  const topic = (id: string, name: string, family: string): Row => ({ id, map_id: MAP, name, family, term: 4, position: 1, prerequisite_ids: [] })
  const asked = (over: Record<string, unknown>): Row => ({
    id: EVENT, school_id: 's', type: 'practice.requested', status: 'queued', runner: 'cloud', claimed_by: null, attempts: 0,
    payload: { type: 'practice.requested', childId: CHILD, ...over }, created_at: '2026-11-13T14:18:18.000Z',
  })
  const tonight = session(TODAY, 'l1', { topic_id: T_FRAC, topic_name: 'Fractions', created_at: '2026-11-13T05:00:00.000Z', planned_minutes: 10 })
  const setup = (over: Record<string, unknown>) =>
    world({
      schools: [{ id: 's' }],
      events: [asked(over)],
      curriculum_maps: [{ id: MAP, class_id: CLASS, status: 'approved' }],
      topics: [topic(T_FRAC, 'Fractions', 'fractions'), topic(T_ANG, 'Angles', 'shapes')],
      sessions: [{ ...tonight }],
      lessons: [{ ...lesson('l1', withQuestions), topic_name: 'Fractions' }],
    })
  const written: Record<string, string>[] = []
  const run = (db: MemoryDb) =>
    runEvent(EVENT, {
      db,
      env: {} as never,
      jobs: {
        // a stand-in for the AI: it fills the lesson of the session it is told (or, with no id, of the latest planned one), as the real job does
        write_lesson: async (_ctx, _id, ids) => {
          written.push(ids)
          const target = ids.sessionId ? db.tables.sessions!.find((s) => s.id === ids.sessionId) : undefined
          const row = db.tables.lessons!.find((l) => l.id === target?.lesson_id)
          if (row && !(row.content as { questions?: unknown[] })?.questions?.length) row.content = withQuestions
        },
      },
      sleep: async () => {},
      now: () => NOW,
    })

  test('a different topic: the event ends done, a second session is planned and written, and tonight\'s session and lesson are untouched', async () => {
    written.length = 0
    const db = setup({ topicId: T_ANG, topicName: 'Angles' })
    expect(await run(db)).toEqual({ status: 'done' })
    const all = db.tables.sessions!
    expect(all).toHaveLength(2)
    const made = all.find((s) => s.id !== tonight.id)!
    expect(made).toMatchObject({ status: 'planned', planned_for: TODAY, topic_id: T_ANG, topic_name: 'Angles' })
    expect(written).toEqual([{ childId: CHILD, sessionId: made.id }])
    expect(db.tables.lessons!.find((l) => l.id === made.lesson_id)!.content).toEqual(withQuestions)
    // tonight: still planned, same day, same lesson row, same questions
    expect(all.find((s) => s.id === tonight.id)).toMatchObject({ status: 'planned', planned_for: TODAY, lesson_id: 'l1', topic_name: 'Fractions' })
    expect(db.tables.lessons!.find((l) => l.id === 'l1')!.content).toEqual(withQuestions)
    expect(db.tables.events![0]).toMatchObject({ status: 'done', error: null })
  })

  test('the topic of tonight\'s own lesson: nothing is planned or written, and the event ends done (tonight\'s lesson is the practice)', async () => {
    written.length = 0
    const db = setup({ topicId: T_FRAC, topicName: 'Fractions' })
    expect(await run(db)).toEqual({ status: 'done' })
    expect(db.tables.sessions).toHaveLength(1)
    expect(written).toEqual([])
  })
})
