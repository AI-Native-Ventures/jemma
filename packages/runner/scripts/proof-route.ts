/**
 * Proof of the routing rules of docs/proof/operator-path-2026-11-10.md on a live stack. Needs the local agent worker
 * (AI_ROUTE=operator, AI_ROUTE_TAG=<tag>, unrecorded model ids, AI_MODE=replay) at AGENT_URL and a real operator running with
 * OPERATOR_TAG=<tag>; AI_ROUTE_TAG=<tag> here too. It makes one cloud sandbox and
 *   1. posts a curriculum.uploaded event: draft_map must NOT be handed off although an operator is online (it fails on the
 *      cloud model's replay miss, no agent run),
 *   2. makes a hand-off of ANOTHER tag: the operator must leave it alone,
 *   3. posts an observation.added event: its miss is handed off, the operator runs the guidance job with Claude, and it is settled.
 */
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'
import { createServiceClient } from '@jemma/profiling/db'
import { createSandbox } from '../../profiling/test/helpers/sandbox'

const file = fileURLToPath(new URL('../../../.env.local', import.meta.url))
const env = { ...(existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {}), ...process.env } as Record<string, string>
const db = createServiceClient({ SUPABASE_URL: env.SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY! })
const agent = env.AGENT_URL!
const tag = env.AI_ROUTE_TAG!
if (!tag || tag === 'default') throw new Error('set AI_ROUTE_TAG to a tag of your own')
const show = (label: string, v: unknown) => console.log(`${label}: ${JSON.stringify(v)}`)
const row = async (id: string) => (await db.from('events').select('status, runner, claimed_by, attempts, error, payload').eq('id', id).single()).data!
const post = (eventId: string) => fetch(`${agent}/events`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-jemma-secret': env.EVENTS_SECRET! }, body: JSON.stringify({ eventId }) })
const until = async (what: string, fn: () => Promise<boolean>, ms = 180_000) => {
  const end = Date.now() + ms
  while (!(await fn())) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`)
    await new Promise((r) => setTimeout(r, 1000))
  }
}

const sb = await createSandbox(db, `pr${Date.now()}`)
try {
  const fresh = new Date(Date.now() - 90_000).toISOString()
  show('operators of this tag seen in the last 90 s', (await db.from('operator_presence').select('agent, version, tag').eq('tag', tag).gte('last_seen', fresh)).data)

  // 1. draft_map is never handed off
  const draft = (await db.from('events').insert({ school_id: sb.schoolId, type: 'curriculum.uploaded', payload: { type: 'curriculum.uploaded', mapId: sb.mapId } }).select('id').single()).data!.id
  show('POST /events (draft_map)', (await post(draft)).status)
  await until('the draft_map event to settle', async () => ['done', 'failed'].includes((await row(draft)).status))
  const d = await row(draft)
  show('1. draft_map event (SELECT)', { status: d.status, runner: d.runner, route: (d.payload as { route?: string }).route ?? null, error: (d.error ?? '').slice(0, 60) })

  // 2. a hand-off of another tag is left alone
  const decoy = (await db.from('events').insert({ school_id: sb.schoolId, type: 'observation.added', runner: 'desktop', payload: { type: 'observation.added', childId: sb.aminaId, route: 'operator', route_tag: `other-${tag}` } }).select('id').single()).data!.id
  await new Promise((r) => setTimeout(r, 12_000))
  show('2. hand-off of another tag after 12 s (SELECT)', await row(decoy))
  await db.from('events').update({ status: 'cancelled' }).eq('id', decoy)

  // 3. a real hand-off, run by Claude
  const since = new Date().toISOString()
  const guidance = (await db.from('events').insert({ school_id: sb.schoolId, type: 'observation.added', payload: { type: 'observation.added', childId: sb.aminaId } }).select('id').single()).data!.id
  show('POST /events (guidance)', (await post(guidance)).status)
  await until('the guidance event to settle for good', async () => {
    const r = await row(guidance)
    if (r.status !== 'done' && r.status !== 'failed') return false
    if (r.runner !== 'desktop') return r.status === 'failed'
    await new Promise((res) => setTimeout(res, 3000)) // complete_job marks done after each step: only a done that stays done is final
    return (await row(guidance)).status === r.status
  })
  const g = await row(guidance)
  show('3. guidance event (SELECT)', { status: g.status, runner: g.runner, claimed_by: g.claimed_by, error: g.error, payload: g.payload })
  show('   activity_log lines from the tools', (await db.from('activity_log').select('tool, text').eq('school_id', sb.schoolId).gte('at', since)).data?.map((l) => `${l.tool}: ${l.text}`.slice(0, 120)))
  show('   one-time tokens left for this school', (await db.from('mcp_tokens').select('label').eq('school_id', sb.schoolId)).data)
} finally {
  await sb.cleanup()
}
