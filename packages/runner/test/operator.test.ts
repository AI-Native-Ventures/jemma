import { createHash, randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { MemoryStore } from '@jemma/profiling/ai'
import { createServiceClient, type Database, type JemmaDb } from '@jemma/profiling/db'
import { completeJob } from '../../profiling/src/tools/complete-job'
import { createSandbox, type Sandbox } from '../../profiling/test/helpers/sandbox'
import { formatJobLine, startOperator, type OperatorOptions, type RunnerJob, type RunResult } from '../src'
import { loadEnv } from './helpers'

// Operator runner. Part 1: the SQL rules of migration 0017 (operator_presence, operator_heartbeat, claim_operator_event,
// finish_operator_event). Part 2: the operator loop with a fake agent run. All in one file on purpose: the parts share
// sandboxes and must not run at the same time. Runs against jemma-dev. Every event and every runner here carries a routing
// tag made for this run, so nothing of anyone else's on the shared database can be seen or taken by these tests.

const env = loadEnv()
const db: JemmaDb = createServiceClient({ SUPABASE_URL: env.SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY! })
const tag = `op${Date.now()}`
const TAG = `t-${tag}`
const OTHER_TAG = `x-${tag}`
let cloud: Sandbox
let cloud2: Sandbox
let desk: Sandbox
const runners: string[] = []
let clock = 0

const beat = async (runner = randomUUID(), tagIn = TAG) => {
  const { error } = await db.rpc('operator_heartbeat', { runner, agent_in: 'claude', version_in: '9.9.9', tag_in: tagIn })
  expect(error).toBeNull()
  runners.push(runner)
  return runner
}

/** A handed-off event by default (route operator, this run's tag). `route: false` leaves the marker out, `tagged: false` the tag, `tag` sets another one. */
const queue = async (s: Sandbox, extra: { route?: boolean; tagged?: boolean; tag?: string; runner?: 'cloud' | 'desktop' } = {}) => {
  const created_at = new Date(Date.UTC(2000, 0, 1, 0, 0, clock++)).toISOString()
  const { data, error } = await db
    .from('events')
    .insert({
      school_id: s.schoolId,
      type: 'observation.added',
      payload: {
        type: 'observation.added',
        childId: s.aminaId,
        ...(extra.route === false ? {} : { route: 'operator' }),
        ...(extra.tagged === false ? {} : { route_tag: extra.tag ?? TAG }),
      },
      runner: extra.runner ?? 'desktop',
      created_at,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

const claim = async (runner: string, tagIn = TAG) => {
  const { data, error } = await db.rpc('claim_operator_event', { runner, tag_in: tagIn })
  if (error) throw new Error(error.message)
  return data?.[0] ?? null
}

const row = async (id: string) => (await db.from('events').select('status, runner, claimed_by, attempts, error, finished_at').eq('id', id).single()).data!

beforeAll(async () => {
  cloud = await createSandbox(db, `${tag}c`)
  cloud2 = await createSandbox(db, `${tag}d`)
  desk = await createSandbox(db, `${tag}a`, 'desktop')
})
afterAll(async () => {
  if (runners.length) await db.from('operator_presence').delete().in('runner_id', runners)
  await cloud?.cleanup()
  await cloud2?.cleanup()
  await desk?.cleanup()
})

test('operator_heartbeat upserts one presence row (with its tag) and moves last_seen', async () => {
  const runner = await beat()
  const first = (await db.from('operator_presence').select('*').eq('runner_id', runner).single()).data!
  expect(first).toMatchObject({ agent: 'claude', version: '9.9.9', tag: TAG })
  await new Promise((r) => setTimeout(r, 1100))
  const { error } = await db.rpc('operator_heartbeat', { runner, agent_in: 'codex', version_in: '1.0.0', tag_in: TAG })
  expect(error).toBeNull()
  const again = await db.from('operator_presence').select('*').eq('runner_id', runner)
  expect(again.data).toHaveLength(1)
  expect(again.data![0]).toMatchObject({ agent: 'codex', version: '1.0.0', tag: TAG })
  expect(new Date(again.data![0]!.last_seen).getTime()).toBeGreaterThan(new Date(first.last_seen).getTime())
  // a heartbeat with no tag is the default tag
  const plain = randomUUID()
  runners.push(plain)
  expect((await db.rpc('operator_heartbeat', { runner: plain, agent_in: 'claude', version_in: '1' })).error).toBeNull()
  expect((await db.from('operator_presence').select('tag').eq('runner_id', plain).single()).data!.tag).toBe('default')
})

test('claim_operator_event needs a presence row with the same tag', async () => {
  expect((await db.rpc('claim_operator_event', { runner: randomUUID(), tag_in: TAG })).error?.message).toMatch(/unknown runner/)
  const runner = await beat()
  expect((await db.rpc('claim_operator_event', { runner, tag_in: OTHER_TAG })).error?.message).toMatch(/unknown runner/)
})

test('a handed-off event (route operator) is claimed: running, attempts + 1, claimed_by left empty', async () => {
  const runner = await beat()
  const id = await queue(cloud)
  const got = await claim(runner)
  expect(got?.id).toBe(id)
  expect(await row(id)).toMatchObject({ status: 'running', runner: 'desktop', claimed_by: null, attempts: 1 })
  await db.rpc('finish_operator_event', { event: id, status_in: 'done', error_in: null as never })
})

test('a desktop event of a cloud school without the route marker is not an operator event', async () => {
  const runner = await beat()
  const id = await queue(cloud, { route: false })
  expect(await claim(runner)).toBeNull()
  expect(await row(id)).toMatchObject({ status: 'queued', attempts: 0 })
  await db.from('events').delete().eq('id', id)
})

test('a cloud event is never claimed, route marker or not', async () => {
  const runner = await beat()
  const id = await queue(cloud, { runner: 'cloud' })
  expect(await claim(runner)).toBeNull()
  expect((await row(id)).status).toBe('queued')
  await db.from('events').delete().eq('id', id)
})

test('an event already running or finished is not claimed again', async () => {
  const runner = await beat()
  const id = await queue(cloud)
  await db.from('events').update({ status: 'done' }).eq('id', id)
  expect(await claim(runner)).toBeNull()
  await db.from('events').delete().eq('id', id)
})

test('the events of a school that runs on a desktop are never claimed, marked or not, whatever the Desktop heartbeat', async () => {
  const runner = await beat()
  const plain = await queue(desk, { route: false, tagged: false })
  const marked = await queue(desk)
  expect(await claim(runner)).toBeNull()
  expect(await row(plain)).toMatchObject({ status: 'queued', attempts: 0 })
  expect(await row(marked)).toMatchObject({ status: 'queued', attempts: 0 })
  await db.from('events').delete().in('id', [plain, marked])
})

test('the routing tag keeps stacks apart: an event of another tag, or with no tag, is not seen', async () => {
  const mine = await beat()
  const theirs = await beat(randomUUID(), OTHER_TAG)
  const foreign = await queue(cloud, { tag: OTHER_TAG })
  const untagged = await queue(cloud, { tagged: false }) // counts as the default tag
  expect(await claim(mine)).toBeNull()
  expect(await row(foreign)).toMatchObject({ status: 'queued', attempts: 0 })
  expect(await row(untagged)).toMatchObject({ status: 'queued', attempts: 0 })
  // the runner of the other tag gets its own event and nothing of ours
  expect((await claim(theirs, OTHER_TAG))?.id).toBe(foreign)
  expect(await claim(theirs, OTHER_TAG)).toBeNull()
  expect(await row(untagged)).toMatchObject({ status: 'queued', attempts: 0 })
  await db.rpc('finish_operator_event', { event: foreign, status_in: 'done', error_in: null as never })
  await db.from('events').delete().eq('id', untagged)
})

test('one event per school at a time: the next one waits until the first is settled', async () => {
  const runner = await beat()
  const first = await queue(cloud2)
  const second = await queue(cloud2)
  expect((await claim(runner))?.id).toBe(first)
  expect(await claim(runner)).toBeNull() // the first still runs
  expect((await row(second)).status).toBe('queued')
  await db.rpc('finish_operator_event', { event: first, status_in: 'done', error_in: null as never })
  expect((await claim(runner))?.id).toBe(second)
  await db.rpc('finish_operator_event', { event: second, status_in: 'failed', error_in: 'x' })
})

test('two operators at once never get the same event, nor two events of one school', async () => {
  const [a, b] = [await beat(), await beat()]
  const one = await queue(cloud2)
  const [x, y] = await Promise.all([claim(a), claim(b)])
  expect([x, y].filter(Boolean)).toHaveLength(1)
  expect((x ?? y)!.id).toBe(one)
  await db.rpc('finish_operator_event', { event: one, status_in: 'done', error_in: null as never })

  // two events in one school: still one claim wins
  const p = await queue(cloud2)
  const q = await queue(cloud2)
  const both = await Promise.all([claim(a), claim(b), claim(a), claim(b)])
  expect(both.filter(Boolean)).toHaveLength(1)
  const running = await db.from('events').select('id').eq('school_id', cloud2.schoolId).eq('status', 'running')
  expect(running.data).toHaveLength(1)
  await db.from('events').delete().in('id', [p, q])
})

test('events of different schools run side by side, one each', async () => {
  const [a, b] = [await beat(), await beat()]
  const inTwo = await queue(cloud2)
  const inOne = await queue(cloud)
  const got: string[] = []
  for (let i = 0; i < 6 && got.length < 2; i++) {
    const [x, y] = await Promise.all([claim(a), claim(b)])
    got.push(...[x, y].filter((r) => r !== null).map((r) => r!.id))
  }
  expect(new Set(got)).toEqual(new Set([inTwo, inOne]))
  expect(got).toHaveLength(2)
  for (const id of got) await db.rpc('finish_operator_event', { event: id, status_in: 'done', error_in: null as never })
})

test('finish_operator_event settles an operator event only', async () => {
  const runner = await beat()
  const id = await queue(cloud)
  expect((await claim(runner))?.id).toBe(id)
  const failed = await db.rpc('finish_operator_event', { event: id, status_in: 'failed', error_in: 'it broke' })
  expect(failed.error).toBeNull()
  expect(await row(id)).toMatchObject({ status: 'failed', error: 'it broke' })
  expect((await row(id)).finished_at).not.toBeNull()
  const done = await db.rpc('finish_operator_event', { event: id, status_in: 'done', error_in: null as never })
  expect(done.error).toBeNull()
  expect(await row(id)).toMatchObject({ status: 'done', error: null })

  const bad = await db.rpc('finish_operator_event', { event: id, status_in: 'queued', error_in: null as never })
  expect(bad.error?.message).toMatch(/takes done or failed/)

  // not an operator event: claimed by a user's Desktop, or a cloud event, or cancelled
  const userClaimed = await queue(cloud)
  await db.from('events').update({ status: 'running', claimed_by: cloud.teacherId }).eq('id', userClaimed)
  const cloudRun = await queue(cloud, { runner: 'cloud', route: false })
  await db.from('events').update({ status: 'running' }).eq('id', cloudRun)
  const cancelled = await queue(cloud)
  await db.from('events').update({ status: 'cancelled' }).eq('id', cancelled)
  for (const e of [userClaimed, cloudRun, cancelled]) await db.rpc('finish_operator_event', { event: e, status_in: 'done', error_in: null as never })
  expect((await row(userClaimed)).status).toBe('running')
  expect((await row(cloudRun)).status).toBe('running')
  expect((await row(cancelled)).status).toBe('cancelled')
  await db.from('events').delete().in('id', [userClaimed, cloudRun, cancelled])
})

test('signed-in users and anonymous callers cannot run the three functions or read the table', async () => {
  const opts = { auth: { persistSession: false, autoRefreshToken: false } }
  const anon = createClient<Database>(env.SUPABASE_URL!, env.SUPABASE_ANON_KEY!, opts)
  const user = createClient<Database>(env.SUPABASE_URL!, env.SUPABASE_ANON_KEY!, opts)
  const signed = await user.auth.signInWithPassword({ email: `${tag}a-teacher@example.test`, password: `${tag}a-Passw0rd!` })
  expect(signed.error).toBeNull()
  const runner = await beat()
  const id = await queue(cloud)
  for (const client of [anon, user]) {
    const calls = [
      await client.rpc('operator_heartbeat', { runner: randomUUID(), agent_in: 'x', version_in: 'y', tag_in: TAG }),
      await client.rpc('claim_operator_event', { runner, tag_in: TAG }),
      await client.rpc('finish_operator_event', { event: id, status_in: 'done', error_in: null as never }),
    ]
    for (const res of calls) {
      expect(res.error, 'the call must be refused').not.toBeNull()
      expect(res.error?.message).toMatch(/permission denied/i)
    }
    expect((await client.from('operator_presence').select('runner_id')).error).not.toBeNull()
  }
  expect((await row(id)).status).toBe('queued') // untouched
  await db.from('events').delete().eq('id', id)
})


// ---- Part 2: the operator loop with a fake agent run -------------------------------------------------------------------

const TOPIC = 'Adding fractions with different denominators'
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')
let loopS: Sandbox
let loopS2: Sandbox
let loopD: Sandbox
let parentId: string

beforeAll(async () => {
  loopS = await createSandbox(db, `${tag}ls`)
  loopS2 = await createSandbox(db, `${tag}l2`)
  loopD = await createSandbox(db, `${tag}ld`, 'desktop')
  const p = await db.auth.admin.createUser({ email: `${tag}-parent@example.test`, password: `${tag}-Passw0rd!`, email_confirm: true })
  if (p.error) throw p.error
  parentId = p.data.user.id
  await db.from('profiles').insert({ user_id: parentId, role: 'parent', display_name: 'Thandi M', school_id: loopS.schoolId })
  await db.from('parent_links').insert({ parent_id: parentId, child_id: loopS.aminaId, class_id: loopS.classId, status: 'approved' })
})
afterAll(async () => {
  await loopS?.cleanup()
  await loopS2?.cleanup()
  await loopD?.cleanup()
  if (parentId) await db.auth.admin.deleteUser(parentId)
})

const queueOp = async (s: Sandbox, type: string, payload: Record<string, string>, extra: { route?: boolean } = { route: true }) => {
  const created_at = new Date(Date.UTC(2000, 1, 1, 0, 0, clock++)).toISOString()
  const { data, error } = await db
    .from('events')
    .insert({ school_id: s.schoolId, type, payload: { type, ...payload, ...(extra.route ? { route: 'operator', route_tag: TAG } : {}) }, runner: 'desktop', created_at } as never)
    .select('id')
    .single()
  if (error) throw error
  return data.id
}
const settled = async (id: string, ms = 60_000) => {
  const end = Date.now() + ms
  for (;;) {
    const r = (await db.from('events').select('status, error, runner, claimed_by, finished_at').eq('id', id).single()).data!
    if (r.status === 'done' || r.status === 'failed') return r
    if (Date.now() > end) throw new Error(`event ${id} did not settle: ${r.status}`)
    await new Promise((res) => setTimeout(res, 100))
  }
}
const waitFor = async (what: string, fn: () => Promise<boolean>, ms = 30_000) => {
  const end = Date.now() + ms
  while (!(await fn())) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`)
    await new Promise((res) => setTimeout(res, 50))
  }
}
const presenceRow = async (runnerId: string) => (await db.from('operator_presence').select('agent, version, tag, last_seen').eq('runner_id', runnerId).maybeSingle()).data
const tokenRows = async (token: string) => (await db.from('mcp_tokens').select('school_id, label').eq('token_hash', sha256(token))).data!
/** The event is settled first and its token deleted right after (a `finally`), so wait for the deletion. */
const tokenGone = (token: string) => waitFor('the one-time token to be deleted', async () => (await tokenRows(token)).length === 0, 10_000)

type Call = { job: string; ids: Record<string, string>; eventId: string; token: string; url: string; tokenRow: { school_id: string | null; label: string } | null }
const writes: Record<string, (ids: Record<string, string>, eventId: string) => Promise<void>> = {
  diagnose: async (ids) => void (await db.from('gaps').insert({ child_id: ids.childId!, topic_name: TOPIC, stage: 'new' })),
  class_report: async (ids) => void (await db.from('reteach_plans').insert({ class_id: ids.classId!, test_id: ids.testId!, topic_name: 'Fractions', content: {} })),
  write_lesson: async (ids) => {
    const sess = await db.from('sessions').select('lesson_id').eq('child_id', ids.childId!).eq('status', 'planned').single()
    await db.from('lessons').update({ content: { questions: [{ n: 1 }] } }).eq('id', sess.data!.lesson_id!)
  },
}

/** A fake agent run: it records the call, the engine and the token it was given, then does what the real job would write. */
function fakeAgent(opts: { writes?: Partial<typeof writes>; hold?: (call: Call) => Promise<void>; fail?: (call: Call) => RunResult | undefined } = {}) {
  const calls: Call[] = []
  const engines: unknown[] = []
  const run = async (job: RunnerJob, engine: unknown, mcp: { url: string; token: string }): Promise<RunResult> => {
    engines.push(engine)
    const name = /^Job: (\w+)$/m.exec(job.prompt)![1]!
    const ids = JSON.parse(/^Ids: (.*)$/m.exec(job.prompt)![1]!) as Record<string, string>
    const call: Call = { job: name, ids, eventId: job.eventId, token: mcp.token, url: mcp.url, tokenRow: (await tokenRows(mcp.token))[0] ?? null }
    calls.push(call)
    await opts.hold?.(call)
    const failed = opts.fail?.(call)
    if (failed) return failed
    await (opts.writes?.[name] ?? writes[name])?.(ids, job.eventId)
    return { status: 'done', note: 'fake done' }
  }
  return { calls, engines, run: run as unknown as NonNullable<OperatorOptions['run']> }
}

const fakeDetect = async () => ({
  claude: { installed: true, version: '1.2.3', signedIn: true as const },
  codex: { installed: false, version: null, signedIn: false as const },
})

const operate = (extra: Partial<OperatorOptions>) => {
  const lines: string[] = []
  const runnerId = randomUUID()
  runners.push(runnerId)
  const op = startOperator({ db, runnerId, agent: 'claude', agentUrl: 'https://agent.example.test/', concurrency: 1, pollMs: 200, heartbeatMs: 10_000, detect: fakeDetect, tag: TAG, onLog: (l) => lines.push(l), ...extra })
  return { op, lines, runnerId }
}

test('operator loop: one-time token for the school, one agent run, settled done, token deleted, presence removed on stop', async () => {
  const id = await queueOp(loopS, 'observation.added', { childId: loopS.aminaId })
  const agent = fakeAgent()
  const { op, lines, runnerId } = operate({ run: agent.run })
  try {
    const row = await settled(id)
    expect(row).toMatchObject({ status: 'done', error: null, claimed_by: null, runner: 'desktop' })
    expect(row.finished_at).not.toBeNull()
    expect(agent.calls).toHaveLength(1)
    const call = agent.calls[0]!
    expect(call).toMatchObject({ job: 'guidance', eventId: id, url: 'https://agent.example.test/mcp' })
    expect(call.token).toMatch(/^[0-9a-f]{64}$/) // 32 random bytes as hex
    expect(call.tokenRow?.school_id).toBe(loopS.schoolId) // a school token, while the job ran
    expect(call.tokenRow?.label).toMatch(/^operator /)
    await tokenGone(call.token) // deleted once the event ended
    expect(lines.some((l) => /^\d\d:\d\d:\d\d {2}observation\.added {2}guidance {2}\d+s {2}done$/.test(l))).toBe(true)
    expect(await presenceRow(runnerId)).toMatchObject({ agent: 'claude', version: '1.2.3' })
  } finally {
    await op.stop()
  }
  expect(await presenceRow(runnerId)).toBeNull()
})

test('operator loop: with agent goose the run gets the engine goose and the presence row says goose', async () => {
  const id = await queueOp(loopS, 'observation.added', { childId: loopS.aminaId })
  const agent = fakeAgent()
  const { op, runnerId } = operate({ run: agent.run, agent: 'goose' })
  try {
    expect(await settled(id)).toMatchObject({ status: 'done', error: null })
    expect(agent.engines).toEqual(['goose'])
    expect(await presenceRow(runnerId)).toMatchObject({ agent: 'goose' })
    await tokenGone(agent.calls[0]!.token)
  } finally {
    await op.stop()
  }
  expect(await presenceRow(runnerId)).toBeNull()
})

test('operator loop: every event gets its own token, and a job that throws fails the event and still deletes the token', async () => {
  const ok = await queueOp(loopS, 'observation.added', { childId: loopS.aminaId })
  const bad = await queueOp(loopS2, 'observation.added', { childId: loopS2.aminaId })
  const agent = fakeAgent({
    hold: async (call) => {
      if (call.eventId === bad) throw new Error('the agent crashed')
    },
  })
  const { op } = operate({ run: agent.run, concurrency: 2 })
  try {
    expect((await settled(ok)).status).toBe('done')
    expect(await settled(bad)).toMatchObject({ status: 'failed', error: 'the agent crashed' })
    const tokens = agent.calls.map((c) => c.token)
    expect(new Set(tokens).size).toBe(2)
    for (const t of tokens) await tokenGone(t)
    expect(agent.calls.find((c) => c.eventId === bad)?.tokenRow?.school_id).toBe(loopS2.schoolId)
  } finally {
    await op.stop()
  }
})

test('operator loop: a failed agent run fails the event with its note', async () => {
  const id = await queueOp(loopS, 'observation.added', { childId: loopS.aminaId })
  const agent = fakeAgent({ fail: () => ({ status: 'failed', note: 'I looked and stopped.' }) })
  const { op, lines } = operate({ run: agent.run })
  try {
    expect(await settled(id)).toMatchObject({ status: 'failed', error: 'guidance: I looked and stopped.' })
    expect(lines.some((l) => /guidance {2}\d+s {2}failed {2}\(I looked and stopped\.\)$/.test(l))).toBe(true)
  } finally {
    await op.stop()
  }
})

test('operator loop: a whole paper event, plain-code steps in process, lesson-ready and Needs you told like the cloud', async () => {
  const id = await queueOp(loopS, 'paper.snapped', { paperId: loopS.paperId })
  const agent = fakeAgent({
    writes: {
      // a Needs you item made by a job is announced to the owner after the step
      guidance: async (ids) => {
        if (ids.childId !== loopS.aminaId) return
        await db.from('needs_you_items').insert({ owner_id: loopS.teacherId, school_id: loopS.schoolId, kind: 'check_answer', ref_id: loopS.paperId, status: 'open', title: 'Check one answer', detail: 'Amina question 2' })
      },
    },
  })
  const { op } = operate({ run: agent.run })
  try {
    expect(await settled(id, 90_000)).toMatchObject({ status: 'done', error: null })
    // the two plan_next_session steps ran in this process: no agent run, no token for them
    expect(agent.calls.map((c) => c.job)).toEqual(['diagnose', 'diagnose', 'class_report', 'write_lesson', 'guidance', 'write_lesson', 'guidance'])
    const sessions = await db.from('sessions').select('child_id').eq('status', 'planned').in('child_id', [loopS.aminaId, loopS.thaboId])
    expect(sessions.data).toHaveLength(2)
    expect((await db.from('reteach_plans').select('id').eq('test_id', loopS.testId)).data).toHaveLength(1)
    const lesson = await db.from('notifications').select('title, href').eq('user_id', parentId)
    expect(lesson.data).toEqual([{ title: "Tonight's lesson is ready", href: `/p/${loopS.aminaId}` }])
    const need = await db.from('notifications').select('title').eq('user_id', loopS.teacherId)
    expect(need.data).toEqual([{ title: 'Check one answer' }])
  } finally {
    await op.stop()
  }
})

test('operator loop: the real complete_job tool does not settle the event between steps; the operator settles it at the end', async () => {
  await db.from('reteach_plans').delete().eq('test_id', loopS.testId)
  const id = await queueOp(loopS, 'paper.snapped', { paperId: loopS.paperId })
  const seen: { job: string; status: string | undefined; finishedAt: string | null | undefined }[] = []
  const agent = fakeAgent({
    hold: async (call) => {
      // what the agent does at the end of every step, through the real tool
      const ctx = { db, schoolId: loopS.schoolId, eventId: call.eventId, env: { replayStore: new MemoryStore() }, now: () => new Date() }
      expect(await completeJob.run(ctx, { eventId: call.eventId, status: 'done' })).toEqual({ ok: true })
      const row = (await db.from('events').select('status, finished_at').eq('id', call.eventId).single()).data
      seen.push({ job: call.job, status: row?.status, finishedAt: row?.finished_at })
    },
  })
  const { op } = operate({ run: agent.run })
  try {
    await waitFor('all seven agent steps', async () => seen.length >= 7, 120_000)
    for (const s of seen) expect(s, `${s.job}: the event must still be running after complete_job`).toMatchObject({ status: 'running', finishedAt: null })
    await waitFor('the event to settle', async () => (await db.from('events').select('status').eq('id', id).single()).data?.status === 'done', 60_000)
    expect((await row(id)).finished_at).not.toBeNull()
  } finally {
    await op.stop()
  }
})

test('operator loop: unmet postconditions fail the event with the cloud message', async () => {
  await db.from('reteach_plans').delete().eq('test_id', loopS.testId)
  const id = await queueOp(loopS, 'paper.snapped', { paperId: loopS.paperId })
  const agent = fakeAgent({ writes: { class_report: async () => {} } }) // the class report is never saved
  const { op } = operate({ run: agent.run })
  try {
    const row = await settled(id, 90_000)
    expect(row.status).toBe('failed')
    expect(row.error).toBe(`Jemma did not finish: no reteach plan for test ${loopS.testId}`)
  } finally {
    await op.stop()
  }
})

test('operator loop: with two claim loops two schools run side by side, one event per school at a time', async () => {
  const a1 = await queueOp(loopS, 'observation.added', { childId: loopS.aminaId })
  const a2 = await queueOp(loopS, 'observation.added', { childId: loopS.thaboId })
  const b = await queueOp(loopS2, 'observation.added', { childId: loopS2.aminaId })
  let release: () => void = () => {}
  const gate = new Promise<void>((r) => (release = r))
  let active = 0
  let most = 0
  const order: string[] = []
  const agent = fakeAgent({
    hold: async (call) => {
      order.push(`start ${call.eventId}`)
      most = Math.max(most, ++active)
      await gate
      active--
      order.push(`end ${call.eventId}`)
    },
  })
  const { op } = operate({ run: agent.run, concurrency: 2 })
  try {
    await waitFor('two jobs running at once', async () => active === 2)
    await new Promise((r) => setTimeout(r, 1000)) // the second event of the school would have started by now
    expect(active).toBe(2)
    expect((await db.from('events').select('status').eq('id', a2).single()).data!.status).toBe('queued')
    release()
    for (const id of [a1, a2, b]) expect((await settled(id)).status).toBe('done')
    expect(most).toBe(2)
    expect(order.indexOf(`end ${a1}`)).toBeLessThan(order.indexOf(`start ${a2}`)) // the school's events ran one after the other
  } finally {
    release()
    await op.stop()
  }
})

test('operator loop: stop takes the presence row away at once, claims nothing new, and lets the running job finish', async () => {
  const running = await queueOp(loopS, 'observation.added', { childId: loopS.aminaId })
  let release: () => void = () => {}
  const gate = new Promise<void>((r) => (release = r))
  let started = false
  const agent = fakeAgent({
    hold: async () => {
      started = true
      await gate
    },
  })
  const { op, runnerId, lines } = operate({ run: agent.run })
  try {
    await waitFor('the job to start', async () => started)
    const stopping = op.stop()
    await waitFor('the presence row to go', async () => (await presenceRow(runnerId)) === null)
    const later = await queueOp(loopS2, 'observation.added', { childId: loopS2.aminaId })
    await new Promise((r) => setTimeout(r, 800))
    expect((await db.from('events').select('status').eq('id', later).single()).data!.status).toBe('queued') // no new claim
    expect((await db.from('events').select('status').eq('id', running).single()).data!.status).toBe('running') // still running
    release()
    await stopping
    expect((await settled(running)).status).toBe('done')
    await tokenGone(agent.calls[0]!.token)
    expect(await presenceRow(runnerId)).toBeNull()
    expect(lines.at(-1)).toBe('operator stopped')
    await db.from('events').delete().eq('id', later)
  } finally {
    release()
    await op.stop()
  }
})

test('operator loop: maxJobs stops it after that many agent runs and the next step does not run', async () => {
  const id = await queueOp(loopS, 'paper.snapped', { paperId: loopS.paperId })
  const agent = fakeAgent()
  const { op, runnerId } = operate({ run: agent.run, maxJobs: 1 })
  try {
    const row = await settled(id)
    expect(row.status).toBe('failed')
    expect(row.error).toMatch(/^diagnose: the limit of 1 agent runs was reached/)
    expect(agent.calls).toHaveLength(1)
    expect(op.jobsStarted()).toBe(1)
    await waitFor('the operator to leave', async () => (await presenceRow(runnerId)) === null)
  } finally {
    await op.stop()
  }
})

test('operator loop: events of a desktop school, and handed-off events of another tag, are never served', async () => {
  const desktopEvent = await queueOp(loopD, 'observation.added', { childId: loopD.aminaId }, { route: false })
  const markedDesktop = await queueOp(loopD, 'observation.added', { childId: loopD.aminaId })
  const otherTag = await queueOp(loopS2, 'observation.added', { childId: loopS2.aminaId })
  await db.from('events').update({ payload: { type: 'observation.added', childId: loopS2.aminaId, route: 'operator', route_tag: OTHER_TAG } }).eq('id', otherTag)
  const handoff = await queueOp(loopS, 'observation.added', { childId: loopS.aminaId })
  const agent = fakeAgent()
  const { op, lines } = operate({ run: agent.run })
  try {
    expect((await settled(handoff)).status).toBe('done')
    await new Promise((r) => setTimeout(r, 1200))
    expect(agent.calls.map((c) => c.eventId)).toEqual([handoff])
    for (const id of [desktopEvent, markedDesktop, otherTag]) {
      expect((await db.from('events').select('status, attempts, claimed_by').eq('id', id).single()).data).toEqual({ status: 'queued', attempts: 0, claimed_by: null })
    }
    expect(lines.some((l) => l.endsWith(`tag ${TAG}`))).toBe(true)
  } finally {
    await op.stop()
  }
  await db.from('events').delete().in('id', [desktopEvent, markedDesktop, otherTag])
})

test('operator loop: the heartbeat keeps last_seen fresh', async () => {
  const { op, runnerId } = operate({ run: fakeAgent().run, heartbeatMs: 300 })
  try {
    const first = await (async () => {
      await waitFor('presence', async () => (await presenceRow(runnerId)) !== null)
      return (await presenceRow(runnerId))!
    })()
    await waitFor('a later beat', async () => new Date((await presenceRow(runnerId))!.last_seen).getTime() > new Date(first.last_seen).getTime() + 400)
  } finally {
    await op.stop()
  }
})

test('formatJobLine: time, event type, job, seconds, done or failed', () => {
  const at = new Date(2026, 10, 10, 9, 5, 7)
  const event = { id: 'e', school_id: 's', type: 'paper.snapped', payload: {}, attempts: 1 }
  const step = { job: 'read_paper' as const, ids: {} }
  expect(formatJobLine({ event, step, seconds: 41.4, status: 'done', note: 'ok' }, at)).toBe('09:05:07  paper.snapped  read_paper  41s  done')
  expect(formatJobLine({ event, step, seconds: 0.2, status: 'failed', note: 'it   broke\nbadly' }, at)).toBe('09:05:07  paper.snapped  read_paper  0s  failed  (it broke badly)')
})
