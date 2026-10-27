import { env as rawEnv, createExecutionContext } from 'cloudflare:test'
import { afterAll, beforeAll, expect, test, vi } from 'vitest'
import { createServiceClient } from '@jemma/profiling/db'
import worker, { type Env } from '../src/index'
import { processEvent } from '../src/consumer'
import { createSandbox, type Sandbox } from '../../../packages/profiling/test/helpers/sandbox'

vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 })
const testEnv = rawEnv as unknown as Env
const env = { ...testEnv, EVENTS_SECRET: 'test-secret', EVENTS_QUEUE: { send: vi.fn(async () => {}) } } as never as Parameters<typeof processEvent>[0] & { EVENTS_QUEUE: Queue }
const db = createServiceClient({ SUPABASE_URL: env.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY })
const tag = `ev${Date.now()}`
let cloud: Sandbox
let desktop: Sandbox

async function newEvent(s: Sandbox, type: string, payload: Record<string, string>) {
  const { data, error } = await db
    .from('events')
    .insert({ school_id: s.schoolId, type, payload: { type, ...payload } })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data.id
}
const status = async (id: string) => (await db.from('events').select('status, runner, error').eq('id', id).single()).data!

beforeAll(async () => {
  cloud = await createSandbox(db, `${tag}c`)
  desktop = await createSandbox(db, `${tag}d`, 'desktop')
})
afterAll(async () => {
  await cloud?.cleanup()
  await desktop?.cleanup()
})

test('POST /events rejects a wrong secret', async () => {
  const send = (secret?: string) =>
    worker.fetch(
      new Request('http://agent/events', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(secret ? { 'x-jemma-secret': secret } : {}) },
        body: JSON.stringify({ eventId: crypto.randomUUID() }),
      }),
      env,
      createExecutionContext(),
    )
  expect((await send('wrong')).status).toBe(401)
  expect((await send()).status).toBe(401)
})

test('POST /events with the secret queues the event', async () => {
  const res = await worker.fetch(
    new Request('http://agent/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-jemma-secret': 'test-secret' },
      body: JSON.stringify({ eventId: '5b0f7d9e-1c43-4a8c-9a37-2f1c1a6f5e11' }),
    }),
    env,
    createExecutionContext(),
  )
  expect(res.status).toBe(202)
  expect(env.EVENTS_QUEUE.send).toHaveBeenCalledWith({ eventId: '5b0f7d9e-1c43-4a8c-9a37-2f1c1a6f5e11' })
})

test('an event runs its job plan', async () => {
  const id = await newEvent(cloud, 'observation.added', { childId: cloud.aminaId })
  const guidance = vi.fn(async (..._args: unknown[]) => {})
  await processEvent(env, id, { guidance })
  expect(guidance).toHaveBeenCalledTimes(1)
  expect(guidance.mock.calls[0]![2]).toEqual({ childId: cloud.aminaId })
  expect((await status(id)).status).toBe('done')
})

test('a job that is not built fails the event', async () => {
  const id = await newEvent(cloud, 'curriculum.uploaded', { mapId: cloud.mapId })
  await processEvent(env, id, {})
  expect(await status(id)).toMatchObject({ status: 'failed', error: 'job not available: draft_map' })
})

test('desktop school events wait for the runner', async () => {
  const id = await newEvent(desktop, 'observation.added', { childId: desktop.aminaId })
  const guidance = vi.fn(async (..._args: unknown[]) => {})
  await processEvent(env, id, { guidance })
  expect(guidance).not.toHaveBeenCalled()
  expect(await status(id)).toMatchObject({ status: 'queued', runner: 'desktop' })
})
