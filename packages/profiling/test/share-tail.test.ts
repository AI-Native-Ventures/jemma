import { afterAll, beforeAll, expect, test, vi } from 'vitest'
import { MemoryStore } from '../src/ai'
import { createServiceClient, type JemmaDb } from '../src/db'
import { runEvent, type CloudJobs } from '../src/orchestrator'
import { loadEnv } from './helpers/env'
import { createSandbox, type Sandbox } from './helpers/sandbox'

// P50b on the cloud route: a `test.shared` event runs the per learner tail of the test, under the same tail lock as the paper events,
// and a held test runs no tail at all. Real rows on jemma-dev, fake jobs (no model).

vi.setConfig({ testTimeout: 90_000, hookTimeout: 120_000 })
const env = loadEnv()
const db: JemmaDb = createServiceClient({ SUPABASE_URL: env.SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY! })
const tag = `st${Date.now()}${Math.floor(Math.random() * 1000)}`
let s: Sandbox
const aiEnv = { replayStore: new MemoryStore() }
const noSleep = async () => {}
const lock = async (testId: string) => (await db.from('ai_replays').select('key').eq('key', `lock:tail:${testId}`)).data!.length

async function newEvent(type: string, payload: Record<string, string>) {
  const { data, error } = await db
    .from('events')
    .insert({ school_id: s.schoolId, type, payload: { type, ...payload } } as never)
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data.id
}

/** Jobs that write what the real ones would, without a model. They also say whether the tail lock was held while they ran. */
function fakeJobs(calls: string[], locked: boolean[] = []): CloudJobs {
  return {
    diagnose: async () => void calls.push('diagnose'),
    class_report: async (_c, _e, ids) => {
      calls.push('class_report')
      await db.from('reteach_plans').insert({ class_id: ids.classId!, test_id: ids.testId!, topic_name: 'Fractions', content: {} })
    },
    write_lesson: async (_c, _e, ids) => {
      calls.push(`write_lesson:${ids.childId === s.aminaId ? 'amina' : 'thabo'}`)
      locked.push((await lock(s.testId)) === 1)
      const sess = await db.from('sessions').select('lesson_id').eq('child_id', ids.childId!).eq('status', 'planned').single()
      await db.from('lessons').update({ content: { questions: [{ n: 1 }] } }).eq('id', sess.data!.lesson_id!)
    },
    guidance: async (_c, _e, ids) => void calls.push(`guidance:${ids.childId === s.aminaId ? 'amina' : 'thabo'}`),
  }
}

beforeAll(async () => {
  s = await createSandbox(db, tag)
  // Both learners have an open gap, as the diagnoses would have left them. The test starts held, as every new test does.
  await db.from('gaps').insert([
    { child_id: s.aminaId, topic_name: 'Adding fractions with different denominators', stage: 'new' },
    { child_id: s.thaboId, topic_name: 'Adding fractions with different denominators', stage: 'new' },
  ])
  await db.from('tests').update({ held: true }).eq('id', s.testId)
})
afterAll(async () => {
  await s?.cleanup()
})

test('while the test is held a paper event stops after the diagnoses and the class report', async () => {
  const calls: string[] = []
  const id = await newEvent('paper.snapped', { paperId: s.paperId })
  expect(await runEvent(id, { db, env: aiEnv, jobs: fakeJobs(calls), sleep: noSleep })).toEqual({ status: 'done' })
  expect(calls).toEqual(['diagnose', 'diagnose', 'class_report'])
  const sessions = await db.from('sessions').select('id').in('child_id', [s.aminaId, s.thaboId]).eq('status', 'planned')
  expect(sessions.data).toEqual([])
})

test('test.shared plans a session, a lesson and the guidance for each learner, under the tail lock, and lets go of it', async () => {
  await db.from('tests').update({ held: false, shared_at: new Date().toISOString(), shared_by: s.teacherId }).eq('id', s.testId)
  const calls: string[] = []
  const locked: boolean[] = []
  const id = await newEvent('test.shared', { testId: s.testId })
  expect(await runEvent(id, { db, env: aiEnv, jobs: fakeJobs(calls, locked), sleep: noSleep })).toEqual({ status: 'done' })
  expect([...calls].sort()).toEqual(['guidance:amina', 'guidance:thabo', 'write_lesson:amina', 'write_lesson:thabo']) // the order of the learners is the database's
  expect(locked).toEqual([true, true]) // the run held lock:tail:<test> while it worked
  expect(await lock(s.testId)).toBe(0) // and let go
  const sessions = await db.from('sessions').select('child_id').in('child_id', [s.aminaId, s.thaboId]).eq('status', 'planned')
  expect((sessions.data ?? []).map((r) => r.child_id).sort()).toEqual([s.aminaId, s.thaboId].sort())
})

test('a paper checked after the share keeps today\'s behaviour: that learner gets the tail straight away', async () => {
  const calls: string[] = []
  const id = await newEvent('paper.checked', { paperId: s.paperId })
  expect(await runEvent(id, { db, env: aiEnv, jobs: fakeJobs(calls), sleep: noSleep })).toEqual({ status: 'done' })
  expect(calls).toEqual(['diagnose', 'class_report', 'write_lesson:amina', 'guidance:amina'])
})
