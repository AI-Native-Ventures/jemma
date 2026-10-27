import { createAnthropic } from '@ai-sdk/anthropic'
import { createDeepSeek } from '@ai-sdk/deepseek'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { wrapLanguageModel, type SpeechModel } from 'ai'
import { withReplay, type AiMode } from './replay'
import type { ReplayStore } from './stores'

export type ModelKind = 'text' | 'vision'

export type AiEnv = {
  LLM_PROVIDER?: string
  LLM_MODEL?: string
  VISION_PROVIDER?: string
  VISION_MODEL?: string
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

export function getModel(kind: ModelKind, env: AiEnv): ReturnType<typeof wrapLanguageModel> {
  const label = kind === 'vision' ? 'VISION_PROVIDER' : 'LLM_PROVIDER'
  const provider = (kind === 'vision' ? env.VISION_PROVIDER : env.LLM_PROVIDER) ?? 'deepseek'
  const modelId = (kind === 'vision' ? env.VISION_MODEL : env.LLM_MODEL) ?? ''
  return wrapLanguageModel({
    model: rawModel(label, provider, modelId, env),
    middleware: withReplay(env.replayStore, env.AI_MODE ?? 'live'),
  })
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
