import { MockLanguageModelV4 } from 'ai/test'
import { afterAll, beforeAll, expect, test, vi } from 'vitest'
import { MemoryStore } from '../src/ai'
import { createServiceClient, type JemmaDb } from '../src/db'
import { runGuidance } from '../src/jobs/cloud/guidance'
import { checkDesktopTimeouts, runEvent, runInCloud, type CloudJobs } from '../src/orchestrator'
import { loadEnv } from './helpers/env'
import { createSandbox, type Sandbox } from './helpers/sandbox'

vi.setConfig({ testTimeout: 90_000, hookTimeout: 120_000 })
const env = loadEnv()
const db: JemmaDb = createServiceClient({
  SUPABASE_URL: env.SUPABASE_URL!,
  SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY!,
})
const tag = `or${Date.now()}${Math.floor(Math.random() * 1000)}`
let s: Sandbox
let desk: Sandbox
let parentId: string
const aiEnv = { replayStore: new MemoryStore() }
const noSleep = async () => {}

async function newEvent(sb: Sandbox, type: string, payload: Record<string, string>, extra: Record<string, unknown> = {}) {
  const { data, error } = await db
    .from('events')
    .insert({ school_id: sb.schoolId, type, payload: { type, ...payload }, ...extra } as never)
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data.id
}
const event = async (id: string) => (await db.from('events').select('*').eq('id', id).single()).data!
const count = async (table: 'question_results', paperId: string) =>
  (await db.from(table).select('id', { count: 'exact', head: true }).eq('paper_id', paperId)).count

/** Jobs that write what the real ones would, without a model. */
function fakeJobs(calls: string[] = []): CloudJobs {
  return {
    diagnose: async (_c, _e, ids) => {
      calls.push('diagnose')
      await db.from('gaps').insert({ child_id: ids.childId!, topic_name: 'Adding fractions with different denominators', stage: 'new' })
    },
    class_report: async (_c, _e, ids) => {
      calls.push('class_report')
      await db.from('reteach_plans').insert({ class_id: ids.classId!, test_id: ids.testId!, topic_name: 'Fractions', content: {} })
    },
    write_lesson: async (_c, _e, ids) => {
      calls.push('write_lesson')
      const sess = await db.from('sessions').select('lesson_id').eq('child_id', ids.childId!).eq('status', 'planned').single()
      await db.from('lessons').update({ content: { questions: [{ n: 1 }] } }).eq('id', sess.data!.lesson_id!)
    },
    guidance: async () => {
      calls.push('guidance')
    },
  }
}

beforeAll(async () => {
  s = await createSandbox(db, tag)
  desk = await createSandbox(db, `${tag}d${Math.floor(Math.random() * 1e3)}`, 'desktop')
  const p = await db.auth.admin.createUser({ email: `${tag}-parent@example.test`, password: `${tag}-Passw0rd!`, email_confirm: true })
  if (p.error) throw p.error
  parentId = p.data.user.id
  await db.from('profiles').insert({ user_id: parentId, role: 'parent', display_name: 'Thandi M', school_id: s.schoolId })
  await db.from('parent_links').insert({ parent_id: parentId, child_id: s.aminaId, class_id: s.classId, status: 'approved' })
})
afterAll(async () => {
  await s?.cleanup()
  await desk?.cleanup()
  if (parentId) await db.auth.admin.deleteUser(parentId)
})

test('a paper event runs the whole job plan with mock models', async () => {
  const calls: string[] = []
  const id = await newEvent(s, 'paper.snapped', { paperId: s.paperId })
  const out = await runEvent(id, { db, env: aiEnv, jobs: fakeJobs(calls), sleep: noSleep })
  expect(out).toEqual({ status: 'done' })
  expect(calls.filter((c) => c === 'diagnose')).toHaveLength(2)
  expect(calls).toContain('class_report')
  const row = await event(id)
  expect(row).toMatchObject({ status: 'done', error: null, attempts: 1 })
  expect(row.finished_at).not.toBeNull()
  expect((row.payload as { progress?: unknown }).progress).toBeTruthy()
  const reteach = await db.from('reteach_plans').select('id').eq('test_id', s.testId)
  expect(reteach.data).toHaveLength(1)
  const sessions = await db.from('sessions').select('child_id').eq('status', 'planned').in('child_id', [s.aminaId, s.thaboId])
  expect(sessions.data).toHaveLength(2)
})

test('planning a session notifies the linked parent', async () => {
  const n = await db.from('notifications').select('title, href').eq('user_id', parentId)
  expect(n.data).toEqual([{ title: "Tonight's lesson is ready", href: `/p/${s.aminaId}` }])
})

test('a job whose model output fails zod is retried once, then the event fails', async () => {
  const doGenerate = vi.fn(async () => ({
    content: [{ type: 'text' as const, text: '{"nope": true}' }],
    finishReason: { unified: 'stop' as const, raw: 'stop' },
    usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } },
    warnings: [],
  }))
  const model = new MockLanguageModelV4({ doGenerate })
  const id = await newEvent(s, 'observation.added', { childId: s.aminaId })
  const out = await runEvent(id, { db, env: aiEnv, jobs: { guidance: (c, e, ids) => runGuidance(c, e, ids, model) }, sleep: noSleep })
  expect(out).toEqual({ status: 'failed' })
  expect(doGenerate).toHaveBeenCalledTimes(2)
  const row = await event(id)
  expect(row.status).toBe('failed')
  expect(row.error).toBeTruthy()
})

test('retries a 429 then completes', async () => {
  let n = 0
  const sleeps: number[] = []
  const guidance = vi.fn(async () => {
    if (++n <= 2) throw Object.assign(new Error('429 rate limited'), { statusCode: 429 })
  })
  const id = await newEvent(s, 'observation.added', { childId: s.aminaId })
  const out = await runEvent(id, { db, env: aiEnv, jobs: { guidance }, sleep: async (ms) => void sleeps.push(ms) })
  expect(out).toEqual({ status: 'done' })
  expect(guidance).toHaveBeenCalledTimes(3)
  expect(sleeps).toEqual([1000, 4000])
  expect((await event(id)).attempts).toBe(3)
})

test('exhausted retries mark the event failed with a retry action', async () => {
  const sleeps: number[] = []
  const guidance = vi.fn(async () => {
    throw new Error('Request timed out')
  })
  const id = await newEvent(s, 'observation.added', { childId: s.aminaId })
  const out = await runEvent(id, { db, env: aiEnv, jobs: { guidance }, sleep: async (ms) => void sleeps.push(ms) })
  expect(out).toEqual({ status: 'failed' })
  expect(guidance).toHaveBeenCalledTimes(4)
  expect(sleeps).toEqual([1000, 4000, 10_000])
  const row = await event(id)
  expect(row.status).toBe('failed')
  expect(row.error).toContain('timed out')
  expect(row.attempts).toBe(4)
})

test('a rate limit before the last queue delivery puts the event back in the queue', async () => {
  const id = await newEvent(s, 'observation.added', { childId: s.aminaId })
  const guidance = async () => {
    throw new Error('429 rate limited')
  }
  await expect(runEvent(id, { db, env: aiEnv, jobs: { guidance }, sleep: noSleep, final: false })).rejects.toThrow('rate limited')
  expect((await event(id)).status).toBe('queued')
})

test('stops when the sandbox was reset', async () => {
  const before = await count('question_results', s.paperId)
  const id = await newEvent(s, 'paper.snapped', { paperId: s.paperId })
  const calls: string[] = []
  const jobs: CloudJobs = {
    ...fakeJobs(calls),
    diagnose: async () => {
      calls.push('diagnose')
      await db.from('events').update({ status: 'cancelled' }).eq('id', id)
    },
  }
  const out = await runEvent(id, { db, env: aiEnv, jobs, sleep: noSleep })
  expect(out).toEqual({ status: 'cancelled' })
  expect(calls).toEqual(['diagnose'])
  expect(await count('question_results', s.paperId)).toBe(before)
  expect((await event(id)).status).toBe('cancelled')
})

test('stops on a missing event', async () => {
  const id = await newEvent(s, 'observation.added', { childId: s.aminaId })
  const guidance = vi.fn(async () => {})
  const out = await runEvent(id, { db, env: aiEnv, jobs: { guidance }, sleep: noSleep, now: () => new Date() })
  expect(out.status).toBe('done')
  const gone = await runEvent(crypto.randomUUID(), { db, env: aiEnv, jobs: { guidance }, sleep: noSleep })
  expect(gone).toEqual({ status: 'cancelled' })
  expect(guidance).toHaveBeenCalledTimes(1)
})

test('desktop event without heartbeat for 10 minutes asks the owner', async () => {
  const id = await newEvent(desk, 'observation.added', { childId: desk.aminaId }, { runner: 'desktop' })
  const now = new Date()
  const mine = async () => (await db.from('needs_you_items').select('*').eq('school_id', desk.schoolId).eq('title', 'Jemma Desktop is off')).data!
  // Not waiting long enough yet.
  await checkDesktopTimeouts(db, now)
  expect(await mine()).toHaveLength(0)
  // 11 minutes later, but the runner is alive.
  const later = new Date(now.getTime() + 11 * 60_000)
  await db.from('runner_presence').insert({ runner_id: crypto.randomUUID(), user_id: desk.teacherId, last_seen: new Date(later.getTime() - 30_000).toISOString() })
  await checkDesktopTimeouts(db, later)
  expect(await mine()).toHaveLength(0)
  // The runner went quiet.
  await db.from('runner_presence').delete().eq('user_id', desk.teacherId)
  await checkDesktopTimeouts(db, later)
  await checkDesktopTimeouts(db, later) // not asked twice
  const items = await mine()
  expect(items).toHaveLength(1)
  expect(items[0]).toMatchObject({ owner_id: desk.teacherId, status: 'open', ref_id: id })
  const told = await db.from('notifications').select('title').eq('user_id', desk.teacherId)
  expect(told.data).toEqual([{ title: 'Jemma Desktop is off' }])

  const enqueue = vi.fn(async () => {})
  expect(await runInCloud(db, desk.schoolId, enqueue)).toEqual({ queued: 1 })
  expect(enqueue).toHaveBeenCalledWith(id)
  expect(await event(id)).toMatchObject({ runner: 'cloud', status: 'queued' })
  expect((await mine())[0]!.status).toBe('done')
})
