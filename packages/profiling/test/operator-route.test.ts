import { MockLanguageModelV4 } from 'ai/test'
import { generateText, Output, wrapLanguageModel } from 'ai'
import { z } from 'zod'
import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest'
import { getModel, MemoryStore, ReplayMissError, withReplay, type AiEnv } from '../src/ai'
import { generateJson } from '../src/ai/json'
import { createServiceClient, type JemmaDb } from '../src/db'
import { checkOperatorTimeouts, isReplayMiss, OPERATOR_ONLINE_MS, runEvent, type CloudJob } from '../src/orchestrator'
import { loadEnv } from './helpers/env'
import { createSandbox, type Sandbox } from './helpers/sandbox'

// Routing of a cloud event when the owner's laptop does the AI work (AI_ROUTE=operator): recorded answer first,
// then an operator, then the free cloud model. Mocks only: no model is ever called.
vi.setConfig({ testTimeout: 90_000, hookTimeout: 120_000 })
const env = loadEnv()
const db: JemmaDb = createServiceClient({ SUPABASE_URL: env.SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY! })
const tag = `rt${Date.now()}${Math.floor(Math.random() * 1000)}`
const MODEL = 'test/not-recorded:free'
const store = new MemoryStore()
const baseEnv: AiEnv = { LLM_PROVIDER: 'openrouter', LLM_MODEL: MODEL, AI_MODE: 'live', replayStore: store }
const noSleep = async () => {}
const runners: string[] = []
let s: Sandbox
let desk: Sandbox

/** The real model layer (replay middleware over a provider model that is never reached on a miss or a hit). */
const ask = (ctx: { env: AiEnv }, prompt: string) =>
  generateText({ model: getModel('text', ctx.env), output: Output.object({ schema: z.object({ answer: z.string() }) }), prompt })

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
const online = async (lastSeen = new Date()) => {
  const runner = crypto.randomUUID()
  runners.push(runner)
  const { error } = await db.from('operator_presence').insert({ runner_id: runner, last_seen: lastSeen.toISOString(), agent: 'claude' })
  if (error) throw new Error(error.message)
  return runner
}
/**
 * A clock far ahead of every presence row in the database: no operator counts as online. Tests that make presence rows of
 * their own at a fake time use a different number of days each, so they never see each other's rows.
 */
const farFuture = (days = 2) => new Date(Date.now() + days * 86_400_000)
const lock = async (testId: string) => (await db.from('ai_replays').select('key').eq('key', `lock:tail:${testId}`)).data!.length

beforeAll(async () => {
  s = await createSandbox(db, tag)
  desk = await createSandbox(db, `${tag}d`, 'desktop')
  // jemma-dev is shared and an operator may be claiming there. A desktop event that stays running keeps this school
  // busy ("one event per school at a time"), so no claim ever takes the events this file hands off.
  await db.from('events').insert({ school_id: s.schoolId, type: 'observation.added', payload: { type: 'observation.added', childId: s.aminaId }, runner: 'desktop', status: 'running' })
})
// Presence rows made at a fake time in the future would count as "online" for the next test's earlier fake clock.
afterEach(async () => {
  if (runners.length) await db.from('operator_presence').delete().in('runner_id', runners).gt('last_seen', new Date(Date.now() + 86_400_000).toISOString())
})
afterAll(async () => {
  if (runners.length) await db.from('operator_presence').delete().in('runner_id', runners)
  await s?.cleanup()
  await desk?.cleanup()
})

// ---- detecting a replay miss -------------------------------------------------------------------------------------

test('isReplayMiss sees the miss the real middleware throws through generateText, Output.object and generateJson', async () => {
  const replayEnv = { ...baseEnv, AI_MODE: 'replay' as const }
  const fromText = await ask({ env: replayEnv }, 'a prompt nobody recorded').catch((e) => e)
  expect(isReplayMiss(fromText)).toBe(true)
  const fromJson = await generateJson({ model: getModel('text', replayEnv), schema: z.object({ a: z.string() }), system: 's', prompt: 'p' }).catch((e) => e)
  expect(isReplayMiss(fromJson)).toBe(true)
  expect(fromJson).toBeInstanceOf(ReplayMissError)
})

test('isReplayMiss walks cause chains, error lists and rewrapped messages, and ignores other errors', () => {
  const miss = new ReplayMissError('a'.repeat(64), 'm: please retry after the timeout 429 rate limit')
  expect(isReplayMiss(miss)).toBe(true)
  expect(isReplayMiss(new Error('wrapped', { cause: miss }))).toBe(true)
  expect(isReplayMiss(new Error('outer', { cause: new Error('middle', { cause: miss }) }))).toBe(true)
  expect(isReplayMiss(Object.assign(new Error('Failed after 3 attempts'), { errors: [new Error('x'), miss], lastError: miss }))).toBe(true)
  expect(isReplayMiss(Object.assign(new Error('No output generated'), { name: 'AI_NoOutputGeneratedError', cause: miss }))).toBe(true)
  expect(isReplayMiss(new Error(`Failed. Last error: Replay miss: ${'b'.repeat(64)} (m: hint)`))).toBe(true) // only the text survived
  expect(isReplayMiss(Object.assign(new Error('boom'), { name: 'ReplayMissError' }))).toBe(true)

  expect(isReplayMiss(new Error('429 rate limited'))).toBe(false)
  expect(isReplayMiss(new Error('Replay miss'))).toBe(false)
  expect(isReplayMiss(null)).toBe(false)
  expect(isReplayMiss('Replay miss')).toBe(false)
  const loop: Error & { cause?: unknown } = new Error('loops')
  loop.cause = loop
  expect(isReplayMiss(loop)).toBe(false)
})

// ---- the routing -------------------------------------------------------------------------------------------------

test('a recorded answer completes the event in the cloud, whatever the worker AI_MODE is, and nothing is handed off', async () => {
  // Record one answer under the same model id and call, then run the job through the real middleware in replay.
  const record = wrapLanguageModel({
    model: new MockLanguageModelV4({
      modelId: MODEL,
      doGenerate: async () =>
        ({
          content: [{ type: 'text', text: '{"answer":"4"}' }],
          finishReason: { unified: 'stop', raw: 'stop' },
          usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } },
          warnings: [],
        }) as never,
    }),
    middleware: withReplay(store, 'record'),
  })
  await generateText({ model: record, output: Output.object({ schema: z.object({ answer: z.string() }) }), prompt: 'what is 2 + 2' })

  const modes: (string | undefined)[] = []
  const guidance: CloudJob = async (ctx) => {
    modes.push(ctx.env.AI_MODE)
    await ask(ctx as never, 'what is 2 + 2')
  }
  await online() // an operator is there, and still is not needed
  const id = await newEvent(s, 'observation.added', { childId: s.aminaId })
  const out = await runEvent(id, { db, env: baseEnv, jobs: { guidance }, route: 'operator', sleep: noSleep })
  expect(out).toEqual({ status: 'done' })
  expect(modes).toEqual(['replay'])
  expect(await event(id)).toMatchObject({ status: 'done', runner: 'cloud', error: null })
  expect(((await event(id)).payload as { route?: string }).route).toBeUndefined()
})

test('a step that needs no model completes in the cloud with no operator', async () => {
  const guidance = vi.fn(async () => {})
  const id = await newEvent(s, 'observation.added', { childId: s.aminaId })
  const out = await runEvent(id, { db, env: baseEnv, jobs: { guidance }, route: 'operator', sleep: noSleep, now: farFuture })
  expect(out).toEqual({ status: 'done' })
  expect(guidance).toHaveBeenCalledTimes(1)
})

test('a miss with an operator online hands the event off: queued for the desktop, route marked, not failed, never retried', async () => {
  await online()
  const sleeps: number[] = []
  const calls: string[] = []
  const guidance: CloudJob = async (ctx) => {
    calls.push(ctx.env.AI_MODE ?? 'live')
    await ask(ctx as never, 'a prompt with timeout 429 rate limit in it') // the miss text names a timeout, which must not count as transient
  }
  const id = await newEvent(s, 'observation.added', { childId: s.aminaId })
  const out = await runEvent(id, { db, env: baseEnv, jobs: { guidance }, route: 'operator', sleep: async (ms) => void sleeps.push(ms) })
  expect(out).toEqual({ status: 'handed_off' })
  expect(calls).toEqual(['replay'])
  expect(sleeps).toEqual([])
  const row = await event(id)
  expect(row).toMatchObject({ status: 'queued', runner: 'desktop', error: null, claimed_by: null })
  expect(row.finished_at).toBeNull()
  expect(row.payload).toMatchObject({ type: 'observation.added', childId: s.aminaId, route: 'operator' })
})

test('a handed-off miss releases the tail lock and skips the postconditions', async () => {
  await online()
  const diagnose: CloudJob = async (ctx) => {
    expect(await lock(s.testId)).toBe(1) // the run took the tail before its first tail step
    await ask(ctx as never, 'diagnose a paper nobody recorded')
  }
  const id = await newEvent(s, 'paper.snapped', { paperId: s.paperId })
  const out = await runEvent(id, { db, env: baseEnv, jobs: { diagnose }, route: 'operator', sleep: noSleep })
  expect(out).toEqual({ status: 'handed_off' }) // the postconditions (no reteach plan yet) would have failed it
  expect(await lock(s.testId)).toBe(0)
  expect(await event(id)).toMatchObject({ status: 'queued', runner: 'desktop', error: null })
})

test('a miss wrapped by another error is still handed off', async () => {
  await online()
  const guidance: CloudJob = async (ctx) => {
    try {
      await ask(ctx as never, 'wrapped miss')
    } catch (err) {
      throw new Error('the job could not finish', { cause: err })
    }
  }
  const id = await newEvent(s, 'observation.added', { childId: s.aminaId })
  expect(await runEvent(id, { db, env: baseEnv, jobs: { guidance }, route: 'operator', sleep: noSleep })).toEqual({ status: 'handed_off' })
})

test('a miss with no operator online runs the step again with the worker AI_MODE (the cloud model)', async () => {
  const modes: (string | undefined)[] = []
  const guidance: CloudJob = async (ctx) => {
    modes.push(ctx.env.AI_MODE)
    if (ctx.env.AI_MODE === 'replay') await ask(ctx as never, 'a miss')
  }
  const id = await newEvent(s, 'observation.added', { childId: s.aminaId })
  const out = await runEvent(id, { db, env: baseEnv, jobs: { guidance }, route: 'operator', sleep: noSleep, now: farFuture })
  expect(out).toEqual({ status: 'done' })
  expect(modes).toEqual(['replay', 'live'])
  expect(await event(id)).toMatchObject({ status: 'done', runner: 'cloud' })
})

test('an operator last seen 91 seconds ago does not count; one last seen 89 seconds ago does', async () => {
  const at = farFuture(3) // every other presence row in the database is a day older than this clock
  const guidance: CloudJob = async (ctx) => {
    if (ctx.env.AI_MODE === 'replay') await ask(ctx as never, 'a miss')
  }
  await online(new Date(at.getTime() - OPERATOR_ONLINE_MS - 1000))
  const lateId = await newEvent(s, 'observation.added', { childId: s.aminaId })
  expect(await runEvent(lateId, { db, env: baseEnv, jobs: { guidance }, route: 'operator', sleep: noSleep, now: () => at })).toEqual({ status: 'done' })
  await online(new Date(at.getTime() - OPERATOR_ONLINE_MS + 1000))
  const id2 = await newEvent(s, 'observation.added', { childId: s.aminaId })
  expect(await runEvent(id2, { db, env: baseEnv, jobs: { guidance }, route: 'operator', sleep: noSleep, now: () => at })).toEqual({ status: 'handed_off' })
})

test('an event marked cloud_live is never handed off: it runs with the worker AI_MODE and no replay pass', async () => {
  await online()
  const modes: (string | undefined)[] = []
  const guidance: CloudJob = async (ctx) => {
    modes.push(ctx.env.AI_MODE)
  }
  const id = await newEvent(s, 'observation.added', { childId: s.aminaId, route: 'cloud_live' })
  expect(await runEvent(id, { db, env: baseEnv, jobs: { guidance }, route: 'operator', sleep: noSleep })).toEqual({ status: 'done' })
  expect(modes).toEqual(['live'])
  expect(((await event(id)).payload as { route?: string }).route).toBe('cloud_live')
})

test('a miss in the worker own replay mode fails the event as before, with one call and no retry', async () => {
  const calls: number[] = []
  const guidance: CloudJob = async (ctx) => {
    calls.push(1)
    await ask(ctx as never, 'miss with timeout 429 text')
  }
  const sleeps: number[] = []
  const id = await newEvent(s, 'observation.added', { childId: s.aminaId })
  const out = await runEvent(id, { db, env: { ...baseEnv, AI_MODE: 'replay' }, jobs: { guidance }, sleep: async (ms) => void sleeps.push(ms) })
  expect(out).toEqual({ status: 'failed' })
  expect(calls).toHaveLength(1)
  expect(sleeps).toEqual([])
  expect((await event(id)).error).toMatch(/^Replay miss: /)
})

test('with route operator the same miss in the worker own replay mode, after the operator pass, also fails once', async () => {
  const calls: (string | undefined)[] = []
  const guidance: CloudJob = async (ctx) => {
    calls.push(ctx.env.AI_MODE)
    await ask(ctx as never, 'still a miss')
  }
  const id = await newEvent(s, 'observation.added', { childId: s.aminaId })
  const out = await runEvent(id, { db, env: { ...baseEnv, AI_MODE: 'replay' }, jobs: { guidance }, route: 'operator', sleep: noSleep, now: farFuture })
  expect(out).toEqual({ status: 'failed' })
  expect(calls).toEqual(['replay', 'replay'])
})

test('a school that runs on a desktop is not routed: it keeps the old path', async () => {
  await online()
  const modes: (string | undefined)[] = []
  const guidance: CloudJob = async (ctx) => {
    modes.push(ctx.env.AI_MODE)
  }
  const id = await newEvent(desk, 'observation.added', { childId: desk.aminaId })
  expect(await runEvent(id, { db, env: baseEnv, jobs: { guidance }, route: 'operator', sleep: noSleep })).toEqual({ status: 'done' })
  expect(modes).toEqual(['live'])
})

// ---- the automatic rescue ----------------------------------------------------------------------------------------

test('checkOperatorTimeouts sends waiting and orphaned operator events back to the cloud, once', async () => {
  await db.from('events').delete().eq('school_id', s.schoolId).eq('payload->>route', 'operator') // left by the tests above
  const queued = await newEvent(s, 'observation.added', { childId: s.aminaId, route: 'operator' }, { runner: 'desktop' })
  const orphan = await newEvent(s, 'observation.added', { childId: s.aminaId, route: 'operator' }, { runner: 'desktop', status: 'running', claimed_by: null })
  const plainDesktop = await newEvent(desk, 'observation.added', { childId: desk.aminaId }, { runner: 'desktop' })
  const live = await newEvent(s, 'observation.added', { childId: s.aminaId, route: 'cloud_live' }, { runner: 'cloud' })
  const finished = await newEvent(s, 'observation.added', { childId: s.aminaId, route: 'operator' }, { runner: 'desktop', status: 'done' })
  const sent: string[] = []
  const enqueue = async (id: string) => void sent.push(id)
  const scope = [s.schoolId, desk.schoolId] // jemma-dev is shared: only this file's schools

  // 1. an operator was seen 30 seconds before the clock: nothing moves
  const clock = farFuture(4)
  await online(new Date(clock.getTime() - 30_000))
  expect(await checkOperatorTimeouts(db, enqueue, clock, scope)).toBe(0)
  expect(await event(queued)).toMatchObject({ runner: 'desktop', status: 'queued' })

  // 2. 91 seconds after that sighting no operator has been seen for 90 seconds: both events go back
  const later = new Date(clock.getTime() + 61_000)
  expect(await checkOperatorTimeouts(db, enqueue, later, scope)).toBe(2)
  for (const id of [queued, orphan]) {
    expect(await event(id)).toMatchObject({ runner: 'cloud', status: 'queued', claimed_by: null })
    expect((await event(id)).payload).toMatchObject({ route: 'cloud_live', type: 'observation.added' })
  }
  expect(sent.sort()).toEqual([queued, orphan].sort())
  expect(await event(plainDesktop)).toMatchObject({ runner: 'desktop', status: 'queued' })
  expect(await event(live)).toMatchObject({ runner: 'cloud', status: 'queued' })
  expect(await event(finished)).toMatchObject({ runner: 'desktop', status: 'done' })

  // 3. the same event is never rescued twice, and a cloud_live event is not handed off again
  sent.length = 0
  expect(await checkOperatorTimeouts(db, enqueue, later, scope)).toBe(0)
  expect(sent).toEqual([])
})

test('checkOperatorTimeouts keeps an event for the next minute when the queue refuses it', async () => {
  const id = await newEvent(s, 'observation.added', { childId: s.aminaId, route: 'operator' }, { runner: 'desktop' })
  let n = 0
  const enqueue = async (eventId: string) => {
    if (eventId === id && n++ === 0) throw new Error('queue down')
  }
  const scope = [s.schoolId]
  expect(await checkOperatorTimeouts(db, enqueue, farFuture(5), scope)).toBe(0)
  // the failed send put the event back as it was, so the next run sends it
  expect(n).toBe(1)
  expect(await event(id)).toMatchObject({ runner: 'desktop', status: 'queued' })
  expect((await event(id)).payload).toMatchObject({ route: 'operator' })
  expect(await checkOperatorTimeouts(db, enqueue, farFuture(5), scope)).toBe(1)
  expect(n).toBe(2)
  expect(await event(id)).toMatchObject({ runner: 'cloud', status: 'queued' })
  expect((await event(id)).payload).toMatchObject({ route: 'cloud_live' })
})
