/**
 * Writes EVALS.md from the saved results of one run and nothing else. Fails when an expected result file is missing.
 *
 *   pnpm evals:report                          the newest run folder in evals/results
 *   pnpm evals:report --run 2026-11-10-1432    a named run folder
 *   pnpm evals:report --refresh-price          read the model's price from OpenRouter again
 */
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { writeReport } from './lib/render'
import { RESULTS_ROOT } from './lib/result'

function newestRun(): string {
  const runs = readdirSync(RESULTS_ROOT).filter((f) => !f.startsWith('rehearsal-') && statSync(join(RESULTS_ROOT, f)).isDirectory()).sort()
  const last = runs.at(-1)
  if (!last) throw new Error('there is no run folder in evals/results')
  return last
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const runId = argv.includes('--run') ? argv[argv.indexOf('--run') + 1]! : newestRun()
  await writeReport({ runId, refreshPrice: argv.includes('--refresh-price') })
  console.log(`EVALS.md written from evals/results/${runId}`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'the report failed')
  process.exitCode = 1
})
