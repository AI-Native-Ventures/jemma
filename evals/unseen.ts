/**
 * A curriculum Jemma has never seen: the curriculum reader (`draft_map`) run live on the three invented Mathematics documents in
 * `fixtures/curriculum/unseen/`, three runs each, on the free models. (The first version of Jemma covers Mathematics only: the
 * three earlier documents in `other-subjects/` are not run again, and their saved results stay as they are.) Code scores every draft against the ground truth next
 * to the document (`evals/lib/unseen.ts`). No model judges a model.
 *
 *   pnpm evals:unseen --cap 12                  all three documents, three runs each (9 live runs, 3 repeats allowed)
 *   pnpm evals:unseen --cap 12 --docs grade5-mathematics-za --runs 1
 *   pnpm evals:unseen --cap 12 --run-id <id of a stopped run>     goes on with that run: a run that has a result is never run again
 *
 * A run where the provider gave no answer (a rate limit, a capacity or server error) is repeated, at most `--repeats` times in
 * all (default 3), and is shown as "no answer", never as a fail. Three no-answers in a row stop the script. Each try is one line
 * in `evals/results/ledger.jsonl` (kind `draft_map`, with its run id), and the script stops at `--cap` live runs of that run id.
 *
 * Needs `OPENROUTER_API_KEY`, the database values in `.env.local`, and the ONE-AT-A-TIME rule: never run it beside another live run.
 * Free OpenRouter models only, synthetic data only. Results: `evals/results/unseen-curriculum/<run id>/`. `pnpm evals:report` then
 * writes the section "A curriculum Jemma had never seen" in EVALS.md.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getModel } from '../packages/profiling/src/ai'
import { readPdfText } from '../packages/profiling/src/ai/pdf-text'
import { createServiceClient } from '../packages/profiling/src/db'
import { assertAllowedDatabase, loadEnv, required } from './lib/env'
import { appendLedger, liveSpent } from './lib/ledger'
import { readFreePercent, waitForMemory } from './lib/memory'
import { clean } from './lib/redact'
import { DOCUMENT_IDS, UNSEEN_RESULTS, documentPath, isLiveRun, loadTruth, parseUnseenResult, planResume, runKey, type UnseenResult } from './lib/unseen'
import { freeModels } from './lib/unseen-models'
import { runOnce } from './lib/unseen-run'

const args = () => {
  const argv = process.argv.slice(2)
  const value = (flag: string) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : undefined)
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
  return {
    cap: value('--cap') === undefined ? null : Number(value('--cap')),
    runs: Number(value('--runs') ?? 3),
    repeats: Number(value('--repeats') ?? 3),
    docs: value('--docs')?.split(',').map((s) => s.trim()).filter(Boolean) ?? [...DOCUMENT_IDS],
    runId: value('--run-id') ?? `${stamp}-unseen`,
  }
}

async function main(): Promise<void> {
  const a = args()
  if (a.cap === null || !Number.isFinite(a.cap)) throw new Error('needs --cap N: the most live runs of the curriculum reader this run id may make (the ledger is kept in evals/results/ledger.jsonl)')
  const env = loadEnv()
  assertAllowedDatabase(env)
  required(env, 'OPENROUTER_API_KEY')
  const m = freeModels(env)
  const db = createServiceClient({ SUPABASE_URL: required(env, 'SUPABASE_URL'), SUPABASE_SERVICE_ROLE_KEY: required(env, 'SUPABASE_SERVICE_ROLE_KEY') })
  const aiEnv = { LLM_PROVIDER: 'openrouter', VISION_PROVIDER: 'openrouter', OPENROUTER_API_KEY: env.OPENROUTER_API_KEY, ...m }
  const secrets = [env.OPENROUTER_API_KEY!]

  const resumedAt = new Date().toISOString()
  const spentAtStart = liveSpent(undefined, 'draft_map', a.runId)
  console.log(`live draft_map runs spent so far in run ${a.runId}: ${spentAtStart} of ${a.cap}`)
  if (spentAtStart >= a.cap) throw new Error(`the cap of ${a.cap} live runs is already reached in run ${a.runId} (${spentAtStart} spent)`)
  const outDir = join(UNSEEN_RESULTS, a.runId)
  mkdirSync(outDir, { recursive: true })
  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

  // A run id that already has a folder is a stopped run that goes on: what has a result is kept and never run again.
  const earlier: UnseenResult[] = readdirSync(outDir)
    .filter((f) => f.endsWith('.json') && f !== 'run.json')
    .sort()
    .map((f) => parseUnseenResult(readFileSync(join(outDir, f), 'utf8'), join(outDir, f)))
  const plan = planResume(earlier, a.repeats)
  const earlierMeta = existsSync(join(outDir, 'run.json')) ? (JSON.parse(readFileSync(join(outDir, 'run.json'), 'utf8')) as { spentAtStart?: number; stopped?: string | null; resumedAt?: string[]; earlierStops?: string[] }) : null
  if (earlier.length > 0) console.log(`going on with run ${a.runId}: ${plan.done.size} run(s) already have a result and are kept, ${plan.repeatsUsed} repeat(s) and ${plan.networkTries} network failure(s) so far`)

  let spent = spentAtStart
  let repeatsLeft = a.repeats - plan.repeatsUsed
  let inARow = 0
  // A failure of this Mac's own network is not the provider's answer: the try is repeated and no repeat is used up (the result file says so).
  let networkInARow = 0
  let networkTries = plan.networkTries
  let stopped: string | null = null
  const tries: UnseenResult[] = [...earlier]
  runs: for (const id of a.docs) {
    const truth = loadTruth(id)
    const bytes = new Uint8Array(readFileSync(documentPath(truth)))
    const pages = (await readPdfText(bytes)).pages
    for (let n = 1; n <= a.runs; n++) {
      if (plan.done.has(runKey(id, n))) {
        console.log(`KEEP ${id} ${n}/${a.runs}: it already has a result`)
        continue
      }
      for (let attempt = plan.nextAttempt.get(runKey(id, n)) ?? 1; ; attempt++) {
        if (spent >= a.cap) {
          stopped = `the cap of ${a.cap} live runs was reached before ${id} run ${n}`
          break runs
        }
        if (existsSync(join(outDir, `${id}-${n}-${attempt}.json`))) throw new Error(`${id}-${n}-${attempt}.json already exists: a saved result is never written over`)
        await waitForMemory({ read: readFreePercent, sleep, log: (l) => console.log(l) })
        console.log(`RUN ${id} ${n}/${a.runs} try ${attempt} ...`)
        const result = await runOnce({ db, aiEnv, getModel, truth, bytes, pages, runId: a.runId, n, attempt })
        // A try that could not even make its school (no model was asked), or that never left this Mac's network, is not a live run and is not counted.
        if (isLiveRun(result)) {
          spent++
          appendLedger({ at: new Date().toISOString(), runId: a.runId, taskId: `draft_map:${id}`, n, attempts: 1, rehearsal: false, kind: 'draft_map' })
        }
        const text = clean(JSON.stringify(result, null, 2), secrets).text
        writeFileSync(join(outDir, `${id}-${n}-${attempt}.json`), `${text}\n`)
        tries.push(result)
        const failed = result.checks.filter((c) => !c.pass).map((c) => c.name)
        console.log(`  ${result.verdict.toUpperCase()} ${id} ${n} try ${attempt}: ${result.seconds}s, read by ${result.way ?? 'nothing'}, ${result.calls} model call(s)${result.noAnswer ? `; provider said: ${result.noAnswer}` : ''}${failed.length ? `; failed: ${failed.join(' | ')}` : ''}${result.error ? `; error: ${result.error.slice(0, 160)}` : ''}`)
        if (result.machineNetwork) {
          networkTries++
          networkInARow++
          console.log(`  this Mac's network failed (${result.machineNetwork}): not the provider, so not counted. Repeating (${networkTries} such try so far)`)
          if (networkInARow >= 3 || networkTries >= 8) {
            stopped = "this Mac's network failed three times in a row (or eight times in all): not a provider answer, so nothing was judged"
            break runs
          }
          await sleep(30_000)
          continue
        }
        networkInARow = 0
        inARow = result.verdict === 'no_answer' ? inARow + 1 : 0
        if (inARow >= 3) {
          stopped = 'three runs in a row got no answer from the provider'
          break runs
        }
        if (result.verdict !== 'no_answer' || repeatsLeft <= 0) break
        repeatsLeft--
        console.log(`  the provider gave no answer: repeating (${repeatsLeft} repeat(s) left)`)
      }
    }
  }

  writeFileSync(
    join(outDir, 'run.json'),
    `${clean(
      JSON.stringify(
        {
          runId: a.runId,
          finishedAt: new Date().toISOString(),
          cap: a.cap,
          spentAtStart: earlierMeta?.spentAtStart ?? spentAtStart,
          spentAtEnd: spent,
          repeatsAllowed: a.repeats,
          repeatsUsed: a.repeats - repeatsLeft,
          machineNetworkTries: networkTries,
          stopped,
          models: m,
          ...(earlier.length > 0 ? { resumedAt: [...(earlierMeta?.resumedAt ?? []), resumedAt], earlierStops: [...(earlierMeta?.earlierStops ?? []), ...(earlierMeta?.stopped ? [earlierMeta.stopped] : [])] } : {}),
        },
        null,
        2,
      ),
      secrets,
    ).text}\n`,
  )
  const last = new Map(tries.map((t) => [`${t.docId}|${t.n}`, t]))
  const verdicts = [...last.values()].map((t) => t.verdict)
  console.log(`passes=${verdicts.filter((v) => v === 'pass').length}; fails=${verdicts.filter((v) => v === 'fail').length}; no_answer=${verdicts.filter((v) => v === 'no_answer').length}; live_draft_map_runs_this_session=${spent - spentAtStart}; total_so_far=${spent} of ${a.cap}`)
  if (stopped) {
    console.log(`STOPPED: ${stopped}`)
    process.exitCode = 3
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'the unseen curriculum run failed')
  process.exitCode = 1
})
