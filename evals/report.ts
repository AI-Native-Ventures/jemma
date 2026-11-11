/**
 * Writes EVALS.md from the saved results and nothing else. Fails when an expected result file of the main run is missing.
 *
 *   pnpm evals:report                          the main run is the newest folder in evals/results that covers every task
 *   pnpm evals:report --run 2026-11-10-1432    a named run folder as the main run
 *   pnpm evals:report --refresh-price          read the models' prices from OpenRouter again
 *
 * Every other run folder (a different model, usually one task) gets a row in "A second open-weights model on one task".
 * A folder that covers only some tasks never becomes the main run.
 */
import { writeReport } from './lib/render'
import { RESULTS_ROOT } from './lib/result'
import { chooseMainRun, listRunFolders } from './lib/second'
import { TASK_IDS } from './tasks'

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const runId = chooseMainRun(listRunFolders(RESULTS_ROOT), TASK_IDS, argv.includes('--run') ? argv[argv.indexOf('--run') + 1] : undefined)
  await writeReport({ runId, refreshPrice: argv.includes('--refresh-price') })
  console.log(`EVALS.md written from evals/results/${runId}`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'the report failed')
  process.exitCode = 1
})
