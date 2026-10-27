import { expect, test } from 'vitest'
import { getModel, getSpeechModel, MemoryStore, type AiEnv } from '../../src/ai'

const env = (over: Partial<AiEnv> = {}): AiEnv => ({
  AI_MODE: 'live',
  replayStore: new MemoryStore(),
  ...over,
})

test('unknown provider throws', () =>
  expect(() => getModel('text', env({ LLM_PROVIDER: 'nope' }))).toThrow('Unknown LLM_PROVIDER: nope'))

test('deepseek without its own key routes through OpenRouter', () => {
  const m = getModel(
    'text',
    env({ LLM_PROVIDER: 'deepseek', LLM_MODEL: 'chat-model', OPENROUTER_API_KEY: 'k' }),
  )
  expect(m.provider).toContain('openrouter')
  expect(m.modelId).toBe('deepseek/chat-model')
})

test('vision uses its own provider', () => {
  const m = getModel(
    'vision',
    env({
      LLM_PROVIDER: 'deepseek',
      LLM_MODEL: 'x',
      OPENROUTER_API_KEY: 'k',
      VISION_PROVIDER: 'google',
      VISION_MODEL: 'v1',
      GOOGLE_GENERATIVE_AI_API_KEY: 'k',
    }),
  )
  expect(m.provider).toContain('google')
})

test('unknown speech provider throws', () =>
  expect(() => getSpeechModel(env({ TTS_PROVIDER: 'nope' }))).toThrow('Unknown TTS_PROVIDER: nope'))
