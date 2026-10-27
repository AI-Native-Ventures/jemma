import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { createServiceClient, type Database, type JemmaDb } from '@jemma/profiling/db'
import { claimEvent, startRunner } from '../src'
import { createSandbox, type Sandbox } from '../../profiling/test/helpers/sandbox'
import { loadEnv, newLog, readLog, useFakes } from './helpers'

const env = loadEnv()
const db: JemmaDb = createServiceClient({ SUPABASE_URL: env.SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY! })
const tag = `rn${Date.now()}`
const mcp = { url: 'https://agent.example.test/mcp', token: 'tok' }
let mine: Sandbox
let other: Sandbox
let user: JemmaDb
let restore: () => void

const queue = async (schoolId: string) => {
  const { data, error } = await db
    .from('events')
    .insert({ school_id: schoolId, type: 'observation.added', payload: { childId: randomUUID() }, runner: 'desktop' })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}
const presence = async (runnerId: string) => {
  const { data } = await db.from('runner_presence').select('*').eq('runner_id', runnerId).maybeSingle()
  return data
}
const until = async <T>(fn: () => Promise<T | null | undefined | false>, ms = 20_000): Promise<T> => {
  const end = Date.now() + ms
  for (;;) {
    const v = await fn()
    if (v) return v
    if (Date.now() > end) throw new Error('timed out waiting')
    await new Promise((r) => setTimeout(r, 150))
  }
}

beforeAll(async () => {
  restore = useFakes()
  mine = await createSandbox(db, tag, 'desktop')
  other = await createSandbox(db, `${tag}o`, 'desktop')
  user = createClient<Database>(env.SUPABASE_URL!, env.SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
  const signed = await user.auth.signInWithPassword({ email: `${tag}-teacher@example.test`, password: `${tag}-Passw0rd!` })
  if (signed.error) throw signed.error
})
afterAll(async () => {
  restore?.()
  await db.from('runner_presence').delete().eq('user_id', mine.teacherId)
  await mine?.cleanup()
  await other?.cleanup()
})

test('heartbeat keeps runner_presence fresh', async () => {
  const runnerId = randomUUID()
  const fakeDetect = async () => ({
    claude: { installed: true, version: '1.0.0', signedIn: true as const },
    codex: { installed: false, version: null, signedIn: false as const },
  })
  const runner = startRunner({ supabase: user, runnerId, agent: 'claude', mcp, heartbeatMs: 250, pollMs: 10_000, detect: fakeDetect })
  try {
    const first = await until(() => presence(runnerId))
    expect(first.user_id).toBe(mine.teacherId)
    expect(first.chosen).toBe('claude')
    expect((first.agents as any).claude.version).toBe('1.0.0')
    await until(async () => {
      const now = await presence(runnerId)
      return now && new Date(now.last_seen).getTime() > new Date(first.last_seen).getTime() + 400
    })
  } finally {
    runner.stop()
  }
})

test('two runners never claim the same event', async () => {
  const a = randomUUID()
  const b = randomUUID()
  for (const id of [a, b]) {
    const { error } = await user.rpc('heartbeat', { runner: id, agents_in: {}, chosen_in: 'claude' })
    expect(error).toBeNull()
  }
  const mineId = await queue(mine.schoolId)
  const otherId = await queue(other.schoolId)

  const [x, y] = await Promise.all([claimEvent(user, a), claimEvent(user, b)])
  const got = [x, y].filter(Boolean)
  expect(got).toHaveLength(1)
  expect(got[0]!.id).toBe(mineId)

  // nothing left in this school; the other school's event is not visible to this user
  expect(await claimEvent(user, a)).toBeNull()
  const row = await db.from('events').select('status, claimed_by').eq('id', otherId).single()
  expect(row.data).toEqual({ status: 'queued', claimed_by: null })
  const claimed = await db.from('events').select('status, claimed_by, attempts').eq('id', mineId).single()
  expect(claimed.data).toEqual({ status: 'running', claimed_by: mine.teacherId, attempts: 1 })
})

test('a runner runs a claimed event through its plan and settles it', async () => {
  const log = newLog()
  process.env.FAKE_MODE = 'done'
  const id = await queue(mine.schoolId)
  const runnerId = randomUUID()
  const runner = startRunner({
    supabase: user,
    runnerId,
    agent: 'claude',
    mcp,
    heartbeatMs: 10_000,
    pollMs: 200,
    plan: async () => [{ job: 'guidance', ids: { childId: 'c1' } }, { job: 'plan_next_session', ids: { childId: 'c1' } }],
    loadPrompt: async (job) => (job === 'guidance' ? 'GUIDANCE PROMPT' : null),
  })
  try {
    const row = await until(async () => {
      const r = await db.from('events').select('status, error, finished_at').eq('id', id).single()
      return r.data && (r.data.status === 'done' || r.data.status === 'failed') ? r.data : null
    })
    expect(row.status).toBe('done')
    expect(row.error).toBeNull()
    expect(row.finished_at).not.toBeNull()
    const calls = readLog(log).filter((l) => l.bin === 'claude' && l.stdin)
    expect(calls).toHaveLength(2)
    expect(calls[0]!.stdin).toContain('GUIDANCE PROMPT')
    expect(calls[0]!.stdin).toContain(`event ${id}`)
    expect(calls[1]!.stdin).toContain('Call the MCP tool `plan_next_session`')
  } finally {
    runner.stop()
  }
})

test('a failed job fails the event with its note', async () => {
  newLog()
  process.env.FAKE_MODE = 'silent'
  const id = await queue(mine.schoolId)
  const runner = startRunner({
    supabase: user,
    runnerId: randomUUID(),
    agent: 'codex',
    mcp,
    heartbeatMs: 10_000,
    pollMs: 200,
    plan: async () => [{ job: 'guidance', ids: { childId: 'c1' } }],
  })
  try {
    const row = await until(async () => {
      const r = await db.from('events').select('status, error').eq('id', id).single()
      return r.data && (r.data.status === 'done' || r.data.status === 'failed') ? r.data : null
    })
    expect(row.status).toBe('failed')
    expect(row.error).toBe('guidance: I looked and stopped.')
  } finally {
    runner.stop()
  }
})
