import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { AttemptRecord, Check, Tokens } from './types'

export const RESULT_VERSION = 1

/** `evals/results`. */
export const RESULTS_ROOT = fileURLToPath(new URL('../results/', import.meta.url))

/** What one run saves in `<task id>-<n>.json`. EVALS.md is generated from these files and nothing else. */
export type ResultFile = {
  version: typeof RESULT_VERSION
  runId: string
  taskId: string
  n: number
  startedAt: string
  /** True when a fake goose ran instead of the real one (a harness rehearsal, never a live result). */
  rehearsal: boolean
  /** Seconds from starting the runner to the end of the agent run. */
  seconds: number
  /** Seconds from opening the sandbox to cleaning it up. */
  wallSeconds: number
  /**
   * The database round trip right before this run: the median of three small reads, in milliseconds. Null when the
   * measurement failed. Missing in files made before it was added. EVALS.md reports it so a slow line is visible.
   */
  dbRoundTripMs?: number | null
  /** Every check passed and the harness had no error. */
  pass: boolean
  /** A harness failure: the run could not be checked. Null when the checks ran. */
  error: string | null
  checks: Check[]
  event: { status: string; error: string | null } | null
  run: { status: string; note: string } | null
  attempts: AttemptRecord[]
  finalModel: string | null
  /** Tokens and cost goose reported, all attempts added up. */
  tokens: Tokens | null
  /** `server__tool` of each call, in order, with a suffix when the answer failed. */
  toolCalls: string[]
  reported: boolean | null
  /** What the checks read from the database and the reports folder. */
  facts: unknown
  /** The prepared state the checks compared with (ids, before snapshots). */
  state: unknown
  /** Things shown next to pass or fail, for example who stopped a banned word. */
  extras: Record<string, string | number | boolean | null>
  /** Goose runs that started (each attempt on a model counts). Zero for a rehearsal. */
  liveAttempts: number
  sandboxIds: string[]
  /** The stream file next to this one. */
  stream: string
  /** True when a secret or a local path had to be taken out of the saved text. */
  scrubbed: boolean
  /** Cleanup problems, if any. */
  cleanup: string[]
}

export const baseName = (taskId: string, n: number) => `${taskId}-${n}`

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** Reads and checks the shape of a result file. Throws a plain message naming the file. */
export function parseResult(text: string, where: string): ResultFile {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (err) {
    throw new Error(`${where}: not valid JSON (${err instanceof Error ? err.message : 'parse error'})`)
  }
  if (!isObj(raw)) throw new Error(`${where}: not a result object`)
  const bad = (what: string) => new Error(`${where}: ${what}`)
  if (raw.version !== RESULT_VERSION) throw bad(`version ${String(raw.version)} is not ${RESULT_VERSION}`)
  for (const key of ['runId', 'taskId', 'startedAt', 'stream'] as const) if (typeof raw[key] !== 'string') throw bad(`${key} is missing`)
  if (typeof raw.n !== 'number') throw bad('n is missing')
  if (typeof raw.pass !== 'boolean') throw bad('pass is missing')
  if (typeof raw.seconds !== 'number' || typeof raw.wallSeconds !== 'number') throw bad('seconds are missing')
  if (raw.dbRoundTripMs !== undefined && raw.dbRoundTripMs !== null && (typeof raw.dbRoundTripMs !== 'number' || !Number.isFinite(raw.dbRoundTripMs))) throw bad('dbRoundTripMs is not a number')
  if (!Array.isArray(raw.checks) || !raw.checks.every((c) => isObj(c) && typeof c.name === 'string' && typeof c.pass === 'boolean' && typeof c.detail === 'string')) throw bad('checks are malformed')
  if (!Array.isArray(raw.attempts) || !Array.isArray(raw.toolCalls)) throw bad('attempts or toolCalls are missing')
  if (!isObj(raw.extras)) throw bad('extras are missing')
  return raw as unknown as ResultFile
}

export function readResultFile(path: string): ResultFile {
  return parseResult(readFileSync(path, 'utf8'), path)
}
