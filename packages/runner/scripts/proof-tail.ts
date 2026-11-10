/**
 * Proof A3 of docs/proof/operator-path-2026-11-10.md: one paper.checked event on a `marked` sandbox, so the cloud misses, hands it to the operator and
 * real Claude runs diagnose, class_report, write_lesson and guidance for one learner. Needs the agent (route-force) and the operator running.
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

const sb = await createSandbox(db, { stage: 'marked' })
try {
  const since = new Date().toISOString()
  const amina = (await db.from('children').select('id').eq('school_id', sb.schoolId).eq('first_name', 'Amina').single()).data!.id
  const paper = (await db.from('papers').select('id, test_id').eq('child_id', amina).not('test_id', 'is', null).limit(1).single()).data!
  const before = {
    reteach: (await db.from('reteach_plans').select('id, created_at').eq('test_id', paper.test_id!)).data,
    card: (await db.from('guidance_cards').select('updated_at').eq('child_id', amina)).data,
  }
  const ev = await db.from('events').insert({ school_id: sb.schoolId, type: 'paper.checked', payload: { type: 'paper.checked', paperId: paper.id } }).select('id').single()
  const id = ev.data!.id
  const post = await fetch(`${agent}/events`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-jemma-secret': env.EVENTS_SECRET! }, body: JSON.stringify({ eventId: id }) })
  show('POST /events', post.status)
  const end = Date.now() + 25 * 60_000
  let last = ''
  for (;;) {
    const row = (await db.from('events').select('status, runner, error, attempts, payload').eq('id', id).single()).data!
    const key = JSON.stringify([row.status, row.runner, (row.payload as { progress?: unknown })?.progress])
    if (key !== last) { last = key; console.log(new Date().toISOString().slice(11, 19), key) }
    // complete_job marks the event done after every step: only a done that stays done (3 reads, 1.5 s apart) is final
    if ((row.status === 'done' || row.status === 'failed') && row.runner === 'desktop') {
      let steady = true
      for (let i = 0; i < 3 && steady; i++) {
        await new Promise((r) => setTimeout(r, 1500))
        steady = (await db.from('events').select('status').eq('id', id).single()).data?.status === row.status
      }
      if (steady) { show('final event row', row); break }
    }
    if (Date.now() > end) { show('gave up waiting', row); break }
    await new Promise((r) => setTimeout(r, 3000))
  }
  const log = (await db.from('activity_log').select('tool, text, at').eq('school_id', sb.schoolId).gte('at', since).order('at')).data
  show('activity_log lines written by the tools during the run', log?.map((l) => `${l.tool}: ${l.text}`.slice(0, 140)))
  show('reteach_plans before/after', [before.reteach, (await db.from('reteach_plans').select('id, created_at').eq('test_id', paper.test_id!)).data])
  show('guidance_cards before/after', [before.card, (await db.from('guidance_cards').select('updated_at').eq('child_id', amina)).data])
  const sess = (await db.from('sessions').select('status, lesson_id').eq('child_id', amina).eq('status', 'planned')).data
  show('planned sessions', sess?.length)
  if (sess?.[0]?.lesson_id) {
    const lesson = (await db.from('lessons').select('format, content').eq('id', sess[0].lesson_id).single()).data!
    const c = lesson.content as { questions?: unknown[]; warmup?: unknown[] }
    show('lesson', { format: lesson.format, warmup: c.warmup?.length, questions: c.questions?.length })
  }
} finally {
  await deleteSandbox(db, sb.sandboxId).catch(() => undefined)
}
