/**
 * Proof B of docs/proof/operator-path-2026-11-10.md: an event that misses is handed off while an operator "is online" (a presence row made by this
 * script), then no operator is there; checkOperatorTimeouts sends it back to the cloud as cloud_live; the event is cancelled
 * before any model runs. The enqueue given to checkOperatorTimeouts only records the id: nothing reaches the queue.
 * Needs the local agent worker (AI_ROUTE=operator, AI_ROUTE_TAG=<tag>, unrecorded model ids, AI_MODE=replay) at AGENT_URL, and AI_ROUTE_TAG=<tag> here too.
 */
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'
import { createServiceClient } from '@jemma/profiling/db'
import { checkOperatorTimeouts } from '@jemma/profiling/orchestrator'
import { createSandbox } from '../../profiling/test/helpers/sandbox'

const file = fileURLToPath(new URL('../../../.env.local', import.meta.url))
const env = { ...(existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {}), ...process.env } as Record<string, string>
const db = createServiceClient({ SUPABASE_URL: env.SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY! })
const agent = env.AGENT_URL!
const tag = env.AI_ROUTE_TAG || 'default' // the agent's AI_ROUTE_TAG
const show = (label: string, v: unknown) => console.log(`${label}: ${JSON.stringify(v)}`)
const row = async (id: string) => (await db.from('events').select('status, runner, claimed_by, attempts, error, payload').eq('id', id).single()).data!
const modelRows = async () => (await db.from('ai_replays').select('key', { count: 'exact', head: true }).neq('model', 'lock')).count

const sb = await createSandbox(db, `pb${Date.now()}`)
const runnerId = randomUUID()
try {
  const fresh = new Date(Date.now() - 90_000).toISOString()
  show('operator rows seen in the last 90 s (before)', (await db.from('operator_presence').select('runner_id').eq('tag', tag).gte('last_seen', fresh)).data!.length)
  const recordings = await modelRows()

  // An operator "is online" for the instant of the miss.
  await db.from('operator_presence').insert({ runner_id: runnerId, agent: 'claude', version: 'proof-b', tag })
  const ev = await db.from('events').insert({ school_id: sb.schoolId, type: 'observation.added', payload: { type: 'observation.added', childId: sb.aminaId } }).select('id').single()
  const id = ev.data!.id
  const post = await fetch(`${agent}/events`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-jemma-secret': env.EVENTS_SECRET! }, body: JSON.stringify({ eventId: id }) })
  show('POST /events', post.status)

  const end = Date.now() + 120_000
  while (Date.now() < end && (await row(id)).runner !== 'desktop') await new Promise((r) => setTimeout(r, 500))
  show('1. after the miss (SELECT)', await row(id))

  // The operator goes away.
  await db.from('operator_presence').delete().eq('runner_id', runnerId)
  show('operator rows seen in the last 90 s (now)', (await db.from('operator_presence').select('runner_id').eq('tag', tag).gte('last_seen', fresh)).data!.length)
  const sent: string[] = []
  const moved = await checkOperatorTimeouts(db, async (e) => void sent.push(e), new Date(), [sb.schoolId], tag)
  show('2. checkOperatorTimeouts returned', moved)
  show('   enqueue was asked for', sent)
  show('   after the rescue (SELECT)', await row(id))

  // Cancel before anything can run it.
  await db.from('events').update({ status: 'cancelled' }).eq('id', id).eq('status', 'queued')
  show('3. after the cancel (SELECT)', await row(id))
  show('   recorded model answers before and after', [recordings, await modelRows()])
} finally {
  await db.from('operator_presence').delete().eq('runner_id', runnerId)
  await sb.cleanup()
}
