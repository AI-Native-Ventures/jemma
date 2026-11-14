import { expect, test } from 'vitest'
import { MemoryStore } from '../src/ai'
import { jobPlan, postconditions } from '../src/plans'
import { connectInMemory } from '../src/server'
import type { ToolContext } from '../src/tools/context'
import { memoryDb, type MemoryDb } from './helpers/memory-db'

// P88: the guidance card is written only from results the family may already see. A test is held until the teacher shares it,
// and a learner can have a paper in a held test while another test of theirs is shared or a note is added. In all of those plans
// the `guidance` step is left out for that learner, and `test.shared` plans it once nothing of theirs is held.
// No network, no model: the database is in memory.

const SCHOOL = '00000000-0000-4000-8000-0000000000a1'
const CLASS = 'class-1'
const SHARED = 'test-shared'
const HELD = 'test-held'
const [AMINA, THABO, SIPHO, LERATO, ZINZI, NEW] = ['amina', 'thabo', 'sipho', 'lerato', 'zinzi', 'new-child']

const rows = () => ({
  tests: [
    { id: SHARED, class_id: CLASS, held: false },
    { id: HELD, class_id: CLASS, held: true },
  ],
  papers: [
    // Amina: a shared test and a held test, both marked.
    { id: 'a-shared', test_id: SHARED, child_id: AMINA, status: 'marked' },
    { id: 'a-held', test_id: HELD, child_id: AMINA, status: 'marked' },
    // Thabo: only the shared test.
    { id: 't-shared', test_id: SHARED, child_id: THABO, status: 'marked' },
    // Sipho: a paper of the held test that waits in Needs you. Its answers are already stored.
    { id: 's-held', test_id: HELD, child_id: SIPHO, status: 'needs_you' },
    // Lerato: homework (no test), marked. A paper of no test counts as shared.
    { id: 'l-homework', test_id: null, child_id: LERATO, status: 'marked' },
    // Zinzi: a paper of the held test that failed on a re-read. Answers of an earlier marking may still be stored.
    { id: 'z-failed', test_id: HELD, child_id: ZINZI, status: 'failed' },
  ],
})

const db = (over: Record<string, Record<string, unknown>[]> = {}) => memoryDb({ ...rows(), ...over })
const share = (d: MemoryDb, testId: string) => {
  for (const t of d.tables.tests!) if (t.id === testId) t.held = false
}

const guidance = (childId: string) => ({ job: 'guidance', ids: { childId } })
const sessionAndLesson = (childId: string) => [
  { job: 'plan_next_session', ids: { childId } },
  { job: 'write_lesson', ids: { childId } },
]
const tail = (childId: string) => [...sessionAndLesson(childId), guidance(childId)]
const diagnose = (testId: string, childId: string) => ({ job: 'diagnose', ids: { testId, childId } })
const classReport = (testId: string) => ({ job: 'class_report', ids: { classId: CLASS, testId } })

for (const type of ['observation.added', 'activity.added'] as const) {
  test(`${type}: a learner with a marked paper of a held test gets no guidance step`, async () => {
    expect(await jobPlan({ type, childId: AMINA }, db())).toEqual([])
  })

  test(`${type}: a paper of a held test that waits in Needs you counts as held`, async () => {
    expect(await jobPlan({ type, childId: SIPHO }, db())).toEqual([])
  })

  test(`${type}: a paper of a held test counts whatever its status (a failed re-read can leave old answers)`, async () => {
    expect(await jobPlan({ type, childId: ZINZI }, db())).toEqual([])
  })

  test(`${type}: a learner whose papers are all of shared tests still gets the guidance step`, async () => {
    expect(await jobPlan({ type, childId: THABO }, db())).toEqual([guidance(THABO)])
  })

  test(`${type}: homework (a paper of no test) counts as shared`, async () => {
    expect(await jobPlan({ type, childId: LERATO }, db())).toEqual([guidance(LERATO)])
  })

  test(`${type}: a learner with no paper at all still gets the guidance step, as before`, async () => {
    expect(await jobPlan({ type, childId: NEW }, db())).toEqual([guidance(NEW)])
  })
}

test('observation.added: once the held test is shared the guidance step comes back', async () => {
  const d = db()
  expect(await jobPlan({ type: 'observation.added', childId: AMINA }, d)).toEqual([])
  share(d, HELD)
  expect(await jobPlan({ type: 'observation.added', childId: AMINA }, d)).toEqual([guidance(AMINA)])
})

test('a note that finds no guidance step ends with nothing missing: the event has no postcondition', async () => {
  const d = db()
  expect(await jobPlan({ type: 'observation.added', childId: AMINA }, d)).toEqual([])
  expect(await postconditions({ type: 'observation.added', childId: AMINA }, d)).toEqual([])
  expect(await postconditions({ type: 'activity.added', childId: AMINA }, d)).toEqual([])
})

test('paper.checked on a shared test: the learner with another held test gets a session and a lesson, and no guidance', async () => {
  expect(await jobPlan({ type: 'paper.checked', paperId: 'a-shared' }, db())).toEqual([diagnose(SHARED, AMINA), classReport(SHARED), ...sessionAndLesson(AMINA)])
  expect(await jobPlan({ type: 'paper.checked', paperId: 't-shared' }, db())).toEqual([diagnose(SHARED, THABO), classReport(SHARED), ...tail(THABO)])
})

test('paper.snapped on a shared test: only the learner with another held test loses the guidance step', async () => {
  expect(await jobPlan({ type: 'paper.snapped', paperId: 't-shared' }, db())).toEqual([
    diagnose(SHARED, AMINA),
    diagnose(SHARED, THABO),
    classReport(SHARED),
    ...sessionAndLesson(AMINA),
    ...tail(THABO),
  ])
})

test('a paper checked on the held test itself still plans no tail, as before', async () => {
  const d = db()
  for (const p of d.tables.papers!) if (p.id === 's-held') p.status = 'marked'
  expect(await jobPlan({ type: 'paper.checked', paperId: 's-held' }, d)).toEqual([diagnose(HELD, SIPHO), classReport(HELD)])
})

test('test.shared: each marked learner gets the tail, the one with another held test gets it without the guidance step', async () => {
  expect(await jobPlan({ type: 'test.shared', testId: SHARED }, db())).toEqual([...sessionAndLesson(AMINA), ...tail(THABO)])
})

test('test.shared on the second test gives the guidance step back: nothing of the learner is held any more', async () => {
  const d = db()
  expect(await jobPlan({ type: 'test.shared', testId: HELD }, d)).toEqual([]) // still held: plans nothing
  share(d, HELD)
  // Sipho and Zinzi have no marked paper, so only Amina is planned. Her papers are all of shared tests now.
  expect(await jobPlan({ type: 'test.shared', testId: HELD }, d)).toEqual(tail(AMINA))
})

test('test.shared postconditions do not wait for a card', async () => {
  const extra = { gaps: [{ child_id: AMINA, stage: 'new' }], sessions: [{ child_id: AMINA, status: 'planned' }] }
  expect(await postconditions({ type: 'test.shared', testId: SHARED }, memoryDb({ ...rows(), ...extra }))).toEqual([])
})

test('when no test is held the plans are exactly what they were', async () => {
  const none = db({ tests: [{ id: SHARED, class_id: CLASS, held: false }, { id: HELD, class_id: CLASS, held: false }] })
  expect(await jobPlan({ type: 'observation.added', childId: AMINA }, none)).toEqual([guidance(AMINA)])
  expect(await jobPlan({ type: 'activity.added', childId: SIPHO }, none)).toEqual([guidance(SIPHO)])
  expect(await jobPlan({ type: 'paper.checked', paperId: 'a-shared' }, none)).toEqual([diagnose(SHARED, AMINA), classReport(SHARED), ...tail(AMINA)])
  expect(await jobPlan({ type: 'test.shared', testId: SHARED }, none)).toEqual([...tail(AMINA), ...tail(THABO)])
})

test('a big class tail is checked in parts, so no one read comes near the 1000 rows a hosted database returns', async () => {
  // 60 learners, each with a paper of the shared test; the last one also has a paper of the held test.
  const kids = Array.from({ length: 60 }, (_, i) => `kid-${i}`)
  const papers = [
    ...kids.map((c) => ({ id: `p-${c}`, test_id: SHARED, child_id: c, status: 'marked' })),
    { id: 'p-held-last', test_id: HELD, child_id: kids[59]!, status: 'marked' },
  ]
  const d = db({ papers })
  const asked: number[] = []
  const from = d.from.bind(d)
  ;(d as { from: unknown }).from = (table: string) => {
    const q = from(table as never) as unknown as { in: (key: string, values: unknown[]) => unknown }
    const inner = q.in.bind(q)
    q.in = (key, values) => (key === 'child_id' && asked.push(values.length), inner(key, values))
    return q
  }
  const plan = await jobPlan({ type: 'test.shared', testId: SHARED }, d)
  const withGuidance = plan.filter((s) => s.job === 'guidance').map((s) => s.ids.childId)
  expect(withGuidance).toHaveLength(59)
  expect(withGuidance).not.toContain(kids[59]!)
  expect(plan.filter((s) => s.job === 'write_lesson')).toHaveLength(60)
  expect(asked.length).toBeGreaterThan(1)
  expect(Math.max(...asked)).toBeLessThanOrEqual(25)
})

// The route an MCP client takes (Claude Code, goose, the operator): it asks `get_job` for the next AI job of the event.

const ctxOf = (d: MemoryDb): ToolContext => ({ db: d, schoolId: SCHOOL, eventId: null, env: { replayStore: new MemoryStore() }, now: () => new Date('2026-11-14T10:00:00Z') })

test('over MCP, get_job names no guidance job for a learner with a held result, and names it for one without', async () => {
  const d = db()
  const held = '00000000-0000-4000-8000-0000000000e1'
  const clear = '00000000-0000-4000-8000-0000000000e2'
  d.tables.events = [
    { id: held, school_id: SCHOOL, type: 'observation.added', payload: { type: 'observation.added', childId: AMINA } },
    { id: clear, school_id: SCHOOL, type: 'observation.added', payload: { type: 'observation.added', childId: THABO } },
  ]
  const { client, close } = await connectInMemory(ctxOf(d))
  try {
    const none = await client.callTool({ name: 'get_job', arguments: { eventId: held } })
    expect(none.isError).toBeFalsy()
    expect(none.structuredContent).toMatchObject({ job: null, eventType: 'observation.added', ids: {} })
    const some = await client.callTool({ name: 'get_job', arguments: { eventId: clear } })
    expect(some.structuredContent).toMatchObject({ job: 'guidance', ids: { childId: THABO } })
  } finally {
    await close()
  }
})
