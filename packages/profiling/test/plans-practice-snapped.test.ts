import { describe, expect, test } from 'vitest'
import { afterEventFailed } from '../src/orchestrator'
import { jobPlan, postconditions } from '../src/plans'
import { EventSchema } from '../src/schemas/events'
import { memoryDb, type MemoryDb } from './helpers/memory-db'

// `practice.snapped`: a learner answered a practice on paper and sent one photo. Its job plan and its postcondition, from the database state
// (the plan is made again after every job), and what happens when it ends failed. Tables are in memory: no database, no network.

const CHILD = '33333333-3333-4333-8333-333333333333'
const SESSION = '55555555-5555-4555-8555-555555555555'
const NOW = new Date('2026-11-14T15:00:00.000Z')
const PATH = `school/${CHILD}/practice/${SESSION}-1.jpg`

type Row = Record<string, unknown>
const event = EventSchema.parse({ type: 'practice.snapped', sessionId: SESSION, path: PATH, questions: [0, 1, 5, 6, 10] })

const item = (phase: 'warmup' | 'try', position: number): Row => ({ session_id: SESSION, phase, position, question: {}, answer: 'x', correct: true, difficulty: 1, seconds: 0 })
const tries = (n: number) => Array.from({ length: n }, (_, i) => item('try', i + 1))

function world(over: Record<string, Row[]> = {}, session: Row = {}): MemoryDb {
  return memoryDb({
    sessions: [{ id: SESSION, child_id: CHILD, status: 'in_progress', lesson_id: 'l1', planned_for: '2026-11-14', ...session }],
    session_items: [],
    gaps: [],
    ...over,
  })
}

const tail = [
  { job: 'update_learner_profile', ids: { childId: CHILD, sessionId: SESSION } },
  { job: 'plan_next_session', ids: { childId: CHILD } },
  { job: 'write_lesson', ids: { childId: CHILD } },
]

describe('the event', () => {
  test('it names the session, the stored photo and the five question indexes', () => {
    expect(event).toEqual({ type: 'practice.snapped', sessionId: SESSION, path: PATH, questions: [0, 1, 5, 6, 10] })
  })

  test('a missing field, or an index that is not a whole number, is refused', () => {
    const good = { type: 'practice.snapped', sessionId: SESSION, path: PATH, questions: [0, 1, 5, 6, 10] }
    expect(EventSchema.safeParse(good).success).toBe(true)
    for (const bad of [{ ...good, sessionId: undefined }, { ...good, path: undefined }, { ...good, questions: undefined }, { ...good, questions: [0, 1.5] }, { ...good, questions: ['0'] }]) {
      expect(EventSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false)
    }
  })
})

describe('the job plan', () => {
  test('a session with no try answer: read the paper first, then the steps of a finished session', async () => {
    expect(await jobPlan(event, world(), NOW)).toEqual([{ job: 'read_paper', ids: { sessionId: SESSION } }, ...tail])
  })

  test('warm-up answers are not try answers: the paper is still read', async () => {
    const db = world({ session_items: [item('warmup', 1), item('warmup', 2)] })
    expect((await jobPlan(event, db, NOW))[0]).toEqual({ job: 'read_paper', ids: { sessionId: SESSION } })
  })

  test('once the five try answers are stored the plan is only the tail (a finished read is not planned again)', async () => {
    expect(await jobPlan(event, world({ session_items: tries(5) }), NOW)).toEqual(tail)
  })

  test('the try answers of another session do not count', async () => {
    const other = tries(5).map((r) => ({ ...r, session_id: '66666666-6666-4666-8666-666666666666' }))
    expect((await jobPlan(event, world({ session_items: other }), NOW))[0]).toEqual({ job: 'read_paper', ids: { sessionId: SESSION } })
  })
})

describe('the postcondition', () => {
  test('the session is done with five try answers: nothing is missing', async () => {
    const db = world({ session_items: tries(5) }, { status: 'done' })
    expect(await postconditions(event, db, NOW)).toEqual([])
  })

  test('a session that is not done is missing', async () => {
    const db = world({ session_items: tries(5) }, { status: 'in_progress' })
    expect((await postconditions(event, db, NOW)).join(' ')).toContain('not done')
  })

  test('a done session with fewer than five try answers is missing', async () => {
    for (const n of [0, 4]) {
      const db = world({ session_items: tries(n) }, { status: 'done' })
      expect((await postconditions(event, db, NOW)).join(' '), `${n} answers`).toContain('try answers')
    }
  })

  test('the tail is held to the same rule as a finished session: an open gap needs a planned session', async () => {
    const gap = { child_id: CHILD, stage: 'new' }
    const db = world({ session_items: tries(5), gaps: [gap] }, { status: 'done' })
    expect((await postconditions(event, db, NOW)).join(' ')).toContain(`no planned session for child ${CHILD}`)
    const next = { id: 'next', child_id: CHILD, status: 'planned', planned_for: '2026-11-17' }
    const planned = world({ session_items: tries(5), gaps: [gap], sessions: [{ id: SESSION, child_id: CHILD, status: 'done' }, next] })
    expect(await postconditions(event, planned, NOW)).toEqual([])
  })
})

describe('an event that ended failed', () => {
  test('afterEventFailed does nothing for it: there is no paper row to end', async () => {
    const db = world({ papers: [{ id: 'p1', child_id: CHILD, test_id: null, status: 'queued' }] })
    const before = JSON.stringify(db.tables)
    await afterEventFailed(db, { id: 'e1', school_id: 's1', type: 'practice.snapped', payload: { sessionId: SESSION, path: PATH, questions: [0] } })
    expect(JSON.stringify(db.tables)).toBe(before)
  })
})
