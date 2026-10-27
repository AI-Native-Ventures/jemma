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

/** Retries a failed model call with backoff. Sits inside the replay layer, so only live calls are retried. */
export function withModelRetry(sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)), waits = MODEL_RETRY_MS): LanguageModelMiddleware {
  return {
    specificationVersion: 'v4',
    wrapGenerate: async ({ doGenerate }) => {
      for (let i = 0; ; i++) {
        try {
          return await doGenerate()
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
