import { createAnthropic } from '@ai-sdk/anthropic'
import { createDeepSeek } from '@ai-sdk/deepseek'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { wrapLanguageModel, type LanguageModelMiddleware, type SpeechModel } from 'ai'
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
 * hold the whole run until Cloudflare ends it). Sits inside the replay layer, so only live calls are retried and timed: a recorded
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
          if (i >= waits.length || !isRetryableModelError(err)) throw err
          await sleep(waits[i]!)
        }
      }
    },
  }
}

export type ModelKind = 'text' | 'vision'

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
  OPENROUTER_API_KEY?: string
  DEEPSEEK_API_KEY?: string
  ANTHROPIC_API_KEY?: string
  GOOGLE_GENERATIVE_AI_API_KEY?: string
  OPENAI_API_KEY?: string
  OPENCODE_API_KEY?: string
  OPENCODE_BASE_URL?: string
  replayStore: ReplayStore
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

/** Tries each model in order. Moves on after a 5xx, overload or replay miss; any other error is the caller's. */
export function withFallbacks(models: Chained[]): Chained {
  if (models.length === 1) return models[0]!
  const first = models[0]!
  const next = async <T>(call: (m: Chained) => PromiseLike<T>): Promise<T> => {
    let firstError: unknown
    for (const m of models) {
      try {
        return await call(m)
      } catch (err) {
        if (!(err instanceof ReplayMissError) && !isRetryableModelError(err)) throw err
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
    doGenerate: (options: Parameters<Chained['doGenerate']>[0]) => next((m) => m.doGenerate(options)),
    doStream: (options: Parameters<Chained['doStream']>[0]) => next((m) => m.doStream(options)),
  } as Chained
}

export function getModel(kind: ModelKind, env: AiEnv): Chained {
  const label = kind === 'vision' ? 'VISION_PROVIDER' : 'LLM_PROVIDER'
  const provider = (kind === 'vision' ? env.VISION_PROVIDER : env.LLM_PROVIDER) ?? 'deepseek'
  const modelId = (kind === 'vision' ? env.VISION_MODEL : env.LLM_MODEL) ?? ''
  const fallbacks = ((kind === 'vision' ? env.VISION_MODEL_FALLBACKS : env.LLM_MODEL_FALLBACKS) ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id && id !== modelId)
  // Each model has its own replay layer, so a fallback's answer is recorded and replayed under its own id.
  return withFallbacks(
    [modelId, ...fallbacks].map((id) =>
      wrapLanguageModel({
        model: rawModel(label, provider, id, env),
        middleware: [withReplay(env.replayStore, env.AI_MODE ?? 'live'), withModelRetry()],
      }),
    ),
  )
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
