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
export type LedgerLine = { at: string; runId: string; taskId: string; n: number; attempts: number; rehearsal: boolean; kind?: LedgerKind }

export function readLedger(file = LEDGER_FILE): LedgerLine[] {
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as LedgerLine)
}

/** Live attempts spent so far on one kind (goose by default), or on one run id of that kind. Rehearsals with a fake are not counted. */
export function liveSpent(file = LEDGER_FILE, kind: LedgerKind = 'goose', runId?: string): number {
  return readLedger(file)
    .filter((l) => !l.rehearsal && (l.kind ?? 'goose') === kind && (runId === undefined || l.runId === runId))
    .reduce((n, l) => n + l.attempts, 0)
}

export function appendLedger(line: LedgerLine, file = LEDGER_FILE): void {
  mkdirSync(dirname(file), { recursive: true })
  appendFileSync(file, JSON.stringify(line) + '\n')
}
