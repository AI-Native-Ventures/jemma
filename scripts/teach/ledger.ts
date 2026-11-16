import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** One line for every call that reached a model (or was tried by hand). The ledger is the counter of the live-call cap and the source of the cost report. */
export type LedgerRecord = {
  time: string
  model: string
  kind: 'outline' | 'write' | 'rewrite' | 'review' | 'probe'
  seconds: number
  tokensIn?: number
  tokensOut?: number
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

export type ModelStats = { model: string; calls: number; failures: number; limited: number; avgSeconds: number; tokensIn: number; tokensOut: number }

/** Per model: calls, calls that gave nothing usable, calls that hit the free limit, and the average seconds of the calls that were not cut off by the limit. */
export function summarize(records: LedgerRecord[]): ModelStats[] {
  const byModel = new Map<string, LedgerRecord[]>()
  for (const r of records) byModel.set(r.model, [...(byModel.get(r.model) ?? []), r])
  return [...byModel.entries()].map(([model, list]) => {
    const timed = list.filter((r) => !r.limited && r.seconds > 0)
    return {
      model,
      calls: list.length,
      failures: list.filter((r) => !r.ok && !r.limited).length,
      limited: list.filter((r) => r.limited).length,
      avgSeconds: timed.length ? Math.round((timed.reduce((n, r) => n + r.seconds, 0) / timed.length) * 10) / 10 : 0,
      tokensIn: list.reduce((n, r) => n + (r.tokensIn ?? 0), 0),
      tokensOut: list.reduce((n, r) => n + (r.tokensOut ?? 0), 0),
    }
  })
}
