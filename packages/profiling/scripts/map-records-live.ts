// Runs the map_records job LIVE on the free text model for the two sample files of fixtures/records, in a fresh `start` demo school,
// prints what the model mapped against what the file means, and stores each answer in `ai_replays` (so "Use a sample file" is instant).
// Run: node --import tsx --import ./scripts/register-md.mjs scripts/map-records-live.ts [--only tidy|messy] [--mode record|cache]
// `--dry` checks the script itself with a made-up answer instead of a model: no request leaves this machine and nothing is recorded.
// A hard cap of 6 requests to the model host is kept in this process (retries count). Synthetic data only. Keys are never printed.
import { readFileSync } from 'node:fs'
import { MockLanguageModelV4 } from 'ai/test'
import { fileURLToPath } from 'node:url'
import { SupabaseReplayStore, type AiEnv } from '../src/ai'
import { createServiceClient, type JemmaDb } from '../src/db'
import { createImport, loadImport, storedOf } from '../src/imports'
import { runMapRecords } from '../src/jobs/cloud/map-records'
import type { ToolContext } from '../src/tools/context'
import { createSandbox, deleteSandbox } from '../../../supabase/seed'
import { assertDevProject, loadEnv } from './env'

const CAP = 6
const SAMPLES = {
  tidy: 'grade5-maths-results.csv',
  messy: 'messy-old-marks.csv',
} as const
type Which = keyof typeof SAMPLES

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url))
const arg = (f: string) => (process.argv.includes(f) ? process.argv[process.argv.indexOf(f) + 1] : undefined)
const only = arg('--only') as Which | undefined
const dry = process.argv.includes('--dry')
const mode = (arg('--mode') ?? 'record') as 'record' | 'cache'

const env = loadEnv()
Object.assign(process.env, env)
assertDevProject(env)

// Count every request to the model host, and refuse the 7th.
let requests = 0
const realFetch = globalThis.fetch
globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (/openrouter\.ai|opencode\.ai|api\.deepseek|anthropic|generativelanguage|api\.openai/.test(url)) {
    if (requests >= CAP) throw new Error(`live cap of ${CAP} requests reached`)
    requests++
    const answer = await realFetch(input, init)
    // After a rate limit answer the next request waits 60 seconds (another runner may be using the same free model).
    if (answer.status === 429) {
      console.log(`rate limit answer on request ${requests}: waiting 60 seconds before the next one`)
      await new Promise((r) => setTimeout(r, 60_000))
    }
    return answer
  }
  return realFetch(input, init)
}) as typeof fetch

const db: JemmaDb = createServiceClient({ SUPABASE_URL: env.SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY! })
const ai: AiEnv = {
  LLM_PROVIDER: env.LLM_PROVIDER,
  LLM_MODEL: env.LLM_MODEL,
  LLM_MODEL_FALLBACKS: env.LLM_MODEL_FALLBACKS,
  AI_MODE: mode,
  OPENROUTER_API_KEY: env.OPENROUTER_API_KEY,
  replayStore: new SupabaseReplayStore(db),
}

/** What a good model says about each file (only used by --dry). */
const none = { learner: null, mark: null, outOf: null, percent: null, date: null, term: null, year: null, grade: null, subject: null, title: null, kind: null, topic: null, note: null, teacher: null, attendance: null }
const fixed = { kind: null, outOf: null, grade: null, year: null, term: null, subject: null, teacher: null }
const DRY_ANSWERS: Record<Which, unknown> = {
  tidy: { ...none, learner: 'Learner', date: 'Date', title: 'Assessment', topic: 'Topic', mark: 'Mark', outOf: 'Total', fixed, topics: [{ text: 'Place value', family: 'whole_numbers' }, { text: 'Adding fractions', family: 'fractions' }, { text: 'Reading bar graphs', family: 'data' }] },
  messy: {
    ...none, learner: 'Pupil', percent: 'Result', term: 'Term', year: 'Year', title: 'Work', topic: 'Work', note: 'Teacher comment', fixed,
    topics: ['Bar graphs quiz:data', 'Tally charts test:data', 'Measurement quiz:measurement', 'Pictograms assignment:data', 'Data project:data', 'Decimals quiz:decimals', 'Adding fractions test:fractions', 'Place value quiz:whole_numbers'].map((t) => ({ text: t.split(':')[0], family: t.split(':')[1] })),
  },
}
const dryModel = (which: Which) =>
  new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: 'text' as const, text: JSON.stringify(DRY_ANSWERS[which]) }],
      finishReason: { unified: 'stop' as const, raw: 'stop' },
      usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } },
      warnings: [],
    }),
  })

const show = (label: string, value: unknown) => console.log(`${label.padEnd(26)} ${typeof value === 'string' ? value : JSON.stringify(value)}`)

async function main() {
  const sandbox = await createSandbox(db, { stage: 'start' })
  try {
    const login = (await db.from('demo_sandboxes').select('logins').eq('id', sandbox.sandboxId).single()).data!.logins as { teacher: { userId: string } }
    const kids = new Map((await db.from('children').select('id, first_name').eq('school_id', sandbox.schoolId)).data!.map((k) => [k.id, k.first_name]))
    const ctx: ToolContext = { db, schoolId: sandbox.schoolId, eventId: null, env: ai, now: () => new Date() }
    for (const which of Object.keys(SAMPLES) as Which[]) {
      if (only && only !== which) continue
      const file = SAMPLES[which]
      const text = readFileSync(here(`../../../fixtures/records/${file}`), 'utf8')
      const made = await createImport(db, { schoolId: sandbox.schoolId, classId: sandbox.classId, userId: login.teacher.userId, fileName: file, text })
      if (!made.ok) throw new Error(made.error)
      console.log(`\n=== ${which}: ${file} (${dry ? 'DRY RUN, a made-up answer' : `model ${env.LLM_MODEL}, mode ${mode}`}, requests so far ${requests}) ===`)
      const t0 = Date.now()
      try {
        await runMapRecords(ctx, 'live-proof', { importId: made.importId }, dry ? dryModel(which) : undefined)
      } catch (e) {
        show('RESULT', `FAILED after ${((Date.now() - t0) / 1000).toFixed(1)}s: ${(e instanceof Error ? e.message : String(e)).replace(/\s+/g, ' ').slice(0, 400)}`)
        show('requests', requests)
        continue
      }
      const row = await loadImport(db, made.importId)
      const stored = storedOf(row)
      show('RESULT', `ok in ${((Date.now() - t0) / 1000).toFixed(1)}s, requests ${requests}`)
      show('mapping (as the model)', stored.mapping!.mapping)
      show('warnings', stored.mapping!.warnings)
      show('in plain words', stored.mapping!.lines)
      show('assumptions', stored.mapping!.assumptions)
      show('counts', stored.counts)
      show('problems', stored.problems.map((p) => `${p.row} ${p.kind}`))
      show(
        'rows (n learner piece mark term strand)',
        stored.rows.map((r) => `${r.n} ${r.childId ? kids.get(r.childId) : `?${r.learner}`} ${r.piece ?? '-'} ${r.marks}/${r.outOf} T${r.term} ${r.family ?? 'unsure'}`),
      )
    }
  } finally {
    await deleteSandbox(db, sandbox.sandboxId).catch(() => undefined)
  }
  console.log(`\nrequests to the model host: ${requests} (cap ${CAP})`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
