/**
 * Judges the saved runs of one task again with the task's current checks, without calling a model. Used when a check
 * turned out to have flagged something harmless. The run itself is not changed (same stream, same facts), only
 * `checks`, `pass` and `extras`, and each file keeps the earlier verdict in `rescored`. The original files are
 * copied into `superseded/<name>/` in the run folder first.
 *
 *   pnpm --filter @jemma/runner exec node --import tsx --import ../profiling/scripts/register-md.mjs ../../evals/rescore.ts \
 *     --run-id 2026-11-10-full --task file-server-confined --keep-as file-server-confined-second-pass --why "the check read a harmless write as an escape"
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { clean } from './lib/redact'
import { baseName, readResultFile, RESULTS_ROOT } from './lib/result'
import { rescore } from './lib/rescore'
import { RUNS_PER_TASK, taskById } from './tasks'

function main(): void {
  const argv = process.argv.slice(2)
  const value = (flag: string) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : undefined)
  const runId = value('--run-id')
  const taskId = value('--task')
  const keepAs = value('--keep-as')
  const why = value('--why')
  if (!runId || !taskId || !keepAs || !why) throw new Error('needs --run-id, --task, --keep-as and --why')
  const task = taskById(taskId)
  if (!task) throw new Error(`no task called ${taskId}`)
  const dir = join(RESULTS_ROOT, runId)
  const keep = join(dir, 'superseded', keepAs)
  if (existsSync(keep)) throw new Error(`${keep} already exists: nothing is overwritten`)
  const planned = Array.from({ length: RUNS_PER_TASK }, (_, i) => {
    const json = join(dir, `${baseName(taskId, i + 1)}.json`)
    const stream = join(dir, `${baseName(taskId, i + 1)}.jsonl`)
    return { n: i + 1, json, stream, result: readResultFile(json), streamText: readFileSync(stream, 'utf8') }
  })
  // judge first, write after, so one refused file leaves everything as it was
  const judged = planned.map((p) => ({ ...p, after: rescore(p.result, p.streamText, task, why) }))
  mkdirSync(keep, { recursive: true })
  for (const p of judged) {
    copyFileSync(p.json, join(keep, `${baseName(taskId, p.n)}.json`))
    copyFileSync(p.stream, join(keep, `${baseName(taskId, p.n)}.jsonl`))
    writeFileSync(p.json, `${clean(JSON.stringify(p.after, null, 2), []).text}\n`)
    console.log(`${taskId} run ${p.n}: ${p.result.pass ? 'pass' : 'fail'} -> ${p.after.pass ? 'pass' : 'fail'}`)
  }
}

try {
  main()
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : 'the rescore failed')
  process.exitCode = 1
}
