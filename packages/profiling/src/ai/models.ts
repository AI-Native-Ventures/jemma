import { createAnthropic } from '@ai-sdk/anthropic'
import { createDeepSeek } from '@ai-sdk/deepseek'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { wrapLanguageModel, type LanguageModelMiddleware, type SpeechModel } from 'ai'
import { isFreeModelId, loadCatalog, markRefused, rankModels, refusedIds } from './catalog'
import { withReplay, type AiMode } from './replay'
import { ReplayMissError, type ReplayStore } from './stores'

/** Waits before retries 1 to 4 of a model call that hit a rate limit or an upstream error (free models do both a lot). */
export const MODEL_RETRY_MS = [2000, 5000, 10_000, 20_000]

export function isRetryableModelError(err: unknown): boolean {
  const e = err as { statusCode?: number; status?: number; message?: string; cause?: unknown } | null
  const code = e?.statusCode ?? e?.status
  if (code === 408 || code === 429 || (code !== undefined && code >= 500)) return true
  return /overloaded|temporarily|rate.?limit|too many requests|internal (server )?error|upstream error|timed? ?out|ECONNRESET|fetch failed/i.test(e?.message ?? '') || (e?.cause ? isRetryableModelError(e.cause) : false)
}

/** One live model call that has not answered after this long ends with a timeout error. It is one try, not the sum of the retries. */
export const MODEL_CALL_TIMEOUT_MS = 240_000

/** A paid model has this long for one try: it answers in seconds or something is wrong, and the next model should get the call sooner. */
export const PAID_MODEL_CALL_TIMEOUT_MS = 90_000

/** A Cloudflare Workers AI model (DeepSeek V4.1 Flash, GLM 5.3 Flash) has this long for one try: a whole lesson took 47 s and 100 s in the probe of 16 November 2026. */
export const WORKERS_AI_MODEL_CALL_TIMEOUT_MS = 150_000

/** In the dynamic list (`AI_MODEL_RANKING`) a free model has this long for one try: a longer list must not outlast the queue limit. */
export const DYNAMIC_FREE_MODEL_CALL_TIMEOUT_MS = 120_000

const isFreeId = isFreeModelId

/**
 * Paid hosting of a model, as far as the id says. On OpenRouter a model without the `:free` suffix is the paid listing of it. No other
 * provider marks the price in the id, so nothing else counts as paid here and keeps the old limit.
 */
export function isPaidModel(provider: string, id: string): boolean {
  return provider === 'openrouter' && id !== '' && !isFreeId(id)
}

/**
 * The time one try of this model may take: 150 seconds for a Workers AI model, 90 seconds for a paid OpenRouter model, 4 minutes for every
 * other. In the dynamic list (`dynamic`) a free model gets 2 minutes instead, and a paid model keeps 90 seconds.
 */
export function modelCallTimeoutMs(provider: string, id: string, dynamic = false): number {
  if (provider === 'workers-ai') return WORKERS_AI_MODEL_CALL_TIMEOUT_MS
  if (isPaidModel(provider, id)) return PAID_MODEL_CALL_TIMEOUT_MS
  return dynamic ? DYNAMIC_FREE_MODEL_CALL_TIMEOUT_MS : MODEL_CALL_TIMEOUT_MS
}

/**
 * The ids to try, in order: the model, then the comma list of fallbacks. Blanks and repeats are dropped. With no model set the list is one
 * empty id, as it always was (the provider then says what is missing). The hosted app puts the paid id first and the free ids after it.
 */
export function modelList(primary: string | undefined, fallbacks: string | undefined): string[] {
  const rest = (fallbacks ?? '').split(',').map((id) => id.trim()).filter(Boolean)
  return [...new Set([(primary ?? '').trim(), ...rest])]
}

/** The providers `rawModel` knows: the names an id of `LLM_MODEL`, `LLM_MODEL_FALLBACKS` or the vision pair may start with, before a colon. */
export const PROVIDER_PREFIXES = ['openrouter', 'workers-ai', 'deepseek', 'anthropic', 'google', 'openai', 'opencode'] as const

/** One model of a chain: the provider it is built with, and its bare id (what the provider is asked for, and what a replay is keyed by). */
export type ModelRef = { provider: string; id: string }

/**
 * Splits `<provider>:<id>` into the provider and the bare id, so one list can mix providers (Cloudflare Workers AI first, free OpenRouter models
 * after it: `@cf/zai-org/glm-5.3-flash,openrouter:nvidia/nemotron-3.5-super-vl:free`). Only the exact name of a known provider before the FIRST
 * colon counts, so an OpenRouter id such as `nvidia/nemotron-3.5-super-vl:free` or `google/gemma-4-31b-it:free` has no prefix and stays as it is.
 * An id without a prefix goes with `defaultProvider`, the provider of the kind, exactly as before.
 */
export function splitProviderId(raw: string, defaultProvider: string): ModelRef {
  const text = raw.trim()
  const colon = text.indexOf(':')
  if (colon > 0) {
    const prefix = text.slice(0, colon)
    if ((PROVIDER_PREFIXES as readonly string[]).includes(prefix)) return { provider: prefix, id: text.slice(colon + 1).trim() }
  }
  return { provider: defaultProvider, id: text }
}

/** The models of a list of ids, each with its provider, without repeats (the same provider and the same bare id). */
function modelRefs(rawIds: string[], defaultProvider: string): ModelRef[] {
  const seen = new Set<string>()
  return rawIds.map((raw) => splitProviderId(raw, defaultProvider)).filter((ref) => !seen.has(`${ref.provider}\u0000${ref.id}`) && !!seen.add(`${ref.provider}\u0000${ref.id}`))
}

/**
 * Words in an error that say the model is gone, not served to this account, not paid for, or refused to this kind of caller (OpenRouter says
 * "... is only available on agentic harnesses" for the free listing of some models when an API key calls it).
 */
const MODEL_GONE_MESSAGE =
  /no endpoints|not a valid model|model.*not found|no allowed providers|not available|deprecated|insufficient credit|requires more credits|payment required|only available on|agentic harness/i

/**
 * An error that says this model cannot answer at all, now: it was removed (404, "no endpoints", "not a valid model"), is not served
 * ("no allowed providers", "not available", "deprecated"), is not paid for (402, "insufficient credit") or refuses this caller ("only available
 * on", "agentic harness"). Asking it again changes nothing, so it is never retried on the same model: the next model gets the call.
 */
export function isModelGoneError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false
  const e = err as { statusCode?: number; status?: number; message?: unknown; cause?: unknown }
  const code = e.statusCode ?? e.status
  if (code === 402 || code === 404) return true
  if (typeof e.message === 'string' && MODEL_GONE_MESSAGE.test(e.message)) return true
  return e.cause ? isModelGoneError(e.cause) : false
}

/**
 * An error after which the dynamic list leaves this model out of its ranked part for an hour (`markRefused`): a 4xx other than 408 (timeout) and
 * 429 (rate limit), or an error that says the model is gone, unpaid or refused (`isModelGoneError`). A 5xx, a timeout, a rate limit and an error with
 * no status and no such words are not: they say nothing lasting about the model.
 */
export function isRefusalError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false
  if (isModelGoneError(err)) return true
  const e = err as { statusCode?: number; status?: number; cause?: unknown }
  const code = e.statusCode ?? e.status
  if (typeof code === 'number' && code >= 400 && code < 500 && code !== 408 && code !== 429) return true
  return e.cause ? isRefusalError(e.cause) : false
}

/**
 * Runs `onRefused` when a live try of the model ends with an error that `isRefusalError` knows, and passes every error on unchanged. Not when the
 * caller cancelled the call (that says nothing about the model). Sits between the replay layer and the retry layer, so it sees the end of a try.
 */
function noteRefusals(onRefused: () => void): LanguageModelMiddleware {
  return {
    specificationVersion: 'v4',
    wrapGenerate: async ({ doGenerate, params }) => {
      try {
        return await doGenerate()
      } catch (err) {
        if (!params.abortSignal?.aborted && isRefusalError(err)) onRefused()
        throw err
      }
    },
  }
}

/**
 * The ids of `AI_RECORDED_IDS`: a comma list, blanks and repeats dropped. They are ids that recorded answers were saved under (the old free
 * OpenRouter ids of the demo path) and that are only looked up, never called.
 */
export function recordedIdList(value: string | undefined): string[] {
  return [...new Set((value ?? '').split(',').map((id) => id.trim()).filter(Boolean))]
}

/**
 * A model call that did not answer in time. The message holds `timeout` and the status is 408, so `isRetryableModelError` and the
 * orchestrator's `isTransient` both treat it as worth another try.
 */
export class ModelTimeoutError extends Error {
  readonly statusCode = 408
  constructor(ms: number) {
    super(`Model call timeout: no answer after ${Math.round(ms / 1000)} seconds`)
    this.name = 'ModelTimeoutError'
  }
}

/**
 * Runs one try with a time limit. `call` gets a signal that is aborted when the limit passes or when the caller's own signal
 * (`parent`) is aborted, so a request that hangs is cancelled and does not sit on a connection. The caller's cancel is passed on
 * as it is: it is not a timeout. The timer is always cleared.
 */
async function withTimeLimit<T>(ms: number, parent: AbortSignal | undefined, call: (signal: AbortSignal) => PromiseLike<T>): Promise<T> {
  const controller = new AbortController()
  const relay = () => controller.abort(parent?.reason)
  if (parent?.aborted) relay()
  else parent?.addEventListener('abort', relay, { once: true })
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err = new ModelTimeoutError(ms)
      reject(err)
      controller.abort(err)
    }, ms)
  })
  try {
    return await Promise.race([call(controller.signal), late])
  } finally {
    clearTimeout(timer)
    parent?.removeEventListener('abort', relay)
  }
}

/**
 * Retries a failed model call with backoff, and gives each live try `timeoutMs` to answer (a free model that never answers would
 * hold the whole run until Cloudflare ends it). A timeout is not tried again on the same model: a model that hangs once usually
 * hangs again, so the error is thrown at once and the next model in the chain (`withFallbacks`) gets the call. So is an error that says the
 * model is gone or unpaid (`isModelGoneError`). Every other retryable error keeps its retries. Sits inside the replay layer, so only live calls are retried and timed: a recorded
 * answer is never timed, and the replay layer sees the call as it was (the signal is added below it, and the key leaves it out anyway).
 * Streams are left alone: nothing in Jemma streams, and this layer has never wrapped them.
 */
export function withModelRetry(
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  waits = MODEL_RETRY_MS,
  timeoutMs = MODEL_CALL_TIMEOUT_MS,
): LanguageModelMiddleware {
  return {
    specificationVersion: 'v4',
    wrapGenerate: async ({ model, params }) => {
      for (let i = 0; ; i++) {
        try {
          return await withTimeLimit(timeoutMs, params.abortSignal, (abortSignal) => model.doGenerate({ ...params, abortSignal }))
        } catch (err) {
          if (err instanceof ModelTimeoutError || isModelGoneError(err) || i >= waits.length || !isRetryableModelError(err)) throw err
          await sleep(waits[i]!)
        }
      }
    },
  }
}

/**
 * What one completed model call used, as the provider reported it (P137): the provider and the model id that actually answered (after any fallback),
 * and the three counts. A reply that carries no usage has null counts and `reported: false`: Jemma never estimates a count.
 */
export type ModelUsage = {
  provider: string
  model: string
  promptTokens: number | null
  completionTokens: number | null
  totalTokens: number | null
  reported: boolean
}

const count = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined)

/**
 * Reads the usage of one model reply (the `usage` the AI SDK gives a model: input and output token totals, and the provider's own object under `raw`).
 * A reply whose counts are all missing or zero reports nothing, as a real call always has a prompt: it is `reported: false` with null counts.
 * With only one count known the other stays null, and the total is the provider's own `total_tokens` or else the two added up when both are known.
 */
export function modelUsage(provider: string, model: string, usage: unknown): ModelUsage {
  const u = isObject(usage) ? usage : {}
  const input = isObject(u.inputTokens) ? count(u.inputTokens.total) : undefined
  const output = isObject(u.outputTokens) ? count(u.outputTokens.total) : undefined
  const given = isObject(u.raw) ? count(u.raw.total_tokens) : undefined
  if ((input ?? 0) + (output ?? 0) + (given ?? 0) === 0) return { provider, model, promptTokens: null, completionTokens: null, totalTokens: null, reported: false }
  return {
    provider,
    model,
    promptTokens: input ?? null,
    completionTokens: output ?? null,
    totalTokens: given ?? (input !== undefined && output !== undefined ? input + output : null),
    reported: true,
  }
}

/**
 * Hands the usage of every live try that completed to `onUsage`, with the provider and the id of the model it is wrapped around, so after a fallback it is
 * the model that answered. Innermost layer of a model: a recorded answer that is replayed never gets here (it cost nothing), and the reply is passed on as
 * it is. A reporter that throws never touches the call.
 */
function reportUsage(ref: ModelRef, onUsage: (usage: ModelUsage) => void): LanguageModelMiddleware {
  return {
    specificationVersion: 'v4',
    wrapGenerate: async ({ doGenerate }) => {
      const result = await doGenerate()
      try {
        onUsage(modelUsage(ref.provider, ref.id, (result as { usage?: unknown }).usage))
      } catch {
        // Counting is a side job: it never fails a model call.
      }
      return result
    },
  }
}

export type ModelKind = 'text' | 'vision'

/** The Workers AI binding of a Worker (`env.AI`). */
export type AiBinding = { run(model: string, input: Record<string, unknown>): Promise<unknown> }

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

const jsonResponse = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const errorResponse = (status: number, message: string) => jsonResponse(status, { error: { message } })

/** A promise that gives up when the signal aborts. The call it wraps is left to finish or fail on its own, and its failure is not an unhandled one. */
function untilAborted<T>(call: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  call.catch(() => {})
  if (!signal) return call
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason ?? new DOMException('This operation was aborted', 'AbortError'))
    signal.addEventListener('abort', onAbort, { once: true })
    call.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort))
  })
}

/**
 * A `fetch` backed by the Workers AI binding, for the OpenAI provider. For DeepSeek V4.1 Flash and GLM 5.3 Flash the binding takes the OpenAI
 * chat-completions body (without `model`, which is the first argument of `run`) and returns the OpenAI chat-completion object, so nothing is
 * translated: the body goes in, the object comes out, with no API token. Errors become the status the retry layer knows: a thrown error that
 * says capacity, rate or too many is a 429, any other is a 500, both with an OpenAI-shaped error body that holds the message; an output with no
 * `choices` is a 502 that names the model; a streaming request is a 400 (nothing in Jemma streams). A cancelled call ends the fetch at once.
 */
export function bindingFetch(binding: AiBinding): (input: string | URL | Request, init?: RequestInit) => Promise<Response> {
  return async (input, init) => {
    const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined) ?? undefined
    if (signal?.aborted) throw signal.reason ?? new DOMException('This operation was aborted', 'AbortError')
    const raw = typeof init?.body === 'string' ? init.body : input instanceof Request ? await input.clone().text() : ''
    let body: unknown
    try {
      body = JSON.parse(raw)
    } catch {
      body = null
    }
    if (!isObject(body)) return errorResponse(400, 'The request body is not a JSON object')
    const { model, ...rest } = body
    if (typeof model !== 'string' || model === '') return errorResponse(400, 'The request names no model')
    if (rest.stream === true) return errorResponse(400, `Streaming is not supported through the Workers AI binding (${model})`)
    let output: unknown
    try {
      output = await untilAborted(binding.run(model, rest), signal)
    } catch (err) {
      if (signal?.aborted) throw err
      const message = err instanceof Error && err.message ? err.message : String(err)
      return errorResponse(/capacity|rate|too many/i.test(message) ? 429 : 500, message)
    }
    if (!isObject(output) || !Array.isArray(output.choices)) return errorResponse(502, `Workers AI returned no choices for ${model}`)
    return jsonResponse(200, output)
  }
}

export type AiEnv = {
  LLM_PROVIDER?: string
  LLM_MODEL?: string
  /** Comma list of model ids (same provider) tried in order when the model fails with a 5xx or overload after its retries. */
  LLM_MODEL_FALLBACKS?: string
  VISION_PROVIDER?: string
  VISION_MODEL?: string
  VISION_MODEL_FALLBACKS?: string
  TTS_PROVIDER?: string
  TTS_MODEL?: string
  AI_MODE?: AiMode
  /**
   * The Workers AI binding of the Worker (`env.AI`). The `workers-ai` provider runs through it when there is no `CF_AI_TOKEN`: no API token and no
   * account id are needed inside a Worker.
   */
  AI_BINDING?: AiBinding
  /** Cloudflare account id and an API token (a secret) with Workers AI access: the REST way to use the `workers-ai` provider, outside a Worker. */
  CF_ACCOUNT_ID?: string
  CF_AI_TOKEN?: string
  /**
   * Comma list of ids that recorded answers were saved under but that are never called (`cache` and `replay` look a call up under them after the
   * model ids). With the three old free OpenRouter ids here, the demo path's recorded answers still hit while every live call goes to another
   * provider. Unset: the lookup list is the model ids only.
   */
  AI_RECORDED_IDS?: string
  /** `artificial-analysis`: the hosted app picks its free OpenRouter models itself each hour, ranked by Artificial Analysis (see `catalog.ts`). Anything else or unset: the env lists only. */
  AI_MODEL_RANKING?: string
  /** Key of the Artificial Analysis API (secret). Without it the dynamic list ranks the newest free models first. */
  AA_API_KEY?: string
  OPENROUTER_API_KEY?: string
  DEEPSEEK_API_KEY?: string
  ANTHROPIC_API_KEY?: string
  GOOGLE_GENERATIVE_AI_API_KEY?: string
  OPENAI_API_KEY?: string
  OPENCODE_API_KEY?: string
  OPENCODE_BASE_URL?: string
  replayStore: ReplayStore
  /**
   * Called once for every model call that completed live (not for a recorded answer that was replayed), with its real token usage and the model that
   * answered. The agent sets it for each job step to record the usage of the step (`ai_usage`). Unset: nothing is reported and nothing else changes.
   */
  onUsage?: (usage: ModelUsage) => void
}

function rawModel(label: string, provider: string, modelId: string, env: AiEnv) {
  switch (provider) {
    case 'deepseek':
      if (env.DEEPSEEK_API_KEY) return createDeepSeek({ apiKey: env.DEEPSEEK_API_KEY })(modelId)
      return createOpenRouter({ apiKey: env.OPENROUTER_API_KEY }).chat(`deepseek/${modelId}`)
    case 'openrouter':
      return createOpenRouter({ apiKey: env.OPENROUTER_API_KEY }).chat(modelId)
    case 'anthropic':
      return createAnthropic({ apiKey: env.ANTHROPIC_API_KEY })(modelId)
    case 'google':
      return createGoogleGenerativeAI({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY })(modelId)
    case 'openai':
      return createOpenAI({ apiKey: env.OPENAI_API_KEY })(modelId)
    case 'workers-ai': {
      // Cloudflare Workers AI (DeepSeek V4.1 Flash, GLM 5.3 Flash: `@cf/...` ids). Inside a Worker the binding is used and no token is needed. A
      // `CF_AI_TOKEN` means the REST endpoint instead (for a run outside a Worker). `replay` never calls a model, so it needs neither.
      const token = (env.CF_AI_TOKEN ?? '').trim()
      if (env.AI_BINDING && !token) {
        return createOpenAI({ name: 'workers-ai', baseURL: 'https://workers-ai.binding/v1', apiKey: 'binding', fetch: bindingFetch(env.AI_BINDING) as typeof fetch }).chat(modelId)
      }
      if (env.AI_MODE !== 'replay') {
        if (!token) throw new Error('CF_AI_TOKEN or the AI binding is not set (the workers-ai provider needs one of them)')
        if (!env.CF_ACCOUNT_ID?.trim()) throw new Error('CF_ACCOUNT_ID is not set (the workers-ai provider needs it with CF_AI_TOKEN)')
      }
      return createOpenAI({
        name: 'workers-ai',
        baseURL: `https://api.cloudflare.com/client/v4/accounts/${(env.CF_ACCOUNT_ID ?? '').trim()}/ai/v1`,
        apiKey: token,
      }).chat(modelId)
    }
    case 'opencode':
      return createOpenAI({
        name: 'opencode',
        baseURL: env.OPENCODE_BASE_URL ?? 'https://opencode.ai/zen/v1',
        apiKey: env.OPENCODE_API_KEY,
      }).chat(modelId)
    default:
      throw new Error(`Unknown ${label}: ${provider}`)
  }
}

type Chained = ReturnType<typeof wrapLanguageModel>

/**
 * Tries each model in order and moves on to the next after ANY error (a 5xx, a timeout, a replay miss, a model that is gone, unpaid or refuses
 * the caller, a 400, an answer that could not be read): one model that will not answer never stops a job while another could. The one
 * exception is the caller's own cancel (`abortSignal` aborted): that goes up at once. With no model left, the first error goes up.
 */
export function withFallbacks(models: Chained[]): Chained {
  if (models.length === 1) return models[0]!
  const first = models[0]!
  const next = async <T>(call: (m: Chained) => PromiseLike<T>, signal: AbortSignal | undefined): Promise<T> => {
    let firstError: unknown
    for (const m of models) {
      try {
        return await call(m)
      } catch (err) {
        if (signal?.aborted) throw err
        firstError ??= err
      }
    }
    throw firstError
  }
  return {
    specificationVersion: first.specificationVersion,
    get provider() {
      return first.provider
    },
    get modelId() {
      return first.modelId
    },
    get supportedUrls() {
      return first.supportedUrls
    },
    doGenerate: (options: Parameters<Chained['doGenerate']>[0]) => next((m) => m.doGenerate(options), options.abortSignal),
    doStream: (options: Parameters<Chained['doStream']>[0]) => next((m) => m.doStream(options), options.abortSignal),
  } as Chained
}

/**
 * Looks a call up under every id of the list before any model is called. An answer is stored under the id of the model that wrote it, and
 * the answers of the demo path were all written by free listings: with the paid id first, a plain chain would look under the paid id,
 * miss, and pay for a call the free id already has an answer for. The lookups run at once (one read of storage in time, not one per id).
 * When several ids hold the answer the free id wins, then the order of the list. Nothing here calls a model: `lookups` are models behind a
 * `replay` layer, which answers or says it missed.
 *
 * A miss everywhere hands the call to `then` (the live models, `cache` mode) or is the first model's miss (`replay`, nothing else to try).
 * A store that fails is a miss in `cache` (`tolerateStoreErrors`: the model is asked, as in a single layer) and an error in `replay`,
 * unless some id did answer.
 */
export function recordedFirst(lookups: Chained[], then: Chained | null, tolerateStoreErrors: boolean): Chained {
  const first = lookups[0]!
  const byPriority = lookups.map((_, i) => i).sort((a, b) => Number(isFreeId(lookups[b]!.modelId)) - Number(isFreeId(lookups[a]!.modelId)) || a - b)
  const go = async <T>(look: (m: Chained) => PromiseLike<T>, live: (() => PromiseLike<T>) | null): Promise<T> => {
    const settled = await Promise.allSettled(lookups.map(async (m) => look(m)))
    for (const i of byPriority) {
      const s = settled[i]!
      if (s.status === 'fulfilled') return s.value
    }
    const failures = settled.flatMap((s) => (s.status === 'rejected' ? [s.reason as unknown] : []))
    const storeError = failures.find((e) => !(e instanceof ReplayMissError))
    if (storeError !== undefined && !tolerateStoreErrors) throw storeError
    if (storeError !== undefined) console.error(`recorded answer not read, the model is asked: ${storeError instanceof Error ? storeError.message : String(storeError)}`)
    if (live) return live()
    throw failures[0]
  }
  return {
    specificationVersion: first.specificationVersion,
    get provider() {
      return first.provider
    },
    get modelId() {
      return first.modelId
    },
    get supportedUrls() {
      return first.supportedUrls
    },
    doGenerate: (options: Parameters<Chained['doGenerate']>[0]) => go((m) => m.doGenerate(options), then ? () => then.doGenerate(options) : null),
    doStream: (options: Parameters<Chained['doStream']>[0]) => go((m) => m.doStream(options), then ? () => then.doStream(options) : null),
  } as Chained
}

/**
 * The chain of models for one call. `ids` are the models that may be called, in order; `lookupIds` are the ids a recorded answer is looked up
 * under (the same ids in the env lists, more in the dynamic list). With several lookup ids, `cache` and `replay` first look the call up under
 * every id (recorded answers of the free ids still hit when the paid id is first), and only on a miss call the models. In `replay` there is no
 * model to call, so the lookups are the whole chain.
 */
function buildChain(label: string, provider: string, refs: ModelRef[], baseLookupRefs: ModelRef[], env: AiEnv, dynamic: boolean, onRefused?: (id: string) => void): Chained {
  const mode = env.AI_MODE ?? 'live'
  // `AI_RECORDED_IDS` are looked up after the model ids and never called: the old ids that the demo path's answers were saved under. A lookup is by
  // the bare id (the replay key never holds a provider prefix) and each bare id is looked up once.
  const seen = new Set<string>()
  const lookupRefs = [...baseLookupRefs, ...recordedIdList(env.AI_RECORDED_IDS).map((id): ModelRef => ({ provider, id }))].filter((ref) => !seen.has(ref.id) && !!seen.add(ref.id))
  const lookupFirst = lookupRefs.length > 1 && (mode === 'cache' || mode === 'replay')
  // A chain that mixes providers (Cloudflare first, free OpenRouter models after): a free OpenRouter id that comes after a model that is not a free
  // OpenRouter model has 2 minutes a try instead of 4, so 3 Cloudflare tries and 2 free tries stay inside the 15 minutes of a queued job.
  const mixed = new Set(refs.map((r) => r.provider)).size > 1
  const freeOpenRouter = (r: ModelRef) => r.provider === 'openrouter' && isFreeId(r.id)
  // Each model has its own replay layer, so an answer is recorded and replayed under the id of the model that wrote it. Each has its own
  // provider and time limit: 150 seconds for Workers AI, 90 seconds for a paid OpenRouter model, 4 minutes for a free one (2 minutes in the
  // dynamic list, and after a model of another kind in a mixed chain).
  const live = () =>
    withFallbacks(
      refs.map((ref, i) =>
        wrapLanguageModel({
          model: rawModel(label, ref.provider, ref.id, env),
          middleware: [
            withReplay(env.replayStore, mode),
            ...(onRefused ? [noteRefusals(() => onRefused(ref.id))] : []),
            withModelRetry(undefined, undefined, modelCallTimeoutMs(ref.provider, ref.id, dynamic || (mixed && freeOpenRouter(ref) && refs.slice(0, i).some((r) => !freeOpenRouter(r))))),
            ...(env.onUsage ? [reportUsage(ref, env.onUsage)] : []),
          ],
        }),
      ),
    )
  if (!lookupFirst) return live()
  const lookups = lookupRefs.map((ref) => wrapLanguageModel({ model: rawModel(label, ref.provider, ref.id, env), middleware: withReplay(env.replayStore, 'replay') }))
  return recordedFirst(lookups, mode === 'cache' ? live() : null, mode === 'cache')
}

/**
 * The model of the dynamic list (`AI_MODEL_RANKING=artificial-analysis`, OpenRouter only). `getModel` stays synchronous: the lists are read, and
 * the ids ranked, when a call is made (`loadCatalog` keeps them for an hour, so most calls read nothing). The chain is then built exactly as for
 * the env lists. Recorded answers are looked up under the ranked ids and under every pinned id, also a pinned free id that OpenRouter has
 * removed (a lookup calls no model). From outside the model is the first pinned id, as the chain of the env lists is.
 */
function rankedModel(kind: ModelKind, label: string, provider: string, pinned: string[], env: AiEnv): Chained {
  const head = rawModel(label, provider, pinned[0]!, env)
  const chain = async () => {
    const catalog = await loadCatalog(env, (url, init) => globalThis.fetch(url, init))
    // A model that refused a call in the last hour is left out of the ranked part (a pinned id never is), and one that refuses now is noted.
    const ids = rankModels({ kind, openrouter: catalog.openrouter, aa: catalog.aa, pinned, refused: refusedIds() })
    const refs = (list: string[]): ModelRef[] => list.map((id) => ({ provider, id }))
    return buildChain(label, provider, refs(ids), refs([...new Set([...ids, ...pinned.filter(Boolean)])]), env, true, (id) => markRefused(id))
  }
  return {
    specificationVersion: head.specificationVersion,
    get provider() {
      return head.provider
    },
    get modelId() {
      return head.modelId
    },
    get supportedUrls() {
      return head.supportedUrls
    },
    doGenerate: async (options: Parameters<Chained['doGenerate']>[0]) => (await chain()).doGenerate(options),
    doStream: async (options: Parameters<Chained['doStream']>[0]) => (await chain()).doStream(options),
  } as Chained
}

export function getModel(kind: ModelKind, env: AiEnv): Chained {
  const label = kind === 'vision' ? 'VISION_PROVIDER' : 'LLM_PROVIDER'
  const provider = (kind === 'vision' ? env.VISION_PROVIDER : env.LLM_PROVIDER) ?? 'deepseek'
  const ids = modelList(kind === 'vision' ? env.VISION_MODEL : env.LLM_MODEL, kind === 'vision' ? env.VISION_MODEL_FALLBACKS : env.LLM_MODEL_FALLBACKS)
  if (provider === 'openrouter' && env.AI_MODEL_RANKING === 'artificial-analysis') return rankedModel(kind, label, provider, ids, env)
  // An id may name its own provider (`openrouter:nvidia/...:free`): each model of the list is then built with its own provider.
  const refs = modelRefs(ids, provider)
  return buildChain(label, provider, refs, refs, env, false)
}

export function getSpeechModel(env: AiEnv): SpeechModel {
  const provider = env.TTS_PROVIDER ?? 'openai'
  const modelId = env.TTS_MODEL ?? ''
  switch (provider) {
    case 'openai':
      return createOpenAI({ apiKey: env.OPENAI_API_KEY }).speech(modelId)
    case 'google':
      return createGoogleGenerativeAI({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY }).speech(modelId)
    default:
      throw new Error(`Unknown TTS_PROVIDER: ${provider}`)
  }
}
