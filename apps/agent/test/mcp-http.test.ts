import { env as rawEnv, createExecutionContext } from 'cloudflare:test'
import { afterAll, beforeAll, expect, test, vi } from 'vitest'
import { createServiceClient } from '@jemma/profiling/db'
import worker, { type Env } from '../src/index'
import { sha256Hex } from '../src/auth'
import { createSandbox, type Sandbox } from '../../../packages/profiling/test/helpers/sandbox'

vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 })
const testEnv = rawEnv as unknown as Env
const env = testEnv as never as Parameters<typeof worker.fetch>[1]
const db = createServiceClient({ SUPABASE_URL: testEnv.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: testEnv.SUPABASE_SERVICE_ROLE_KEY })
const tag = `mh${Date.now()}`
let s: Sandbox
const schoolToken = `school-${tag}`
const userToken = `user-${tag}`

beforeAll(async () => {
  s = await createSandbox(db, tag)
  await db.from('mcp_tokens').insert({ token_hash: await sha256Hex(schoolToken), school_id: s.schoolId, label: 'test school' })
  await db.from('mcp_tokens').insert({ token_hash: await sha256Hex(userToken), user_id: s.teacherId, label: 'test teacher' })
})
afterAll(async () => {
  await db.from('mcp_tokens').delete().in('token_hash', [await sha256Hex(schoolToken), await sha256Hex(userToken)])
  await s?.cleanup()
})

const rpc = (token: string | null, body: unknown, session?: string) =>
  worker.fetch(
    new Request('http://agent/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(session ? { 'mcp-session-id': session } : {}),
      },
      body: JSON.stringify(body),
    }),
    env,
    createExecutionContext(),
  )
const init = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } } }

test('/mcp without a valid token is 401', async () => {
  expect((await rpc(null, init)).status).toBe(401)
  expect((await rpc('nope', init)).status).toBe(401)
})

test.each([['school', schoolToken], ['user', userToken]])('/mcp with a %s token lists tools', async (_n, token) => {
  const res = await rpc(token, init)
  expect(res.status).toBe(200)
  const session = res.headers.get('mcp-session-id') ?? undefined
  await res.text()
  await rpc(token, { jsonrpc: '2.0', method: 'notifications/initialized' }, session)
  const list = await rpc(token, { jsonrpc: '2.0', id: 2, method: 'tools/list' }, session)
  expect(await list.text()).toContain('get_learner_profile')
})
