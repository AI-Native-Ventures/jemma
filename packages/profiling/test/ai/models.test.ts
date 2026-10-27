import { expect, test, vi } from 'vitest'
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

test('openrouter passes the model id through unchanged', () => {
  const m = getModel(
    'text',
    env({ LLM_PROVIDER: 'openrouter', LLM_MODEL: 'google/gemma-4-31b-it:free', OPENROUTER_API_KEY: 'k' }),
  )
  expect(m.modelId).toBe('google/gemma-4-31b-it:free')
})

test('opencode provider uses the Zen base URL and passes the model id through', async () => {
  const fetchMock = vi.fn(async () => new Response('{}', { status: 400 }))
  vi.stubGlobal('fetch', fetchMock)
  try {
    const m = getModel(
      'text',
      env({ LLM_PROVIDER: 'opencode', LLM_MODEL: 'some-model-free', OPENCODE_API_KEY: 'k' }),
    )
    expect(m.modelId).toBe('some-model-free')
    try {
      await m.doGenerate({ prompt: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] })
    } catch {
      // the stubbed 400 is expected, only the request matters
    }
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://opencode.ai/zen/v1/chat/completions')
    expect(JSON.parse(init.body as string).model).toBe('some-model-free')
  } finally {
    vi.unstubAllGlobals()
  }
})

test('text and vision can use different providers', () => {
  const m = getModel(
    'vision',
    env({ LLM_PROVIDER: 'opencode', VISION_PROVIDER: 'openrouter', VISION_MODEL: 'v:free', OPENROUTER_API_KEY: 'k' }),
  )
  expect(m.provider).toContain('openrouter')
})

test('a model call that hits a 429 or an upstream error is retried with backoff, a 400 is not', async () => {
  const { MockLanguageModelV4 } = await import('ai/test')
  const { wrapLanguageModel } = await import('ai')
  const { withModelRetry } = await import('../../src/ai')
  const ok = { content: [{ type: 'text', text: 'hi' }], finishReason: { unified: 'stop', raw: 'stop' }, usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } }, warnings: [] } as never
  const waits: number[] = []
  const sleep = async (ms: number) => void waits.push(ms)
  const flaky = (errs: unknown[]) => {
    let i = 0
    return new MockLanguageModelV4({ doGenerate: async () => { if (i < errs.length) throw errs[i++]; return ok } })
  }
  const params = { prompt: [{ role: 'user', content: [{ type: 'text', text: 'q' }] }] } as never
  const m1 = flaky([Object.assign(new Error('rate limited'), { statusCode: 429 }), new Error('Upstream error from Nvidia: Service temporarily overloaded')])
  await wrapLanguageModel({ model: m1, middleware: withModelRetry(sleep, [1, 2, 3]) }).doGenerate(params)
  expect(m1.doGenerateCalls.length).toBe(3)
  expect(waits).toEqual([1, 2])
  const m2 = flaky([Object.assign(new Error('bad request'), { statusCode: 400 })])
  await expect(wrapLanguageModel({ model: m2, middleware: withModelRetry(sleep, [1]) }).doGenerate(params)).rejects.toThrow('bad request')
  expect(m2.doGenerateCalls.length).toBe(1)
})

test('a fallback model answers when the first stays overloaded, and a replay records per model', async () => {
  const { MockLanguageModelV4 } = await import('ai/test')
  const { withFallbacks, ReplayMissError } = await import('../../src/ai')
  const ok = { content: [{ type: 'text', text: 'from b' }], finishReason: { unified: 'stop', raw: 'stop' }, usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } }, warnings: [] } as never
  const a = new MockLanguageModelV4({ modelId: 'a', doGenerate: async () => { throw Object.assign(new Error('Service temporarily overloaded'), { statusCode: 503 }) } })
  const b = new MockLanguageModelV4({ modelId: 'b', doGenerate: ok })
  const params = { prompt: [{ role: 'user', content: [{ type: 'text', text: 'q' }] }] } as never
  const chain = withFallbacks([a, b] as never)
  expect((await chain.doGenerate(params)).content).toEqual([{ type: 'text', text: 'from b' }])
  expect(chain.modelId).toBe('a')
  const bad = new MockLanguageModelV4({ modelId: 'c', doGenerate: async () => { throw Object.assign(new Error('bad request'), { statusCode: 400 }) } })
  await expect(withFallbacks([bad, b] as never).doGenerate(params)).rejects.toThrow('bad request')
  expect(b.doGenerateCalls.length).toBe(1)
  const miss = new MockLanguageModelV4({ modelId: 'd', doGenerate: async () => { throw new ReplayMissError('k') } })
  expect((await withFallbacks([miss, b] as never).doGenerate(params)).content).toEqual([{ type: 'text', text: 'from b' }])
})

test('extractJson takes the first object, ignoring fences, text and a second object after it', async () => {
  const { extractJson } = await import('../../src/ai')
  expect(extractJson('Here:\n```json\n{"a":{"b":"}"},"c":[1]}\n```\nthanks {x}')).toEqual({ a: { b: '}' }, c: [1] })
  expect(extractJson('{"a":1}\n{"a":2}')).toEqual({ a: 1 })
  expect(() => extractJson('{"a":')).toThrow('No object generated')
})
