import type { z } from 'zod'
import { extractJson, runOpencode, type RunResult, type Runner } from './opencode'

/** The ranked list (owner, 16 Nov 2026): OpenCode free open-weights models, best first by Artificial Analysis score. */
export const DEFAULT_MODELS = [
  'opencode/hy4-flash-free',
  'opencode/inkling-2-small-free',
  'opencode/minimax-m3.1-flash-free',
  'opencode/deepseek-v4.1-flash-free',
  'opencode/glm-5.3-flash-free',
  'opencode/mimo-v2.6-flash-free',
  'opencode/beam-free',
  'opencode/flint-40b-free',
  'opencode/longcat-2.5-free',
  'opencode/nemotron-3.5-lightning-free',
]

/** A model that answered "Free usage limit reached" is left alone for an hour. */
export const LIMIT_PARK_MS = 60 * 60 * 1000
/** A model that crashes or times out this many times in a row is left alone for a quarter of an hour. */
export const FAILURE_STREAK = 4
export const FAILURE_PARK_MS = 15 * 60 * 1000

/** A backend that cannot go on at all (no credit left, the key is refused): the run stops, no other model is tried. */
export class FatalBackendError extends Error {}

const BANNED = /iceman|big-pickle|jev-/i

/** `TEACH_MODELS` (a comma list) or the default chain. Only OpenCode free models are accepted: never another provider, never a paid or banned one. */
export function modelsFromEnv(env: Record<string, string | undefined> = process.env): string[] {
  const list = (env.TEACH_MODELS ?? '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean)
  if (list.length === 0) return [...DEFAULT_MODELS]
  for (const m of list) {
    if (!m.startsWith('opencode/')) throw new Error(`TEACH_MODELS: ${m} is not an OpenCode model (only opencode/<name>-free is used)`)
    if (BANNED.test(m)) throw new Error(`TEACH_MODELS: ${m} is not allowed`)
    if (!m.endsWith('-free')) throw new Error(`TEACH_MODELS: ${m} is not a free model`)
  }
  return list
}

/** The models in rank order, with the ones that are resting set aside. The clock can be replaced in a test. */
export class Chain {
  private readonly parkedUntil = new Map<string, number>()
  private readonly streak = new Map<string, number>()

  constructor(
    readonly models: string[],
    private readonly now: () => number = Date.now,
    /** How long a model rests after "limit reached" (an hour for OpenCode's free models, a couple of minutes for a paid rate limit). */
    readonly limitParkMs: number = LIMIT_PARK_MS,
  ) {}

  /** The best model that is not excluded and not resting, or null. `prefer` is tried before the rest when it is in the chain and free. */
  next(exclude: string[] = [], prefer?: string): string | null {
    const t = this.now()
    const free = (m: string) => !exclude.includes(m) && (this.parkedUntil.get(m) ?? 0) <= t
    if (prefer && this.models.includes(prefer) && free(prefer)) return prefer
    return this.models.find(free) ?? null
  }

  park(model: string, ms: number): void {
    this.parkedUntil.set(model, this.now() + ms)
  }

  /** When the first resting model (not excluded) can be used again, as a clock time in ms. Null when none of them is resting. */
  nextAvailableAt(exclude: string[] = []): number | null {
    const t = this.now()
    const times = this.models.filter((m) => !exclude.includes(m)).map((m) => this.parkedUntil.get(m) ?? 0).filter((u) => u > t)
    return times.length ? Math.min(...times) : null
  }

  /** Milliseconds until the first resting model (not excluded) is free again, or null when none of them is resting. */
  msUntilAvailable(exclude: string[] = []): number | null {
    const at = this.nextAvailableAt(exclude)
    return at === null ? null : Math.max(0, at - this.now())
  }

  /** A process-level failure (crash, timeout, empty reply). A string of them rests the model for a while. */
  recordFailure(model: string): void {
    const n = (this.streak.get(model) ?? 0) + 1
    this.streak.set(model, n)
    if (n >= FAILURE_STREAK) {
      this.park(model, FAILURE_PARK_MS)
      this.streak.set(model, 0)
    }
  }

  recordSuccess(model: string): void {
    this.streak.set(model, 0)
  }

  /** Who is resting now and until when, for the log line of a long run. */
  resting(): { model: string; until: number }[] {
    const t = this.now()
    return this.models.flatMap((m) => ((this.parkedUntil.get(m) ?? 0) > t ? [{ model: m, until: this.parkedUntil.get(m)! }] : []))
  }
}

export type Attempt = {
  model: string
  seconds: number
  ok: boolean
  limited: boolean
  error?: string
  tokensIn?: number
  tokensCached?: number
  tokensOut?: number
  tokensReasoning?: number
  costUsd?: number
  costEstimated?: boolean
}

export type CallOpts = {
  exclude?: string[]
  /** Tried first when it is free: a rewrite goes to the model that wrote the lesson. */
  prefer?: string
  timeoutMs: number
  /** Replaces `runOpencode` (tests). */
  run?: Runner
  /** Called once for every model tried, for the ledger. */
  onAttempt?: (attempt: Attempt) => void
}

const issueText = (error: z.ZodError): string =>
  error.issues
    .slice(0, 4)
    .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('; ')

/**
 * Asks the models in rank order until one answers with JSON that fits the schema. A reply that is not JSON, is cut off, or does not fit
 * moves on to the next model. A model that is out of free quota is parked for an hour and never retried in a loop. Null when every model failed.
 */
export async function callJson<T>(chain: Chain, prompt: string, schema: z.ZodType<T>, opts: CallOpts): Promise<{ value: T; model: string } | null> {
  const run = opts.run ?? runOpencode
  const tried = [...(opts.exclude ?? [])]
  for (;;) {
    const model = chain.next(tried, opts.prefer)
    if (!model) return null
    tried.push(model)
    const started = Date.now()
    let result: RunResult
    try {
      result = await run(model, prompt, { timeoutMs: opts.timeoutMs })
    } catch (e) {
      if (e instanceof FatalBackendError) throw e
      result = { text: '', limited: false, error: e instanceof Error ? e.message : String(e) }
    }
    const base = { model, seconds: (Date.now() - started) / 1000, tokensIn: result.tokensIn, tokensCached: result.tokensCached, tokensOut: result.tokensOut, tokensReasoning: result.tokensReasoning, costUsd: result.costUsd, costEstimated: result.costEstimated }
    const report = (a: { ok: boolean; limited: boolean; error?: string }) => opts.onAttempt?.({ ...base, ...a })

    if (result.limited) {
      chain.park(model, chain.limitParkMs)
      report({ ok: false, limited: true, error: 'Free usage limit reached' })
      continue
    }
    if (result.error) {
      chain.recordFailure(model)
      report({ ok: false, limited: false, error: result.error })
      continue
    }
    const json = extractJson(result.text)
    if (json === null) {
      report({ ok: false, limited: false, error: 'no JSON object in the reply (or it was cut off)' })
      continue
    }
    const parsed = schema.safeParse(json)
    if (!parsed.success) {
      chain.recordSuccess(model)
      report({ ok: false, limited: false, error: `schema: ${issueText(parsed.error)}` })
      continue
    }
    chain.recordSuccess(model)
    report({ ok: true, limited: false })
    return { value: parsed.data, model }
  }
}
