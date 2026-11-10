import { env as rawEnv } from 'cloudflare:test'
import { ReplayMissError } from '@jemma/profiling/ai'
import { afterAll, beforeAll, expect, test, vi } from 'vitest'
import { createServiceClient } from '@jemma/profiling/db'
import type { Env } from '../src/index'
import { processEvent } from '../src/consumer'
import { createSandbox, type Sandbox } from '../../../packages/profiling/test/helpers/sandbox'

// AI_ROUTE=operator in the cloud consumer: recorded answers first, then the owner's laptop. Mocks only.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 })
const testEnv = rawEnv as unknown as Env
const base = { ...testEnv, AI_MODE: 'live', EVENTS_QUEUE: { send: vi.fn(async () => {}) } } as never as Env
const db = createServiceClient({ SUPABASE_URL: base.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: base.SUPABASE_SERVICE_ROLE_KEY })
const tag = `rt${Date.now()}`
const runners: string[] = []
let cloud: Sandbox

async function newEvent(extra: Record<string, unknown> = {}, payload: Record<string, unknown> = {}) {
  const { data, error } = await db
    .from('events')
    .insert({ school_id: cloud.schoolId, type: 'observation.added', payload: { type: 'observation.added', childId: cloud.aminaId, ...payload }, ...extra } as never)
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data.id
}
const row = async (id: string) => (await db.from('events').select('status, runner, payload, error').eq('id', id).single()).data!
const operatorOnline = async () => {
  const runner = crypto.randomUUID()
  runners.push(runner)
  const { error } = await db.from('operator_presence').insert({ runner_id: runner, agent: 'claude' })
  if (error) throw new Error(error.message)
}

beforeAll(async () => {
  cloud = await createSandbox(db, `${tag}c`)
  // A desktop event that stays running keeps this school busy, so an operator claiming in the shared database never takes our events.
  await db.from('events').insert({ school_id: cloud.schoolId, type: 'observation.added', payload: { type: 'observation.added', childId: cloud.aminaId }, runner: 'desktop', status: 'running' })
})
afterAll(async () => {
  if (runners.length) await db.from('operator_presence').delete().in('runner_id', runners)
  await cloud?.cleanup()
})

test('without AI_ROUTE the job sees the worker AI_MODE and nothing is routed', async () => {
  const modes: unknown[] = []
  const guidance = vi.fn(async (ctx: { env: { AI_MODE?: string } }) => void modes.push(ctx.env.AI_MODE))
  const id = await newEvent()
  await processEvent(base, id, { guidance: guidance as never })
  expect(modes).toEqual(['live'])
  expect((await row(id)).status).toBe('done')
})

test('with AI_ROUTE=operator and an operator online, a miss hands the event to the laptop', async () => {
  await operatorOnline()
  const modes: unknown[] = []
  const guidance = vi.fn(async (ctx: { env: { AI_MODE?: string } }) => {
    modes.push(ctx.env.AI_MODE)
    throw new ReplayMissError('c'.repeat(64), 'test: unrecorded')
  })
  const id = await newEvent()
  await processEvent({ ...base, AI_ROUTE: 'operator' } as Env, id, { guidance: guidance as never })
  expect(modes).toEqual(['replay'])
  expect(await row(id)).toMatchObject({ status: 'queued', runner: 'desktop', error: null })
  expect((await row(id)).payload).toMatchObject({ route: 'operator' })

  // a queue redelivery of the same event must not take it back from the laptop
  const again = vi.fn(async () => {})
  await processEvent({ ...base, AI_ROUTE: 'operator' } as Env, id, { guidance: again as never })
  expect(again).not.toHaveBeenCalled()
  expect(await row(id)).toMatchObject({ status: 'queued', runner: 'desktop' })
})

test('an event sent back to the cloud (cloud_live) runs with the worker AI_MODE', async () => {
  await operatorOnline()
  const modes: unknown[] = []
  const guidance = vi.fn(async (ctx: { env: { AI_MODE?: string } }) => void modes.push(ctx.env.AI_MODE))
  const id = await newEvent({}, { route: 'cloud_live' })
  await processEvent({ ...base, AI_ROUTE: 'operator' } as Env, id, { guidance: guidance as never })
  expect(modes).toEqual(['live'])
  expect((await row(id)).status).toBe('done')
})
