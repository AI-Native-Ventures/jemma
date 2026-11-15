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
  /** Which service gave goose its model. Missing means OpenRouter, as in every result saved before the local option. */
  provider?: 'openrouter' | 'ollama'
  /** Local runs only: the Ollama tag the run asked for. */
  model?: string
  /** Local runs only: the host Ollama answered on (this computer: 127.0.0.1) and its port. */
  host?: string
  port?: number
  /**
   * Local runs only: true when nothing in the run points at a cloud model (every attempt ran on the local tag, goose's
   * environment held no cloud key, the transcript names no cloud service, the host is this computer). False when something
   * did, and `cloudEvidence` says what. Null when no attempt ran, so nothing can be said.
   */
  noCloudModelCalled?: boolean | null
  /** Local runs only: what pointed at a cloud model, one plain line each. Empty when nothing did. */
  cloudEvidence?: string[]
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
  if (raw.provider !== undefined && raw.provider !== 'openrouter' && raw.provider !== 'ollama') throw bad('provider is not openrouter or ollama')
  for (const key of ['model', 'host'] as const) if (raw[key] !== undefined && typeof raw[key] !== 'string') throw bad(`${key} is not text`)
  if (raw.port !== undefined && typeof raw.port !== 'number') throw bad('port is not a number')
  if (raw.noCloudModelCalled !== undefined && raw.noCloudModelCalled !== null && typeof raw.noCloudModelCalled !== 'boolean') throw bad('noCloudModelCalled is not true, false or null')
  if (raw.cloudEvidence !== undefined && (!Array.isArray(raw.cloudEvidence) || !raw.cloudEvidence.every((l) => typeof l === 'string'))) throw bad('cloudEvidence is not a list of lines')
  return raw as unknown as ResultFile
}

export function readResultFile(path: string): ResultFile {
  return parseResult(readFileSync(path, 'utf8'), path)
}
