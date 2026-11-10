/**
 * The evals runner: eleven tasks, each run three times in three fresh sandboxes, one after another, on the real agent
 * path (event, runner loop, runJob with goose, a free open-weights model), checked in code.
 *
 *   pnpm evals                       every task, 3 runs each, then writes EVALS.md
 *   pnpm evals --task class-report   one task (comma list allowed)
 *   pnpm evals --rehearse done       the same flow with a FAKE goose: no model, nothing counted, for testing the harness
 *
 * Needs goose, OPENROUTER_API_KEY (a free key is enough) and a database in `.env.local` (the local stack from
 * ./start.sh, or the team's jemma-dev). Starts its own agent worker on port 8756 and stops it at the end.
 * Live AI exception for this packet: free OpenRouter open-weights models only, synthetic data only, at most 45 goose runs
 * in total (`--cap`, counted in evals/results/ledger.jsonl).
 */
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { createServiceClient } from '../packages/profiling/src/db'
import { detectGoose } from '../packages/runner/src/index'
import { assertAllowedDatabase, loadEnv, required } from './lib/env'
import { runOnce, type Shared } from './lib/harness'
import { liveSpent } from './lib/ledger'
import { measureRoundTrip, readOneSchool, waitForCalmLine } from './lib/line'
import { readFreePercent, waitForMemory } from './lib/memory'
import { baseName, RESULTS_ROOT, readResultFile } from './lib/result'
import { startWorker, WORKER_URL, type Worker } from './lib/worker'
import { RUNS_PER_TASK, TASKS, taskById } from './tasks'
import { writeReport } from './lib/render'

const LIVE_CAP = 45
const FAKES = fileURLToPath(new URL('../packages/runner/test/fakes', import.meta.url))

function args() {
  const argv = process.argv.slice(2)
  const value = (flag: string) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : undefined)
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
  return {
    runs: Number(value('--runs') ?? RUNS_PER_TASK),
    tasks: value('--task')?.split(',').map((s) => s.trim()).filter(Boolean),
    runId: value('--run-id') ?? `${argv.includes('--rehearse') ? 'rehearsal-' : ''}${stamp}`,
    cap: Number(value('--cap') ?? LIVE_CAP),
    usedOffset: Number(value('--live-used') ?? 0),
    rehearse: value('--rehearse') ?? null,
    reuseWorker: argv.includes('--reuse-worker'),
    force: argv.includes('--force'),
    /** Skip the wait for a calm line to the database (a slow line is still measured and saved). */
    noLineWait: argv.includes('--no-line-wait'),
    report: !argv.includes('--no-report'),
    timeoutMinutes: value('--timeout-minutes') ? Number(value('--timeout-minutes')) : undefined,
  }
}

/** Sandboxes and tokens that a run left behind (there should be none). */
async function sweep(admin: ReturnType<typeof createServiceClient>, sandboxIds: string[]): Promise<string[]> {
  const left: string[] = []
  const tokens = await admin.from('mcp_tokens').select('token_hash').eq('label', 'p53a-evals')
  if (tokens.data?.length) {
    await admin.from('mcp_tokens').delete().eq('label', 'p53a-evals')
    left.push(`${tokens.data.length} token(s) removed by the sweep`)
  }
  if (sandboxIds.length) {
    const rows = await admin.from('demo_sandboxes').select('id').in('id', sandboxIds)
    if (rows.data?.length) left.push(`${rows.data.length} sandbox row(s) still in demo_sandboxes`)
  }
  return left
}

async function main(): Promise<void> {
  const a = args()
  const env = loadEnv()
  assertAllowedDatabase(env)
  const rehearsal = a.rehearse !== null
  const admin = createServiceClient({ SUPABASE_URL: required(env, 'SUPABASE_URL'), SUPABASE_SERVICE_ROLE_KEY: required(env, 'SUPABASE_SERVICE_ROLE_KEY') })

  const picked = a.tasks ? a.tasks.map((id) => taskById(id) ?? (() => { throw new Error(`no task called ${id}. Tasks: ${TASKS.map((t) => t.id).join(', ')}`) })()) : TASKS
  if (rehearsal) {
    process.env.PATH = `${FAKES}:${process.env.PATH ?? ''}`
    process.env.FAKE_MODE = a.rehearse!
    console.log(`REHEARSAL: a fake goose (mode ${a.rehearse}) runs instead of the real one. No model is called.`)
  } else {
    required(env, 'OPENROUTER_API_KEY')
    const goose = await detectGoose()
    console.log(`goose_installed=${goose.installed}; goose_version=${goose.version}; key_set=${goose.signedIn}`)
    if (!goose.installed || goose.signedIn !== true) throw new Error('goose is not installed, or OPENROUTER_API_KEY is missing')
  }

  const spentAtStart = liveSpent() + a.usedOffset
  let spentNow = 0
  console.log(`live goose runs spent so far: ${spentAtStart} of ${a.cap}`)

  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
  const roundTrip = () => measureRoundTrip(() => readOneSchool(admin))
  if (!rehearsal && !a.noLineWait) {
    // A dead line would turn the set into a list of timeouts. Wait for it (10 minutes at a time, one hour at most), then go on anyway.
    const line = await waitForCalmLine({ measure: roundTrip, sleep, log: (l) => console.log(l) })
    if (line.startedAnyway) console.log(`the line stayed slow (${line.measurements.join(', ')} ms): the results record the round trip of every run`)
  }

  const outDir = join(RESULTS_ROOT, a.runId)
  mkdirSync(outDir, { recursive: true })
  let worker: Worker | null = null
  const stopWorker = async () => {
    await worker?.stop()
    worker = null
  }
  process.once('SIGINT', () => void stopWorker().finally(() => process.exit(130)))
  process.once('SIGTERM', () => void stopWorker().finally(() => process.exit(143)))

  const sandboxIds: string[] = []
  const summary: { task: string; n: number; pass: boolean; seconds: number }[] = []
  try {
    worker = a.reuseWorker ? { url: WORKER_URL, stop: async () => {}, log: () => '' } : await startWorker()
    console.log(`agent worker answers on ${worker.url}`)
    const shared: Shared = {
      admin,
      env,
      agentUrl: worker.url,
      runId: a.runId,
      outDir,
      rehearsal,
      liveLeft: () => a.cap - spentAtStart - spentNow,
      spend: (k) => {
        if (!rehearsal) spentNow += k
      },
      timeoutMs: a.timeoutMinutes ? a.timeoutMinutes * 60_000 : undefined,
      measureRoundTrip: roundTrip,
    }
    for (const task of picked) {
      for (let n = 1; n <= a.runs; n++) {
        const file = join(outDir, `${baseName(task.id, n)}.json`)
        if (existsSync(file) && !a.force) {
          const old = readResultFile(file)
          console.log(`skip ${task.id} run ${n}: already saved (${old.pass ? 'pass' : 'fail'})`)
          summary.push({ task: task.id, n, pass: old.pass, seconds: old.seconds })
          continue
        }
        if (!rehearsal && shared.liveLeft() <= 0) {
          console.log(`the live cap of ${a.cap} goose runs is reached: stopping before ${task.id} run ${n}`)
          throw new Error('live cap reached')
        }
        await waitForMemory({ read: readFreePercent, sleep, log: (l) => console.log(l) })
        const t0 = Date.now()
        console.log(`RUN ${task.id} ${n}/${a.runs} ...`)
        const result = await runOnce(task, n, shared)
        sandboxIds.push(...result.sandboxIds)
        summary.push({ task: task.id, n, pass: result.pass, seconds: result.seconds })
        const failed = result.checks.filter((c) => !c.pass).map((c) => c.name)
        console.log(`  ${result.pass ? 'PASS' : 'FAIL'} ${task.id} ${n}: ${result.seconds}s job, ${Math.round((Date.now() - t0) / 1000)}s in all, ${result.attempts.length} goose attempt(s), event=${result.event?.status ?? 'none'}${failed.length ? `; failed: ${failed.join(' | ')}` : ''}${result.error ? `; error: ${result.error.slice(0, 200)}` : ''}${result.cleanup.length ? `; CLEANUP: ${result.cleanup.join(' | ')}` : ''}`)
      }
    }
  } finally {
    await stopWorker()
    const left = await sweep(admin, sandboxIds).catch((err) => [`sweep failed: ${err instanceof Error ? err.message : String(err)}`])
    console.log(left.length ? `leftovers: ${left.join('; ')}` : 'leftovers: none (no token, no sandbox row)')
    console.log(`live_goose_runs_this_session=${spentNow}; total_so_far=${spentAtStart + spentNow} of ${a.cap}`)
    console.log(`passes=${summary.filter((s) => s.pass).length}; fails=${summary.filter((s) => !s.pass).length}; of ${summary.length} runs`)
  }

  if (a.report && !rehearsal && !a.tasks) {
    const done = readdirSync(outDir).filter((f) => f.endsWith('.json')).length
    console.log(`${done} result file(s) in ${outDir}`)
    await writeReport({ runId: a.runId })
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'the evals run failed')
  process.exitCode = 1
})
