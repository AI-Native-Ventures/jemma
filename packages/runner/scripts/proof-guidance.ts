/**
 * Proof of docs/proof/operator-path-2026-11-10.md: guidance after a teacher note and after a parent activity, each one agent run
 * through the operator. Needs the agent (AI_ROUTE=operator, AI_ROUTE_TAG=<tag>, unrecorded model ids, AI_MODE=replay) and an
 * operator with OPERATOR_TAG=<tag>. Makes a `marked` sandbox, writes a real note and a real activity, sends the two events.
 */
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'
import { createServiceClient } from '@jemma/profiling/db'
import { insertActivity, insertObservation } from '@jemma/profiling/records'
import { createSandbox, deleteSandbox } from '../../../supabase/seed/demo'

const file = fileURLToPath(new URL('../../../.env.local', import.meta.url))
const env = { ...(existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {}), ...process.env } as Record<string, string>
const db = createServiceClient({ SUPABASE_URL: env.SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY! })
const agent = env.AGENT_URL!
const show = (label: string, v: unknown) => console.log(`${label}: ${JSON.stringify(v)}`)

const sb = await createSandbox(db, { stage: 'marked' })
try {
  const amina = (await db.from('children').select('id').eq('school_id', sb.schoolId).eq('first_name', 'Amina').single()).data!.id
  const teacher = (await db.from('profiles').select('user_id').eq('school_id', sb.schoolId).eq('role', 'teacher').limit(1).single()).data!.user_id
  const parent = (await db.from('profiles').select('user_id').eq('role', 'parent').in('user_id', (await db.from('parent_links').select('parent_id').eq('child_id', amina)).data!.map((p) => p.parent_id)).limit(1).single()).data!.user_id
  const card = async () => (await db.from('guidance_cards').select('updated_at').eq('child_id', amina).maybeSingle()).data?.updated_at ?? null

  const run = async (label: string, type: 'observation.added' | 'activity.added') => {
    const before = await card()
    const since = new Date().toISOString()
    const id = (await db.from('events').insert({ school_id: sb.schoolId, type, payload: { type, childId: amina } }).select('id').single()).data!.id
    show(`${label}: POST /events`, (await fetch(`${agent}/events`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-jemma-secret': env.EVENTS_SECRET! }, body: JSON.stringify({ eventId: id }) })).status)
    const end = Date.now() + 8 * 60_000
    for (;;) {
      const r = (await db.from('events').select('status, runner').eq('id', id).single()).data!
      if ((r.status === 'done' || r.status === 'failed') && r.runner === 'desktop') break
      if (Date.now() > end) { show(`${label}: gave up`, r); break }
      await new Promise((res) => setTimeout(res, 2000))
    }
    const row = (await db.from('events').select('status, runner, claimed_by, error, payload').eq('id', id).single()).data!
    show(`${label}: event (SELECT)`, row)
    show(`${label}: guidance card updated_at before / after`, [before, await card()])
    show(`${label}: activity_log lines`, (await db.from('activity_log').select('tool, text').eq('school_id', sb.schoolId).gte('at', since).order('at')).data?.map((l) => `${l.tool}: ${l.text}`.slice(0, 130)))
  }

  await insertObservation(db, { childId: amina, authorId: teacher, kind: 'confidence', text: 'Asked why we cannot just add the bottoms. Keen to try fraction strips.' })
  await run('teacher note', 'observation.added')
  await insertActivity(db, { childId: amina, createdBy: parent, kind: 'club', name: 'Chess club', place: 'Hillview Primary, after school', days: ['Wed'], since: 'Nov 2026' })
  await run('parent activity', 'activity.added')
} finally {
  await deleteSandbox(db, sb.sandboxId).catch(() => undefined)
}
