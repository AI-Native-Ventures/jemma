import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** One line for every call that reached a model (or was tried by hand). The ledger is the counter of the live-call cap and the source of the cost report. */
export type LedgerRecord = {
  time: string
  model: string
  kind: 'outline' | 'write' | 'rewrite' | 'review' | 'probe'
  seconds: number
  tokensIn?: number
  tokensCached?: number
  tokensOut?: number
  costUsd?: number
  costEstimated?: boolean
  ok: boolean
  limited: boolean
  error?: string
  grade?: number
  topic?: string
  position?: number
}

export const ledgerPath = (root: string): string => join(root, 'content/lessons/ledger.jsonl')

export function appendLedger(root: string, record: LedgerRecord): void {
  const file = ledgerPath(root)
  mkdirSync(dirname(file), { recursive: true })
  appendFileSync(file, `${JSON.stringify(record)}\n`)
}

export function readLedger(root: string): LedgerRecord[] {
  const file = ledgerPath(root)
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as LedgerRecord)
}

export const sumCost = (records: LedgerRecord[]): number => records.reduce((n, r) => n + (r.costUsd ?? 0), 0)

export type ModelStats = { model: string; calls: number; failures: number; limited: number; avgSeconds: number; tokensIn: number; tokensCached: number; tokensOut: number; usd: number }

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places
const avgSeconds = (list: LedgerRecord[]) => {
  const timed = list.filter((r) => !r.limited && r.seconds > 0)
  return timed.length ? round(timed.reduce((n, r) => n + r.seconds, 0) / timed.length, 1) : 0
}
const totals = (list: LedgerRecord[]) => ({
  tokensIn: list.reduce((n, r) => n + (r.tokensIn ?? 0), 0),
  tokensCached: list.reduce((n, r) => n + (r.tokensCached ?? 0), 0),
  tokensOut: list.reduce((n, r) => n + (r.tokensOut ?? 0), 0),
  usd: round(sumCost(list), 4),
})

/** Per model: calls, calls that gave nothing usable, calls that hit a limit, the average seconds of the calls that were not cut off by it, tokens and dollars. */
export function summarize(records: LedgerRecord[]): ModelStats[] {
  const byModel = new Map<string, LedgerRecord[]>()
  for (const r of records) byModel.set(r.model, [...(byModel.get(r.model) ?? []), r])
  return [...byModel.entries()].map(([model, list]) => ({
    model,
    calls: list.length,
    failures: list.filter((r) => !r.ok && !r.limited).length,
    limited: list.filter((r) => r.limited).length,
    avgSeconds: avgSeconds(list),
    ...totals(list),
  }))
}

export type KindStats = { kind: string; calls: number; avgSeconds: number; tokensIn: number; tokensCached: number; tokensOut: number; usd: number }

/** Per kind of call (outline, write, rewrite, review): the same numbers, to see where the money goes. */
export function summarizeByKind(records: LedgerRecord[]): KindStats[] {
  const kinds = [...new Set(records.map((r) => r.kind))]
  return kinds.map((kind) => {
    const list = records.filter((r) => r.kind === kind)
    return { kind, calls: list.length, avgSeconds: avgSeconds(list), ...totals(list) }
  })
}
