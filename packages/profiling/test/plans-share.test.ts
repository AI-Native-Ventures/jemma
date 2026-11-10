import { expect, test } from 'vitest'
import { jobPlan, postconditions } from '../src/plans'
import { EventSchema } from '../src/schemas/events'
import { fakeDb } from './helpers/fake-db'

// P50b: while a test is held the plan stops after the diagnoses and the class report. `test.shared` does the per learner tail.
// No network: the database is a double.

const CLASS = 'class-1'
const TEST = 'test-1'
const [AMINA, THABO, SIPHO] = ['amina', 'thabo', 'sipho']

const papers = (over: Partial<Record<string, string>> = {}) => [
  { id: 'p-amina', test_id: TEST, child_id: AMINA, status: over.amina ?? 'marked' },
  { id: 'p-thabo', test_id: TEST, child_id: THABO, status: over.thabo ?? 'marked' },
  { id: 'p-sipho', test_id: TEST, child_id: SIPHO, status: over.sipho ?? 'needs_you' },
  { id: 'p-none', test_id: TEST, child_id: null, status: 'needs_you' },
]
const db = (held: boolean, extra: Record<string, Record<string, unknown>[]> = {}, p = papers()) =>
  fakeDb({ tests: [{ id: TEST, class_id: CLASS, held }], papers: p, ...extra })

const diagnose = (childId: string) => ({ job: 'diagnose', ids: { testId: TEST, childId } })
const classReport = { job: 'class_report', ids: { classId: CLASS, testId: TEST } }
const tail = (childId: string) => [
  { job: 'plan_next_session', ids: { childId } },
  { job: 'write_lesson', ids: { childId } },
  { job: 'guidance', ids: { childId } },
]

test('the event schema knows test.shared and wants a testId', () => {
  expect(EventSchema.parse({ type: 'test.shared', testId: TEST })).toEqual({ type: 'test.shared', testId: TEST })
  expect(EventSchema.safeParse({ type: 'test.shared' }).success).toBe(false)
  expect(EventSchema.safeParse({ type: 'test.shared', testId: 5 }).success).toBe(false)
})

test('a held test: papers snapped give the diagnoses and the class report, and no tail', async () => {
  const plan = await jobPlan({ type: 'paper.snapped', paperId: 'p-thabo' }, db(true, {}, papers({ amina: 'marked', thabo: 'marked' })))
  expect(plan).toEqual([diagnose(AMINA), diagnose(THABO), classReport])
})

test('a test that is not held keeps the whole plan: diagnoses, class report, then each learner tail', async () => {
  const plan = await jobPlan({ type: 'paper.snapped', paperId: 'p-thabo' }, db(false))
  expect(plan).toEqual([diagnose(AMINA), diagnose(THABO), classReport, ...tail(AMINA), ...tail(THABO)])
})

test('a held test: a paper the teacher checked gives that learner a diagnosis and the class report only', async () => {
  const plan = await jobPlan({ type: 'paper.checked', paperId: 'p-sipho' }, db(true, {}, papers({ sipho: 'marked' })))
  expect(plan).toEqual([diagnose(SIPHO), classReport])
})

test('a shared test: a paper the teacher checked later gets its own tail, as before', async () => {
  const plan = await jobPlan({ type: 'paper.checked', paperId: 'p-sipho' }, db(false, {}, papers({ sipho: 'marked' })))
  expect(plan).toEqual([diagnose(SIPHO), classReport, ...tail(SIPHO)])
})

test('test.shared plans the tail for every learner with a marked paper and for nobody else', async () => {
  const plan = await jobPlan({ type: 'test.shared', testId: TEST }, db(false))
  expect(plan).toEqual([...tail(AMINA), ...tail(THABO)]) // Sipho waits in Needs you, one paper has no learner yet
})

test('test.shared counts a learner twice never, even with two marked papers', async () => {
  const twice = [...papers(), { id: 'p-amina-2', test_id: TEST, child_id: AMINA, status: 'marked' }]
  const plan = await jobPlan({ type: 'test.shared', testId: TEST }, db(false, {}, twice))
  expect(plan.filter((s) => s.job === 'plan_next_session').map((s) => s.ids.childId)).toEqual([AMINA, THABO])
})

test('test.shared on a test that is somehow still held plans nothing', async () => {
  expect(await jobPlan({ type: 'test.shared', testId: TEST }, db(true))).toEqual([])
})

test('test.shared on a test with no marked paper plans nothing', async () => {
  const none = papers({ amina: 'needs_you', thabo: 'queued' })
  expect(await jobPlan({ type: 'test.shared', testId: TEST }, db(false, {}, none))).toEqual([])
})

// ---- postconditions ----

const openGap = (childId: string) => ({ child_id: childId, stage: 'new' })
const planned = (childId: string) => ({ child_id: childId, status: 'planned' })
const reteach = [{ id: 'r1', test_id: TEST }]

test('a held test does not ask for planned sessions, only for the class report', async () => {
  const event = { type: 'paper.snapped', paperId: 'p-thabo' } as const
  const withGaps = { reteach_plans: reteach, gaps: [openGap(AMINA), openGap(THABO)], sessions: [] }
  expect(await postconditions(event, db(true, withGaps))).toEqual([])
  expect(await postconditions(event, db(true, { ...withGaps, reteach_plans: [] }))).toEqual([`no reteach plan for test ${TEST}`])
})

test('a test that is not held still asks for a planned session for each learner with an open gap', async () => {
  const event = { type: 'paper.snapped', paperId: 'p-thabo' } as const
  const extra = { reteach_plans: reteach, gaps: [openGap(AMINA), openGap(THABO)], sessions: [planned(AMINA)] }
  expect(await postconditions(event, db(false, extra))).toEqual([`no planned session for child ${THABO}`])
  expect(await postconditions(event, db(false, { ...extra, sessions: [planned(AMINA), planned(THABO)] }))).toEqual([])
})

test('test.shared asks for a planned session for every marked learner with an open gap', async () => {
  const event = { type: 'test.shared', testId: TEST } as const
  const extra = { gaps: [openGap(AMINA), openGap(THABO), { child_id: SIPHO, stage: 'new' }], sessions: [planned(AMINA)] }
  // Sipho has an open gap but no marked paper yet, so he is not asked for.
  expect(await postconditions(event, db(false, extra))).toEqual([`no planned session for child ${THABO}`])
  expect(await postconditions(event, db(false, { ...extra, sessions: [planned(AMINA), planned(THABO)] }))).toEqual([])
})

test('test.shared does not ask for a session for a learner whose gaps are all fixed', async () => {
  const event = { type: 'test.shared', testId: TEST } as const
  const extra = { gaps: [{ child_id: AMINA, stage: 'fixed' }, openGap(THABO)], sessions: [planned(THABO)] }
  expect(await postconditions(event, db(false, extra))).toEqual([])
})

test('test.shared on a held test asks for nothing', async () => {
  const extra = { gaps: [openGap(AMINA)], sessions: [] }
  expect(await postconditions({ type: 'test.shared', testId: TEST }, db(true, extra))).toEqual([])
})
