import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { median } from './checks'
import { readLedger } from './ledger'
import { baseName, parseResult, RESULTS_ROOT, type ResultFile } from './result'
import { RUNS_PER_TASK, TASKS } from '../tasks'

/**
 * EVALS.md is made here, from the result files in `evals/results/<run id>/` and nothing else. Every number and every
 * pass or fail comes from those files. The one hand-written part is `analysis.json` (why the weakest task probably
 * failed, and what to try next); the generator checks it is about the task the results say is weakest.
 */

export const EVALS_FILE = fileURLToPath(new URL('../../EVALS.md', import.meta.url))
export const MODELS_URL = 'https://openrouter.ai/api/v1/models'

export class MissingResultsError extends Error {
  constructor(public readonly missing: string[]) {
    super(`cannot write EVALS.md: ${missing.length} expected result file(s) are missing:\n  ${missing.join('\n  ')}`)
    this.name = 'MissingResultsError'
  }
}

export type TaskInfo = { id: string; proves: string }
export type ModelPrice = { paidId: string | null; promptPerM: number | null; completionPerM: number | null; freeListed: boolean }
export type PricingInfo = { fetchedAt: string; source: string; models: Record<string, ModelPrice> }
export type Analysis = { taskId: string; why: string; tryNext: string[] }
/** A change made to the test set while the runs were going (written by the author in `changes.json`, shown as it is). */
export type Change = { taskId: string; what: string; why: string; evidence: string }
export type ReportInput = {
  runId: string
  results: ResultFile[]
  tasks: TaskInfo[]
  runs: number
  pricing: PricingInfo | null
  /** Why there is no pricing, when there is none. */
  pricingError?: string | null
  analysis: Analysis | null
  /** Changes made while the runs were going. Null or empty when there were none. */
  changes?: Change[] | null
  /** Goose runs spent for the whole packet, from the ledger (harness tuning included). Null when unknown. */
  packetLiveRuns: number | null
}

/** Reads every expected result file of a run, or throws naming each one that is missing. */
export function loadResults(dir: string, tasks: TaskInfo[], runs: number): ResultFile[] {
  const missing: string[] = []
  const out: ResultFile[] = []
  for (const t of tasks) {
    for (let n = 1; n <= runs; n++) {
      const json = join(dir, `${baseName(t.id, n)}.json`)
      const stream = join(dir, `${baseName(t.id, n)}.jsonl`)
      if (!existsSync(json)) missing.push(`${baseName(t.id, n)}.json`)
      if (!existsSync(stream)) missing.push(`${baseName(t.id, n)}.jsonl`)
      if (!existsSync(json)) continue
      const result = parseResult(readFileSync(json, 'utf8'), json)
      if (result.taskId !== t.id || result.n !== n) throw new Error(`${json}: holds task ${result.taskId} run ${result.n}`)
      out.push(result)
    }
  }
  if (missing.length) throw new MissingResultsError(missing)
  return out
}

// ---------- numbers ----------

const num = (n: number) => Math.round(n).toLocaleString('en-US')
const money = (n: number) => (n === 0 ? '$0' : `$${n < 0.01 ? n.toFixed(4) : n.toFixed(2)}`)
const secs = (n: number) => `${Math.round(n)} s`
const dash = String.fromCharCode(0x2014)

const byTask = (results: ResultFile[], id: string) => results.filter((r) => r.taskId === id).sort((a, b) => a.n - b.n)

type Summary = {
  id: string
  proves: string
  runs: ResultFile[]
  passes: number
  medianSeconds: number
  medianIn: number
  medianOut: number
  failedChecks: number
  errors: number
  caught: number
  fallbacks: number
}

/** The safety net acted: a save tool dropped something the model wrote, or an evidence id was not real. */
export const caughtBy = (r: ResultFile): boolean => {
  const e = r.extras
  return Number(e.droppedByTool ?? 0) > 0 || Number(e.invalidIdsFromModel ?? 0) > 0 || e.whoStayedClean === 'save_tool_dropped'
}

export function summarize(input: Pick<ReportInput, 'results' | 'tasks'>): Summary[] {
  return input.tasks.map((t) => {
    const runs = byTask(input.results, t.id)
    return {
      id: t.id,
      proves: t.proves,
      runs,
      passes: runs.filter((r) => r.pass).length,
      medianSeconds: median(runs.map((r) => r.seconds)),
      medianIn: median(runs.map((r) => r.tokens?.input ?? 0)),
      medianOut: median(runs.map((r) => r.tokens?.output ?? 0)),
      failedChecks: runs.reduce((n, r) => n + r.checks.filter((c) => !c.pass).length, 0),
      errors: runs.filter((r) => r.error).length,
      caught: runs.filter(caughtBy).length,
      fallbacks: runs.filter((r) => r.attempts.length > 1).length,
    }
  })
}

/**
 * The task with the worst real result: fewest passes; then most failed checks; and when every task passed every run,
 * the weakest signal: where the save tool had to catch the model most often, then the slowest median.
 */
export function pickWeakest(summaries: Summary[], runs: number): { task: Summary; allPassed: boolean; reason: string } {
  const allPassed = summaries.every((s) => s.passes === s.runs.length)
  const order = [...summaries].sort(
    (a, b) => a.passes - b.passes || b.failedChecks - a.failedChecks || b.errors - a.errors || (allPassed ? b.caught - a.caught || b.medianSeconds - a.medianSeconds : 0),
  )
  const task = order[0]!
  const reason = allPassed
    ? task.caught > 0
      ? `every task passed ${runs} of ${runs}, so this is the weakest signal: the save tool had to catch the model in ${task.caught} of ${runs} runs`
      : `every task passed ${runs} of ${runs}, so this is the weakest signal: the slowest task (median ${secs(task.medianSeconds)})`
    : `it has the worst real result: ${task.passes} of ${task.runs.length} runs passed`
  return { task, allPassed, reason }
}

// ---------- cost ----------

type Cost = { paidTotal: number; perRun: number[]; unpriced: { model: string; tokens: number }[]; freeReported: number; runsCounted: number }

export function costOf(results: ResultFile[], pricing: PricingInfo | null): Cost {
  const unpriced = new Map<string, number>()
  let paidTotal = 0
  const perRun = results.map((r) => {
    let cost = 0
    for (const a of r.attempts) {
      if (!a.tokens) continue
      const price = pricing?.models[a.model]
      if (price && price.promptPerM !== null && price.completionPerM !== null) cost += (a.tokens.input * price.promptPerM + a.tokens.output * price.completionPerM) / 1e6
      else if (a.tokens.input + a.tokens.output > 0) unpriced.set(a.model, (unpriced.get(a.model) ?? 0) + a.tokens.input + a.tokens.output)
    }
    paidTotal += cost
    return cost
  })
  return {
    paidTotal,
    perRun,
    unpriced: [...unpriced].map(([model, tokens]) => ({ model, tokens })),
    freeReported: results.reduce((n, r) => n + (r.tokens?.costUsd ?? 0), 0),
    runsCounted: results.length,
  }
}

// ---------- pricing ----------

export async function fetchPricing(models: string[], fetchFn: typeof fetch = fetch, now: Date = new Date()): Promise<PricingInfo> {
  const res = await fetchFn(MODELS_URL)
  if (!res.ok) throw new Error(`OpenRouter answered ${res.status}`)
  const body = (await res.json()) as { data?: { id: string; pricing?: { prompt?: string; completion?: string } }[] }
  const byId = new Map((body.data ?? []).map((m) => [m.id, m]))
  const out: Record<string, ModelPrice> = {}
  for (const model of models) {
    const paidId = model.replace(/:free$/, '')
    const paid = byId.get(paidId)
    const per = (v: string | undefined) => (v !== undefined && Number.isFinite(Number(v)) ? Number((Number(v) * 1e6).toPrecision(12)) : null)
    out[model] = { paidId: paid ? paidId : null, promptPerM: paid ? per(paid.pricing?.prompt) : null, completionPerM: paid ? per(paid.pricing?.completion) : null, freeListed: byId.has(model) }
  }
  return { fetchedAt: now.toISOString().slice(0, 10), source: MODELS_URL, models: out }
}

// ---------- markdown ----------

const cell = (text: string) => text.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim()
const failedNames = (r: ResultFile) => r.checks.filter((c) => !c.pass)

/** Why the runs of a task did not all agree, or null when they did. */
function variation(s: Summary): string | null {
  const reasons: string[] = []
  const passes = s.runs.map((r) => r.pass)
  if (new Set(passes).size > 1) {
    reasons.push(
      s.runs
        .filter((r) => !r.pass)
        .map((r) => `run ${r.n} failed (${r.error ? `harness error: ${cell(r.error).slice(0, 120)}` : failedNames(r).map((c) => c.name).join('; ')})`)
        .join('; '),
    )
  }
  const sets = s.runs.map((r) => failedNames(r).map((c) => c.name).sort().join('|'))
  if (new Set(passes).size === 1 && new Set(sets).size > 1) reasons.push(`the same pass or fail, but different checks failed: ${s.runs.map((r) => `run ${r.n}: ${failedNames(r).map((c) => c.name).join('; ') || 'none'}`).join(' / ')}`)
  if (new Set(s.runs.map((r) => r.finalModel ?? 'none')).size > 1) reasons.push(`different models finished the job (${s.runs.map((r) => `run ${r.n}: ${r.finalModel ?? 'none'}`).join(', ')})`)
  if (new Set(s.runs.map((r) => r.attempts.length)).size > 1) reasons.push(`a different number of goose attempts (${s.runs.map((r) => `run ${r.n}: ${r.attempts.length}`).join(', ')})`)
  const outcomes = new Set(s.runs.map((r) => String(r.extras.whoStayedClean ?? '')).filter(Boolean))
  if (outcomes.size > 1) reasons.push(`who stopped the bad wording differed (${s.runs.map((r) => `run ${r.n}: ${String(r.extras.whoStayedClean).replace(/_/g, ' ')}`).join(', ')})`)
  const sequences = new Set(s.runs.map((r) => r.toolCalls.join('>')))
  if (reasons.length === 0 && sequences.size > 1) reasons.push(`the same result, reached with different tool calls (${s.runs.map((r) => `run ${r.n}: ${r.toolCalls.length} calls`).join(', ')})`)
  return reasons.length ? reasons.join('; ') : null
}

/** What the safety net did in the runs of one task, in plain words. Null when there is nothing to say. */
function netNote(r: ResultFile): string | null {
  const e = r.extras
  if (e.whoStayedClean !== undefined) {
    const who = String(e.whoStayedClean)
    const dropped = Number(e.droppedByTool ?? 0)
    if (who === 'model_clean') return 'the model stayed clean on its own, so the save tool had nothing to drop'
    if (who === 'save_tool_dropped') return `the model wrote the wrong wording and the save tool dropped ${dropped} pattern(s)${e.droppedReasons ? ` (${cell(String(e.droppedReasons)).slice(0, 120)})` : ''}`
    if (who === 'no_save') return 'the model never saved anything'
    return 'the note\'s wording reached the save tool and was not caught'
  }
  const bits: string[] = []
  if (Number(e.droppedByTool ?? 0) > 0) bits.push(`the save tool dropped ${e.droppedByTool} pattern(s) the model wrote`)
  if (Number(e.invalidIdsFromModel ?? 0) > 0) bits.push(`${e.invalidIdsFromModel} of ${e.idsFromModel} evidence ids from the model were not real`)
  if (e.modelListed !== undefined && Number(e.modelListed) > 0 && e.droppedByTool === undefined) bits.push(`the model listed ${e.modelListed} pattern(s)`)
  if (e.triedOutsideMd === true) bits.push('the model tried to write outside the reports folder')
  if (e.triedRecipe === true) bits.push('the model tried to read the recipe file')
  if (e.firstAttemptSaid) bits.push(`the first model said: ${cell(String(e.firstAttemptSaid))}`)
  if (e.answersReadExactly !== undefined) bits.push(`${e.answersReadExactly} of ${e.answersExpected} answers read exactly as written, total read ${e.totalRead ?? 'none'}`)
  return bits.length ? bits.join('; ') : null
}

export function renderReport(input: ReportInput): string {
  const { results, tasks, runs, runId } = input
  const sums = summarize(input)
  const total = results.length
  const passed = results.filter((r) => r.pass).length
  const models = [...new Set(results.flatMap((r) => r.attempts.filter((a) => (a.tokens?.input ?? 0) > 0).map((a) => a.model)))]
  const attempts = results.reduce((n, r) => n + r.attempts.length, 0)
  const rehearsal = results.some((r) => r.rehearsal)
  const changes = input.changes ?? []
  const lines: string[] = []
  const push = (...l: string[]) => lines.push(...l)

  push('# Evals', '')
  push(`This file is generated by \`pnpm evals:report\` from the files in \`evals/results/${runId}/\`. Do not edit it by hand: every pass, fail and number below comes from those files. The only hand-written text is the explanation and the next steps in "One failure we did not fix" (\`analysis.json\` in the same folder).`, '')
  if (rehearsal) push('**These results come from a rehearsal with a fake goose. No model ran. They prove nothing about the agent.**', '')

  push('## What is tested, and how', '')
  push(
    `${tasks.length} test tasks run the real agent path: each run opens its own fresh sandbox (a made-up school) on the database, sends the real event through the agent worker, and runs the job through Jemma's runner with Goose and a free open-weights model on OpenRouter (${models.length ? models.map((m) => `\`${m}\``).join(', ') : 'no model ran'}; the runner's own fallback to the next model stays on). Then plain code checks the outcome with SELECTs and the saved transcript. No model ever judges another model. Every check is a named yes or no with a reason, saved in the result file. Each task ran ${runs} times, in ${runs} fresh sandboxes, one after another, so run-to-run variation shows. A run that hits a provider error counts as a failed run with the error text kept. ${changes.length ? 'Apart from the changes listed in "Changes made while the runs were going", nothing was retried, dropped or hand-edited.' : 'Nothing was retried, dropped or hand-edited.'} The data is synthetic.`,
    '',
  )
  push(`**${passed} of ${total} runs passed** (${total - passed} failed). ${attempts} goose attempts were made for these ${total} runs${input.packetLiveRuns !== null ? `; ${input.packetLiveRuns} live goose runs were spent in all for this work, harness testing included (cap 45)` : ''}.`, '')

  push('## Results', '')
  push('| Task | What it proves | Run 1 | Run 2 | Run 3 | Median seconds | Tokens in / out (median) |', '| --- | --- | --- | --- | --- | ---: | ---: |')
  for (const s of sums) {
    const cells: string[] = Array.from({ length: runs }, (_, i) => {
      const r = s.runs[i]
      return r ? (r.pass ? 'pass' : 'fail') : 'missing'
    })
    while (cells.length < 3) cells.push('')
    push(`| \`${s.id}\` | ${cell(s.proves)} | ${cells.slice(0, 3).join(' | ')} | ${num(s.medianSeconds)} | ${num(s.medianIn)} / ${num(s.medianOut)} |`)
  }
  push('', `Seconds are the job time, from starting the runner to the end of the goose run. Tokens are what Goose reported for the whole run, all turns added up.`, '')

  const failures = sums.flatMap((s) => s.runs.filter((r) => !r.pass).map((r) => ({ s, r })))
  push('### Failed checks', '')
  if (failures.length === 0) push('None. Every check passed in every run.', '')
  else {
    for (const s of sums) {
      const bad = s.runs.filter((r) => !r.pass)
      if (bad.length === 0) continue
      push(`- \`${s.id}\`:`)
      const names = new Map<string, { runs: number[]; detail: string }>()
      for (const r of bad) {
        if (r.error) names.set(`harness error: ${cell(r.error).slice(0, 140)}`, { runs: [...(names.get(`harness error: ${cell(r.error).slice(0, 140)}`)?.runs ?? []), r.n], detail: '' })
        for (const c of failedNames(r)) names.set(c.name, { runs: [...(names.get(c.name)?.runs ?? []), r.n], detail: names.get(c.name)?.detail ?? c.detail })
      }
      for (const [name, v] of names) push(`  - ${cell(name)} (run${v.runs.length > 1 ? 's' : ''} ${v.runs.join(', ')})${v.detail ? `: ${cell(v.detail).slice(0, 220)}` : ''}`)
    }
    push('')
  }

  const notes = sums.flatMap((s) => s.runs.map((r) => ({ s, r, note: netNote(r) }))).filter((x) => x.note)
  push('### What the system caught, and what the model did', '')
  if (notes.length === 0) push('Nothing to report from the extra fields of the runs.', '')
  else {
    push('| Task | Run | What happened |', '| --- | --- | --- |')
    for (const { s, r, note } of notes) push(`| \`${s.id}\` | ${r.n} | ${cell(note!)} |`)
    push('')
  }

  // cost
  const cost = costOf(results, input.pricing)
  push('## Cost', '')
  const per = [...cost.perRun].sort((a, b) => a - b)
  const priced = results.flatMap((r) => r.attempts.map((a) => a.model)).filter((m) => input.pricing?.models[m]?.promptPerM != null)
  const firstPriced = input.pricing && [...new Set(priced)].map((m) => ({ m, p: input.pricing!.models[m]! }))
  const costText: string[] = []
  const allFree = models.length > 0 && models.every((m) => m.endsWith(':free'))
  costText.push(`On the free tier the actual cost was ${money(cost.freeReported)}: Goose reported a cost of ${money(cost.freeReported)} across the ${total} runs${allFree ? ', and every model used is a free (\`:free\`) listing' : `; the models used were ${models.map((m) => `\`${m}\``).join(', ')}`}.`)
  if (input.pricing && firstPriced && firstPriced.length > 0) {
    const listing = firstPriced.map(({ m, p }) => `\`${p.paidId}\` at ${money(p.promptPerM!)} per million input tokens and ${money(p.completionPerM!)} per million output tokens`).join('; ')
    costText.push(`At the listed paid price (${listing}, read from OpenRouter's public models endpoint on ${input.pricing.fetchedAt}), these ${total} runs would have cost about ${money(cost.paidTotal)} in all. That is about ${money(cost.paidTotal / Math.max(1, cost.runsCounted))} per run, from ${money(per[0] ?? 0)} to ${money(per.at(-1) ?? 0)}. The median run used ${num(median(results.map((r) => r.tokens?.input ?? 0)))} tokens in and ${num(median(results.map((r) => r.tokens?.output ?? 0)))} out.`)
  } else if (input.pricing) {
    costText.push(`OpenRouter's public models endpoint (read on ${input.pricing.fetchedAt}) lists no paid version of ${models.map((m) => `\`${m}\``).join(', ') || 'the model'}, so there is no paid price to multiply by. The median run used ${num(median(results.map((r) => r.tokens?.input ?? 0)))} tokens in and ${num(median(results.map((r) => r.tokens?.output ?? 0)))} out.`)
  } else {
    costText.push(`The listed paid price could not be read${input.pricingError ? ` (${cell(input.pricingError)})` : ''}, so no paid estimate is given. The median run used ${num(median(results.map((r) => r.tokens?.input ?? 0)))} tokens in and ${num(median(results.map((r) => r.tokens?.output ?? 0)))} out.`)
  }
  if (cost.unpriced.length) costText.push(`Tokens from models with no listed paid price are left out of the estimate: ${cost.unpriced.map((u) => `\`${u.model}\` (${num(u.tokens)} tokens)`).join(', ')}.`)
  push(costText.join(' '), '')

  push('## Variation', '')
  const varied = sums.map((s) => ({ s, why: variation(s) })).filter((x) => x.why)
  if (varied.length === 0) push(`All ${runs} runs of every task agreed on pass or fail and on how they got there.`, '')
  else {
    push(`${varied.length} of ${sums.length} tasks did not behave the same in all ${runs} runs:`, '')
    for (const { s, why } of varied) push(`- \`${s.id}\` (${s.passes} of ${s.runs.length} passed): ${why}`)
    push('')
  }
  const trips = results.map((r) => r.dbRoundTripMs).filter((v): v is number => typeof v === 'number')
  if (trips.length > 0) push(`Median database round trip during these runs: ${num(median(trips))} ms (lowest ${num(Math.min(...trips))}, highest ${num(Math.max(...trips))}).`, '')
  const spread = sums.map((s) => ({ s, min: Math.min(...s.runs.map((r) => r.seconds)), max: Math.max(...s.runs.map((r) => r.seconds)) })).sort((a, b) => b.max - b.min - (a.max - a.min))[0]
  if (spread) push(`Time varied too: the widest spread inside one task was \`${spread.s.id}\`, from ${secs(spread.min)} to ${secs(spread.max)} for the same job.`, '')

  if (changes.length) {
    push('## Changes made while the runs were going', '')
    push('These were written by the author when it happened, and are shown as written. A task that was run again, or judged again, keeps its earlier results in the folder named under "Kept".', '')
    for (const c of changes) push(`- \`${c.taskId}\`: ${c.what.trim()} Why: ${c.why.trim()} Kept: ${c.evidence.trim()}`)
    push('')
  }

  push('## One failure we did not fix', '')
  const weakest = pickWeakest(sums, runs)
  const w = weakest.task
  push(`Task \`${w.id}\`: ${weakest.reason}. It was not fixed.`, '')
  push('What happened:', '')
  for (const r of w.runs) {
    const bad = failedNames(r)
    push(`- Run ${r.n}: ${r.pass ? 'pass' : 'fail'}. Event ${r.event?.status ?? 'unknown'}${r.event?.error ? ` (${cell(r.event.error).slice(0, 200)})` : ''}. ${r.error ? `Harness error: ${cell(r.error).slice(0, 200)}. ` : ''}${bad.length ? `Failed checks: ${bad.map((c) => `"${cell(c.name)}" (${cell(c.detail).slice(0, 200)})`).join('; ')}. ` : ''}Tool calls: ${r.toolCalls.length ? r.toolCalls.join(', ') : 'none'}. Transcript: \`evals/results/${runId}/${r.stream}\`.`)
  }
  push('')
  if (input.analysis && input.analysis.taskId === w.id) {
    push('Why it probably happens (written by the author after reading the transcripts):', '', input.analysis.why.trim(), '', 'What to try next:', '')
    input.analysis.tryNext.forEach((step, i) => push(`${i + 1}. ${step.trim()}`))
    push('')
  } else {
    push('_No explanation has been written for this task yet._', '')
  }

  push('## How to run it yourself', '')
  const wall = results.reduce((n, r) => n + r.wallSeconds, 0)
  push(
    `One command: \`pnpm evals\`. It starts its own agent worker on port 8756, runs all ${tasks.length} tasks ${runs} times each, stops the worker, cleans up every sandbox and token it made, and writes this file with \`pnpm evals:report\`. It needs Goose installed, a free OpenRouter key as \`OPENROUTER_API_KEY\` in \`.env.local\`, and the database values in \`.env.local\` (\`./start.sh\` writes them for a local database; the saved run used the team's dev database, and the local one was not tried). The saved run took about ${Math.round(wall / 60)} minutes for ${total} runs. Free models can be busy: if the model is down, wait and run again. \`pnpm evals --task class-report\` runs one task, and \`pnpm evals --rehearse done\` tests the harness with a fake goose and no model. Details: \`evals/README.md\`.`,
    '',
  )
  push('## Raw results', '')
  push(`\`evals/results/${runId}/\`: for each run \`<task>-<n>.json\` (the checks, the facts they read, the event, the attempts, the tokens) and \`<task>-<n>.jsonl\` (the agent's own stream, with the bearer token, the key and local paths taken out). \`evals/results/ledger.jsonl\` counts every live goose run.`, '')

  const text = lines.join('\n')
  if (text.includes(dash)) throw new Error('the report holds an em dash')
  return `${text.trimEnd()}\n`
}

export type WriteOptions = { runId: string; resultsRoot?: string; outFile?: string; refreshPrice?: boolean; fetchFn?: typeof fetch }

/** Loads the run, reads or fetches the price, and writes EVALS.md. Fails when an expected result file is missing. */
export async function writeReport(opts: WriteOptions): Promise<string> {
  const dir = join(opts.resultsRoot ?? RESULTS_ROOT, opts.runId)
  const tasks = TASKS.map((t) => ({ id: t.id, proves: t.proves }))
  const results = loadResults(dir, tasks, RUNS_PER_TASK)
  const models = [...new Set(results.flatMap((r) => r.attempts.map((a) => a.model)))]
  const priceFile = join(dir, 'pricing.json')
  let pricing: PricingInfo | null = null
  let pricingError: string | null = null
  if (existsSync(priceFile) && !opts.refreshPrice) pricing = JSON.parse(readFileSync(priceFile, 'utf8')) as PricingInfo
  if (!pricing || models.some((m) => !(m in pricing!.models))) {
    try {
      pricing = await fetchPricing(models, opts.fetchFn)
      writeFileSync(priceFile, JSON.stringify(pricing, null, 2) + '\n')
    } catch (err) {
      pricingError = err instanceof Error ? err.message : String(err)
    }
  }
  const analysisFile = join(dir, 'analysis.json')
  const analysis = existsSync(analysisFile) ? (JSON.parse(readFileSync(analysisFile, 'utf8')) as Analysis) : null
  const sums = summarize({ results, tasks })
  const weakest = pickWeakest(sums, RUNS_PER_TASK).task
  if (analysis && analysis.taskId !== weakest.id) {
    throw new Error(`analysis.json is about \`${analysis.taskId}\`, but the weakest task in these results is \`${weakest.id}\`. Rewrite analysis.json for \`${weakest.id}\`.`)
  }
  const changesFile = join(dir, 'changes.json')
  const changes = existsSync(changesFile) ? (JSON.parse(readFileSync(changesFile, 'utf8')) as Change[]) : null
  const ledger = readLedger()
  const text = renderReport({ runId: opts.runId, results, tasks, runs: RUNS_PER_TASK, pricing, pricingError, analysis, changes, packetLiveRuns: ledger.length ? ledger.filter((l) => !l.rehearsal).reduce((n, l) => n + l.attempts, 0) : null })
  writeFileSync(opts.outFile ?? EVALS_FILE, text)
  return text
}
