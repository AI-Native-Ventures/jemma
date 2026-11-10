/**
 * Proof of the session.finished plan through the operator (docs/proof/operator-path-2026-11-10.md): on a `session_done`
 * sandbox the two plain-code steps run inside the operator and write_lesson is one agent run. Needs the agent
 * (AI_ROUTE=operator, AI_ROUTE_TAG=<tag>, unrecorded model ids, AI_MODE=replay) and an operator with OPERATOR_TAG=<tag>.
 */
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'
import { createServiceClient } from '@jemma/profiling/db'
import { createSandbox, deleteSandbox } from '../../../supabase/seed/demo'

const file = fileURLToPath(new URL('../../../.env.local', import.meta.url))
const env = { ...(existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {}), ...process.env } as Record<string, string>
const db = createServiceClient({ SUPABASE_URL: env.SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY! })
const agent = env.AGENT_URL!
const show = (label: string, v: unknown) => console.log(`${label}: ${JSON.stringify(v)}`)

const sb = await createSandbox(db, { stage: 'session_done' })
try {
  const amina = (await db.from('children').select('id').eq('school_id', sb.schoolId).eq('first_name', 'Amina').single()).data!.id
  const done = (await db.from('sessions').select('id').eq('child_id', amina).eq('status', 'done').limit(1).single()).data!.id
  const planned = async () => (await db.from('sessions').select('id, lesson_id').eq('child_id', amina).eq('status', 'planned')).data
  const lessonBefore = async () => {
    const s = (await planned())?.[0]
    return s?.lesson_id ? ((await db.from('lessons').select('content').eq('id', s.lesson_id).single()).data!.content as { questions?: unknown[] }).questions?.length ?? 0 : null
  }
  show('planned sessions before / questions in the planned lesson before', [(await planned())?.length, await lessonBefore()])
  const since = new Date().toISOString()
  const id = (await db.from('events').insert({ school_id: sb.schoolId, type: 'session.finished', payload: { type: 'session.finished', sessionId: done } }).select('id').single()).data!.id
  show('POST /events', (await fetch(`${agent}/events`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-jemma-secret': env.EVENTS_SECRET! }, body: JSON.stringify({ eventId: id }) })).status)
  const end = Date.now() + 10 * 60_000
  for (;;) {
    const r = (await db.from('events').select('status, runner, error').eq('id', id).single()).data!
    if ((r.status === 'done' || r.status === 'failed') && r.runner === 'desktop') {
      await new Promise((res) => setTimeout(res, 3000)) // only a done that stays done is final
      const again = (await db.from('events').select('status, runner, error, payload').eq('id', id).single()).data!
      if (again.status === r.status) { show('event (SELECT)', again); break }
    }
    if (Date.now() > end) { show('gave up', r); break }
    await new Promise((res) => setTimeout(res, 2000))
  }
  show('planned sessions after / questions in the planned lesson after', [(await planned())?.length, await lessonBefore()])
  show('activity_log lines', (await db.from('activity_log').select('tool, text').eq('school_id', sb.schoolId).gte('at', since).order('at')).data?.map((l) => `${l.tool}: ${l.text}`.slice(0, 130)))
} finally {
  await deleteSandbox(db, sb.sandboxId).catch(() => undefined)
}
