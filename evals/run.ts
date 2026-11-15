/**
 * The evals runner: eleven tasks, each run three times in three fresh sandboxes, one after another, on the real agent
 * path (event, runner loop, runJob with goose, a free open-weights model), checked in code.
 *
 *   pnpm evals                       every task, 3 runs each, then writes EVALS.md
 *   pnpm evals --task class-report   one task (comma list allowed)
 *   pnpm evals --rehearse done       the same flow with a FAKE goose: no model, nothing counted, for testing the harness
 *   pnpm evals --task class-report --runs 3 --provider ollama [--model gemma4:26b]
 *                                    the same task on a model on THIS computer through Ollama: no cloud model, no cloud key
 *
 * Needs goose, OPENROUTER_API_KEY (a free key is enough) and a database in `.env.local` (the local stack from
 * ./start.sh, or the team's jemma-dev). Starts its own agent worker on port 8756 and stops it at the end.
 * Live AI exception for this packet: free OpenRouter open-weights models only, synthetic data only, at most 45 goose runs
 * in total (`--cap`, counted in evals/results/ledger.jsonl).
 *
 * A local run (`--provider ollama`) needs goose and Ollama running with the model pulled, and no OpenRouter key (any
 * that is set is taken out of this process). It has its own cap of 6 runs (`provider: "ollama"` in the ledger, never counted
 * against the 45), its run folder starts with `local-`, and EVALS.md lists it in the section "On this machine". The
 * database must still be the local stack or the dev project; `--allow-preview` accepts the deployed preview project too, on purpose.
 */
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { createServiceClient } from '../packages/profiling/src/db'
import { DEFAULT_LOCAL_MODEL, detectGoose, localSetupProblem, ollamaHost, type OllamaAddress } from '../packages/runner/src/index'
import { parseArgs } from './lib/args'
import { CLOUD_MODEL_KEYS, assertAllowedDatabase, loadEnv, required } from './lib/env'
import { runOnce, type Shared } from './lib/harness'
import { liveSpent } from './lib/ledger'
import { checkOllamaReady } from './lib/local'
import { measureRoundTrip, readOneSchool, waitForCalmLine } from './lib/line'
import { readFreePercent, waitForMemory } from './lib/memory'
import { baseName, RESULTS_ROOT, readResultFile } from './lib/result'
import { startWorker, WORKER_URL, type Worker } from './lib/worker'
import { RUNS_PER_TASK, TASKS, taskById } from './tasks'
import { writeReport } from './lib/render'

const FAKES = fileURLToPath(new URL('../packages/runner/test/fakes', import.meta.url))
/** The free-memory wait of a run on a model on this computer: the model holds its memory already, so 30 percent free would never come. */
const LOCAL_MEMORY_START_AT = 10

const args = () => parseArgs(process.argv.slice(2), { runsPerTask: RUNS_PER_TASK })

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
  assertAllowedDatabase(env, { allowPreview: a.allowPreview })
  const rehearsal = a.rehearse !== null
  const local = a.provider === 'ollama'
  let localSetup: { model: string; host: OllamaAddress } | undefined
  const admin = createServiceClient({ SUPABASE_URL: required(env, 'SUPABASE_URL'), SUPABASE_SERVICE_ROLE_KEY: required(env, 'SUPABASE_SERVICE_ROLE_KEY') })

  const picked = a.tasks ? a.tasks.map((id) => taskById(id) ?? (() => { throw new Error(`no task called ${id}. Tasks: ${TASKS.map((t) => t.id).join(', ')}`) })()) : TASKS
  if (rehearsal) {
    process.env.PATH = `${FAKES}:${process.env.PATH ?? ''}`
    process.env.FAKE_MODE = a.rehearse!
    console.log(`REHEARSAL: a fake goose (mode ${a.rehearse}) runs instead of the real one. No model is called.`)
  } else if (!local) {
    required(env, 'OPENROUTER_API_KEY')
    const goose = await detectGoose()
    console.log(`goose_installed=${goose.installed}; goose_version=${goose.version}; key_set=${goose.signedIn}`)
    if (!goose.installed || goose.signedIn !== true) throw new Error('goose is not installed, or OPENROUTER_API_KEY is missing')
  }
  if (local) {
    // A model on this computer: no cloud model key anywhere in this process (not in goose, not in the agent worker, not here).
    for (const key of CLOUD_MODEL_KEYS) {
      delete process.env[key]
      delete env[key]
    }
    const host = ollamaHost(process.env)
    const model = a.model ?? (process.env.JEMMA_OPEN_MODEL?.trim() || DEFAULT_LOCAL_MODEL)
    const problem = localSetupProblem(host, [model])
    if (problem) throw new Error(problem)
    process.env.JEMMA_GOOSE_PROVIDER = 'ollama'
    process.env.JEMMA_OPEN_MODEL = model
    delete process.env.JEMMA_OPEN_MODEL_FALLBACKS
    process.env.OLLAMA_HOST = host.url
    localSetup = { model, host }
    console.log(`LOCAL RUN: goose on Ollama at ${host.url}, model ${model}. No OpenRouter key, no cloud model, no fallback.`)
    if (!rehearsal) {
      const goose = await detectGoose()
      console.log(`goose_installed=${goose.installed}; goose_version=${goose.version}`)
      if (!goose.installed) throw new Error('goose is not installed')
      const notReady = await checkOllamaReady({ host, model })
      if (notReady) throw new Error(notReady)
      console.log(`ollama answers and has ${model}`)
    }
  }

  const spentAtStart = liveSpent(undefined, 'goose', undefined, a.provider) + a.usedOffset
  let spentNow = 0
  console.log(`${local ? 'local' : 'live'} goose runs spent so far: ${spentAtStart} of ${a.cap}`)

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
      provider: a.provider,
      local: localSetup,
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
          console.log(`the ${local ? 'local' : 'live'} cap of ${a.cap} goose runs is reached: stopping before ${task.id} run ${n}`)
          throw new Error('live cap reached')
        }
        await waitForMemory({ read: readFreePercent, sleep, log: (l) => console.log(l), ...(local ? { startAt: LOCAL_MEMORY_START_AT } : {}) })
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
    console.log(`${local ? 'local' : 'live'}_goose_runs_this_session=${spentNow}; total_so_far=${spentAtStart + spentNow} of ${a.cap}`)
    console.log(`passes=${summary.filter((s) => s.pass).length}; fails=${summary.filter((s) => !s.pass).length}; of ${summary.length} runs`)
  }

  if (local && !rehearsal) console.log(`local results are in ${outDir}. \`pnpm evals:report\` adds them to EVALS.md under "On this machine" (they never replace the main run).`)
  if (a.report && !rehearsal && !a.tasks && !local) {
    const done = readdirSync(outDir).filter((f) => f.endsWith('.json')).length
    console.log(`${done} result file(s) in ${outDir}`)
    await writeReport({ runId: a.runId })
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'the evals run failed')
  process.exitCode = 1
})
