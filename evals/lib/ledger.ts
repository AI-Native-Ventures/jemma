import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { RESULTS_ROOT } from './result'

/**
 * A count of every live goose run this packet has started, kept in `evals/results/ledger.jsonl` so the cap of live
 * agent runs holds across restarts. One line per run: when, which run, which task, how many goose attempts.
 */
export const LEDGER_FILE = join(RESULTS_ROOT, 'ledger.jsonl')

/**
 * `kind` says what was counted: a goose run (`goose`, and the default for lines written before the field existed) or a live
 * call of the curriculum reader (`draft_map`). Each kind has its own total and its own cap.
 */
export type LedgerKind = 'goose' | 'draft_map'
/** Which model service a line was spent on. A line with no `provider` (every line written before the field) is OpenRouter. */
export type LedgerProvider = 'openrouter' | 'ollama'
export type LedgerLine = { at: string; runId: string; taskId: string; n: number; attempts: number; rehearsal: boolean; kind?: LedgerKind; provider?: LedgerProvider }

/** The most live goose runs on OpenRouter (the free models), and the most runs on a model on this computer (Ollama). Each has its own count. */
export const LIVE_CAP = 45
export const LOCAL_CAP = 6

export function readLedger(file = LEDGER_FILE): LedgerLine[] {
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as LedgerLine)
}

/**
 * Live attempts spent so far on one kind (goose by default), or on one run id of that kind, on one provider (OpenRouter by
 * default, so the cap of 45 never counts a local run). Rehearsals with a fake are not counted.
 */
export function liveSpent(file = LEDGER_FILE, kind: LedgerKind = 'goose', runId?: string, provider: LedgerProvider = 'openrouter'): number {
  return readLedger(file)
    .filter((l) => !l.rehearsal && (l.kind ?? 'goose') === kind && (l.provider ?? 'openrouter') === provider && (runId === undefined || l.runId === runId))
    .reduce((n, l) => n + l.attempts, 0)
}

/**
 * The ledger line of one finished run. A run on an OpenRouter model is written exactly as it always was; a run on a model on
 * this computer carries `provider: "ollama"`, which keeps it out of the count against the cap of 45.
 */
export function ledgerLine(run: { at: string; runId: string; taskId: string; n: number; attempts: number; local: boolean }): LedgerLine {
  return { at: run.at, runId: run.runId, taskId: run.taskId, n: run.n, attempts: run.attempts, rehearsal: false, ...(run.local ? { provider: 'ollama' as const } : {}) }
}

export function appendLedger(line: LedgerLine, file = LEDGER_FILE): void {
  mkdirSync(dirname(file), { recursive: true })
  appendFileSync(file, JSON.stringify(line) + '\n')
}
