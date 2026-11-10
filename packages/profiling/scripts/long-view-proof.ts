// Proof run for the Long view (P52a): a fresh `start` sandbox on jemma-dev, then `long_view.requested` for each of the 5 learners,
// one at a time, on a LOCAL agent worker that is already running (default http://localhost:8755). It does not call a model itself:
// the worker does, in its own AI_MODE (cache to record, replay to prove the recording holds in another sandbox).
// After the 5, a sixth event runs for Amina once two class tests are in her marks (Class Test 1 in Term 3 of the class year, 3 of 4
// fractions answers right, and Class Test 2 in Term 4, all right): her fractions struggle ended two terms before, so the pattern
// comes back with those newer results beside it.
// Run: node --import tsx --import ./scripts/register-md.mjs scripts/long-view-proof.ts --label record --out /path/record.json [--agent http://localhost:8755] [--against /path/record.json]
// With --against, the saved patterns are compared with an earlier run's, row by row.
// Env: .env.local (jemma-dev and EVENTS_SECRET). Keys are never printed. The sandbox is deleted at the end unless --keep is given.
import { readFileSync, writeFileSync } from 'node:fs'
import { createServiceClient, type JemmaDb } from '../src/db'
import { MemoryStore } from '../src/ai'
import { screenPatterns } from '../src/tools/save/save-long-view'
import { getLearnerHistory } from '../src/tools/read/get-learner-history'
import { LongViewDraftSchema } from '../src/schemas'
import type { ToolContext } from '../src/tools/context'
import { createSandbox, deleteSandbox } from '../../../supabase/seed'
import { assertDevProject, loadEnv } from './env'

const arg = (f: string) => (process.argv.includes(f) ? process.argv[process.argv.indexOf(f) + 1] : undefined)
const agent = arg('--agent') ?? 'http://localhost:8755'
const label = arg('--label') ?? 'run'
const out = arg('--out')
const against = arg('--against')
const keep = process.argv.includes('--keep')
const LEARNERS = ['Amina', 'Thabo', 'Lerato', 'Sipho', 'Naledi']
const NEWER = 'Amina + Class Tests 1 and 2'
const TIMEOUT_MS = 15 * 60 * 1000

const env = loadEnv()
assertDevProject(env)
if (!env.EVENTS_SECRET) throw new Error('EVENTS_SECRET is not set in .env.local')
if (!/^https?:\/\/(localhost|127\.0\.0\.1):\d+$/.test(agent)) throw new Error(`--agent must be a local worker, got ${agent}`)
const db: JemmaDb = createServiceClient({ SUPABASE_URL: env.SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY! })

type Saved = { kind: string; family: string; status: string; title: string; statement: string; newerTerms: number }
type Row = {
  learner: string
  status: string
  seconds: number
  attempts: number
  error: string | null
  candidates: string[]
  saved: Saved[]
  dropped: { key: string; reason: string }[]
  modelAnswered: boolean
}

async function ok<T>(q: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<NonNullable<T>> {
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return data as NonNullable<T>
}

/**
 * Two class tests for Amina after her struggle: Class Test 1 in Term 3 of the class year (4 fractions answers, 3 right)
 * and Class Test 2 in Term 4 (4 answers, all right).
 */
async function addClassTests(classId: string, childId: string) {
  const year = new Date().getUTCFullYear()
  const map = await ok(db.from('curriculum_maps').insert({ class_id: classId, status: 'approved' }).select('id').single())
  const topic = await ok(db.from('topics').insert({ map_id: map.id, term: 3, position: 1, name: 'Adding fractions', family: 'fractions' }).select('id').single())
  for (const [title, day, rights] of [
    ['Class Test 1', `${year}-08-20`, [true, true, true, false]],
    ['Class Test 2', `${year}-11-05`, [true, true, true, true]],
  ] as const) {
    const test = await ok(db.from('tests').insert({ class_id: classId, title, written_on: day, out_of: 4, topic_ids: [topic.id] }).select('id').single())
    const paper = await ok(db.from('papers').insert({ test_id: test.id, child_id: childId, owner: 'teacher', kind: 'test', status: 'marked', name_read: 'Amina', total: rights.filter(Boolean).length }).select('id').single())
    await ok(
      db.from('question_results').insert(
        rights.map((right, i) => ({
          paper_id: paper.id, child_id: childId, n: i + 1, prompt: `1/2 + 1/${i + 3}`, answer_read: right ? 'right' : 'wrong', read_confidence: 0.95, correct: right, mark: right ? 1 : 0, topic_id: topic.id, topic_name: 'Adding fractions',
        })),
      ).select('id'),
    )
  }
}

async function main() {
  const s = await createSandbox(db, { stage: 'start' })
  console.log(`[${label}] sandbox ${s.sandboxId} made`)
  const rows: Row[] = []
  try {
    const kids = await ok(db.from('children').select('id, first_name').eq('school_id', s.schoolId))
    const ctx: ToolContext = { db, schoolId: s.schoolId, eventId: null, env: { replayStore: new MemoryStore() }, now: () => new Date() }

    async function run(name: string, rowLabel: string) {
      const childId = kids.find((k) => k.first_name === name)!.id
      const ev = await ok(
        db.from('events').insert({ school_id: s.schoolId, type: 'long_view.requested', payload: { type: 'long_view.requested', childId } }).select('id, created_at').single(),
      )
      const post = await fetch(`${agent}/events`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-jemma-secret': env.EVENTS_SECRET! },
        body: JSON.stringify({ eventId: ev.id }),
      })
      if (post.status !== 202) throw new Error(`POST /events answered ${post.status}`)
      const wall0 = Date.now()
      let row = await ok(db.from('events').select('status, attempts, error, finished_at').eq('id', ev.id).single())
      while (!['done', 'failed', 'cancelled'].includes(row.status)) {
        if (Date.now() - wall0 > TIMEOUT_MS) throw new Error(`${rowLabel}: not done after ${TIMEOUT_MS / 60000} minutes (status ${row.status})`)
        await new Promise((r) => setTimeout(r, 1000))
        row = await ok(db.from('events').select('status, attempts, error, finished_at').eq('id', ev.id).single())
      }
      const seconds = row.finished_at ? (Date.parse(row.finished_at) - Date.parse(ev.created_at)) / 1000 : (Date.now() - wall0) / 1000

      const history = await getLearnerHistory.run(ctx, { childId })
      if (!('candidates' in history)) throw new Error('unexpected tool output')
      const saved = (await ok(db.from('long_view_patterns').select('kind, family, status, title, statement, terms').eq('child_id', childId).order('family'))).map((r) => ({
        kind: r.kind, family: r.family, status: r.status, title: r.title, statement: r.statement,
        newerTerms: (r.terms as { since?: boolean }[]).filter((t) => t.since).length,
      }))

      // The model's answer for this event is the replay row written during it (record and cache modes). Screen it again to say what was dropped and why.
      const fresh = await ok(db.from('ai_replays').select('key, model, response').gte('created_at', ev.created_at).neq('model', 'lock'))
      let dropped: { key: string; reason: string }[] = []
      let modelAnswered = false
      for (const r of fresh) {
        const text = (r.response as { content?: { type: string; text?: string }[] }).content?.find((c) => c.type === 'text')?.text
        if (!text) continue
        try {
          const answer = LongViewDraftSchema.parse(JSON.parse(text))
          dropped = screenPatterns(answer.patterns, history.candidates.map((c) => c.key)).dropped
          modelAnswered = true
        } catch {
          // not a long view answer
        }
      }
      rows.push({
        learner: rowLabel, status: row.status, seconds, attempts: row.attempts, error: row.error, candidates: history.candidates.map((c) => `${c.key}${c.since.length ? ` (${c.since.length} newer)` : ''}`),
        saved, dropped, modelAnswered,
      })
      console.log(`[${label}] ${rowLabel}: ${row.status} in ${seconds.toFixed(1)} s, ${saved.length} saved, ${dropped.length} dropped${row.error ? `, error: ${row.error.slice(0, 160)}` : ''}`)
    }

    for (const name of LEARNERS) await run(name, name)
    await addClassTests(s.classId, kids.find((k) => k.first_name === 'Amina')!.id)
    await run('Amina', NEWER)
  } finally {
    if (!keep) await deleteSandbox(db, s.sandboxId).catch((e) => console.log(`[${label}] could not delete the sandbox: ${e}`))
  }

  let same: Record<string, boolean> | null = null
  if (against) {
    const before = JSON.parse(readFileSync(against, 'utf8')) as { rows: Row[] }
    same = Object.fromEntries(rows.map((r) => [r.learner, JSON.stringify(r.saved) === JSON.stringify(before.rows.find((b) => b.learner === r.learner)?.saved)]))
  }
  const misses = rows.filter((r) => /Replay miss/.test(r.error ?? '')).length
  const summary = { label, agent, rows, replayMisses: misses, sameAsEarlierRun: same }
  if (out) writeFileSync(out, JSON.stringify(summary, null, 2))
  console.log(`\n[${label}] learner | status | seconds | saved | dropped`)
  for (const r of rows) console.log(`${r.learner} | ${r.status} | ${r.seconds.toFixed(1)} | ${r.saved.length} | ${r.dropped.map((d) => `${d.key}: ${d.reason}`).join('; ') || 'none'}`)
  console.log(`[${label}] replay misses: ${misses}${same ? `; same patterns as the earlier run: ${JSON.stringify(same)}` : ''}`)
  if (rows.some((r) => r.status !== 'done')) process.exitCode = 1
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
