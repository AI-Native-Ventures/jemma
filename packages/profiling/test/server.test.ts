import { afterAll, beforeAll, expect, test, vi } from 'vitest'
import { createServiceClient, type JemmaDb } from '../src/db'
import { MemoryStore } from '../src/ai'
import { LearnerProfileSchema } from '../src/schemas'
import { connectInMemory } from '../src/server'
import { OutOfScopeError, assertInSchool, type ToolContext } from '../src/tools/context'
import { jobPlan } from '../src/plans'
import { createSandbox, type Sandbox } from './helpers/sandbox'
import { loadEnv } from './helpers/env'

vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 })
const env = loadEnv()
const db: JemmaDb = createServiceClient({
  SUPABASE_URL: env.SUPABASE_URL!,
  SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY!,
})
const tag = `srv${Date.now()}`
let a: Sandbox
let b: Sandbox

const ctxFor = (s: Sandbox): ToolContext => ({
  db,
  schoolId: s.schoolId,
  eventId: null,
  env: { replayStore: new MemoryStore() },
  now: () => new Date('2026-10-27T10:00:00Z'),
})

beforeAll(async () => {
  a = await createSandbox(db, `${tag}a`)
  b = await createSandbox(db, `${tag}b`)
})
afterAll(async () => {
  await a?.cleanup()
  await b?.cleanup()
})

test('server lists get_learner_profile with its schema', async () => {
  const { client, close } = await connectInMemory(ctxFor(a))
  const listed = await client.listTools()
  const tool = listed.tools.find((t) => t.name === 'get_learner_profile')
  expect(tool).toBeTruthy()
  expect(JSON.stringify(tool!.inputSchema)).toContain('childId')
  const names = listed.tools.map((t) => t.name)
  for (const n of ['get_job', 'get_curriculum_doc', 'get_memo', 'get_paper', 'get_class_results', 'get_child_context', 'complete_job']) {
    expect(names).toContain(n)
  }
  await close()
})

test('profile from the marked stage', async () => {
  const { client, close } = await connectInMemory(ctxFor(a))
  const res = await client.callTool({ name: 'get_learner_profile', arguments: { childId: a.aminaId } })
  expect(res.isError).toBeFalsy()
  const profile = LearnerProfileSchema.parse(res.structuredContent)
  expect(profile.child.firstName).toBe('Amina')
  expect(profile.attendance).toMatchObject({ present: 9, total: 10 })
  const fractions = profile.marksByTopic.find((m) => m.topicName === 'Adding fractions with different denominators')
  expect(fractions).toMatchObject({ percent: 0, change: -50 })
  expect(profile.observations).toHaveLength(2)
  expect(profile.activities).toHaveLength(2)
  await close()
})

test('ids from another school are refused', async () => {
  await expect(assertInSchool(ctxFor(a), 'children', [b.aminaId])).rejects.toBeInstanceOf(OutOfScopeError)
  await expect(assertInSchool(ctxFor(a), 'children', [a.aminaId])).resolves.toBeUndefined()
  await expect(assertInSchool(ctxFor(a), 'papers', [b.paperId])).rejects.toBeInstanceOf(OutOfScopeError)
  await expect(assertInSchool(ctxFor(a), 'tests', [b.testId])).rejects.toBeInstanceOf(OutOfScopeError)
  await expect(assertInSchool(ctxFor(a), 'children', ['not-a-uuid'])).rejects.toBeInstanceOf(OutOfScopeError)
  await expect(assertInSchool(ctxFor(a), 'children', ['00000000-0000-0000-0000-000000000000'])).rejects.toBeInstanceOf(OutOfScopeError)

  const { client, close } = await connectInMemory(ctxFor(a))
  const res = await client.callTool({ name: 'get_learner_profile', arguments: { childId: b.aminaId } })
  expect(res.isError).toBe(true)
  expect(JSON.stringify(res.content)).toContain('not in this school')
  await close()
})

test('job plans follow the plan table', async () => {
  const step = async (e: Parameters<typeof jobPlan>[0]) => (await jobPlan(e, db)).map((s) => s.job)
  expect(await step({ type: 'curriculum.uploaded', mapId: a.mapId })).toEqual(['draft_map'])
  expect(await step({ type: 'key.snapped', testId: a.testId })).toEqual(['read_key'])
  expect(await step({ type: 'observation.added', childId: a.aminaId })).toEqual(['guidance'])
  expect(await step({ type: 'activity.added', childId: a.aminaId })).toEqual(['guidance'])
  // the teacher checked one paper: only that learner is diagnosed and planned, and the class report is redone
  const tail = await jobPlan({ type: 'paper.checked', paperId: a.paperId }, db)
  expect(tail.map((s) => s.job)).toEqual(['diagnose', 'class_report', 'plan_next_session', 'write_lesson', 'guidance'])
  expect(tail[1]!.ids).toEqual({ classId: a.classId, testId: a.testId })
  // a fresh paper that is not yet read plans read_paper first, then the tail when every other paper is marked
  const mk = async () =>
    (await db.from('papers').insert({ test_id: a.testId, owner: 'teacher', kind: 'test', status: 'queued' }).select('id').single()).data!.id
  const fresh = await mk()
  const plan = await jobPlan({ type: 'paper.snapped', paperId: fresh }, db)
  expect(plan[0]).toEqual({ job: 'read_paper', ids: { paperId: fresh } })
  expect(plan[1]!.job).toBe('diagnose')
  // another paper still unread: only read_paper
  const other = await mk()
  expect((await jobPlan({ type: 'paper.snapped', paperId: fresh }, db)).map((x) => x.job)).toEqual(['read_paper'])
  // a paper waiting on the teacher counts as resolved, but another unread paper still holds the tail back
  await db.from('papers').update({ status: 'needs_you' }).eq('id', fresh)
  expect(await jobPlan({ type: 'paper.checked', paperId: fresh }, db)).toEqual([])
  // once nothing is being read, the tail runs for the marked papers even with one in Needs you
  await db.from('papers').update({ status: 'needs_you' }).eq('id', other)
  const withChecks = await jobPlan({ type: 'paper.snapped', paperId: a.paperId }, db)
  expect(withChecks.map((x) => x.job)).toContain('class_report')
  await db.from('papers').delete().in('id', [fresh, other])
})
