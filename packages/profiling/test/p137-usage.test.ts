import { afterEach, describe, expect, test, vi } from 'vitest'
import { MemoryStore, getModel, modelUsage, type AiEnv, type ModelUsage } from '../src/ai'

// P137: the real tokens of every completed model call. The model layer hands each one (provider, the model that answered, the three counts) to
// `env.onUsage`. A reply with no usage is reported as null counts and reported=false, never an estimate. A recorded answer that is replayed
// costs nothing and reports nothing. Doubles and a fake `fetch` only: no database, no network, no live model.

const DEEPSEEK = '@cf/deepseek-ai/deepseek-v4.1-flash-1017'
const GLM = '@cf/zai-org/glm-5.3-flash'
const FREE = 'nvidia/nemotron-3.5-super-vl:free'

const params = { prompt: [{ role: 'user', content: [{ type: 'text', text: 'Write a practice' }] }] } as never
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const completion = (model: string, text: string, usage?: unknown) => ({
  id: 'gen-1',
  object: 'chat.completion',
  created: 1,
  model,
  choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: text } }],
  ...(usage === undefined ? {} : { usage }),
})

/** The usage object the real Workers AI binding returned for DeepSeek V4.1 Flash and GLM 5.3 Flash (16 November 2026): standard keys and an extra `neurons`. */
const bindingUsage = { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7, prompt_tokens_details: { cached_tokens: 0 }, neurons: 12.5 }

function fakeBinding(handler: (model: string) => unknown) {
  const runs: string[] = []
  const binding = {
    run: vi.fn(async (model: string) => {
      runs.push(model)
      return handler(model)
    }),
  }
  return { binding, runs }
}

/** A reporter that keeps what the model layer hands it. */
function reporter() {
  const seen: ModelUsage[] = []
  return { seen, onUsage: (u: ModelUsage) => void seen.push(u) }
}

const baseEnv = (over: Partial<AiEnv>): AiEnv => ({ AI_MODE: 'live', replayStore: new MemoryStore(), ...over }) as AiEnv

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('usage from an OpenAI-style reply', () => {
  test('OpenRouter: the three counts, the provider and the model id are handed over after the call', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(completion(FREE, 'hello', { prompt_tokens: 120, completion_tokens: 30, total_tokens: 150 }))))
    const r = reporter()
    const out = await getModel('text', baseEnv({ LLM_PROVIDER: 'openrouter', LLM_MODEL: FREE, OPENROUTER_API_KEY: 'k', onUsage: r.onUsage })).doGenerate(params)
    expect((out.content as { text: string }[])[0]!.text).toBe('hello')
    expect(r.seen).toEqual([{ provider: 'openrouter', model: FREE, promptTokens: 120, completionTokens: 30, totalTokens: 150, reported: true }])
  })

  test('an OpenAI-compatible host (opencode) reports the same way', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(completion('big-model', 'hi', { prompt_tokens: 5, completion_tokens: 6, total_tokens: 11 }))))
    const r = reporter()
    await getModel('text', baseEnv({ LLM_PROVIDER: 'opencode', LLM_MODEL: 'big-model', OPENCODE_API_KEY: 'k', OPENCODE_BASE_URL: 'https://zen.test/v1', onUsage: r.onUsage })).doGenerate(params)
    expect(r.seen).toEqual([{ provider: 'opencode', model: 'big-model', promptTokens: 5, completionTokens: 6, totalTokens: 11, reported: true }])
  })

  test('a reply with no usage is null counts and reported=false, never an estimate', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(completion(FREE, 'hello'))))
    const r = reporter()
    await getModel('text', baseEnv({ LLM_PROVIDER: 'openrouter', LLM_MODEL: FREE, OPENROUTER_API_KEY: 'k', onUsage: r.onUsage })).doGenerate(params)
    expect(r.seen).toEqual([{ provider: 'openrouter', model: FREE, promptTokens: null, completionTokens: null, totalTokens: null, reported: false }])
  })

  test('the caller still gets the answer when the reporter throws', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(completion(FREE, 'still here', { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }))))
    const onUsage = () => {
      throw new Error('the reporter broke')
    }
    const out = await getModel('text', baseEnv({ LLM_PROVIDER: 'openrouter', LLM_MODEL: FREE, OPENROUTER_API_KEY: 'k', onUsage })).doGenerate(params)
    expect((out.content as { text: string }[])[0]!.text).toBe('still here')
  })
})

describe('usage from a Workers AI binding reply', () => {
  const bindingEnv = (binding: unknown, over: Partial<AiEnv> = {}) =>
    baseEnv({ LLM_PROVIDER: 'workers-ai', LLM_MODEL: DEEPSEEK, LLM_MODEL_FALLBACKS: GLM, AI_BINDING: binding as never, ...over })

  test('the usage in the binding reply is handed over with the model that answered', async () => {
    const { binding } = fakeBinding((m) => completion(m, 'from the binding', bindingUsage))
    const r = reporter()
    await getModel('text', bindingEnv(binding, { onUsage: r.onUsage })).doGenerate(params)
    expect(r.seen).toEqual([{ provider: 'workers-ai', model: DEEPSEEK, promptTokens: 3, completionTokens: 4, totalTokens: 7, reported: true }])
  })

  test('a binding reply with no usage is null counts and reported=false', async () => {
    const { binding } = fakeBinding((m) => completion(m, 'no numbers'))
    const r = reporter()
    await getModel('text', bindingEnv(binding, { onUsage: r.onUsage })).doGenerate(params)
    expect(r.seen).toEqual([{ provider: 'workers-ai', model: DEEPSEEK, promptTokens: null, completionTokens: null, totalTokens: null, reported: false }])
  })

  test('after a fallback the model that answered is the one recorded, and the one that failed is not', async () => {
    // "model not found" is a model that is gone: it is not retried, so the next model gets the call at once.
    const { binding, runs } = fakeBinding((m) => {
      if (m === DEEPSEEK) throw new Error('model not found')
      return completion(m, 'from the backup', { prompt_tokens: 9, completion_tokens: 2, total_tokens: 11 })
    })
    const r = reporter()
    const out = await getModel('text', bindingEnv(binding, { onUsage: r.onUsage })).doGenerate(params)
    expect((out.content as { text: string }[])[0]!.text).toBe('from the backup')
    expect(runs).toEqual([DEEPSEEK, GLM])
    expect(r.seen).toEqual([{ provider: 'workers-ai', model: GLM, promptTokens: 9, completionTokens: 2, totalTokens: 11, reported: true }])
  })

  test('a mixed chain records the provider of the model that answered', async () => {
    const { binding } = fakeBinding(() => {
      throw new Error('model not found')
    })
    vi.stubGlobal('fetch', vi.fn(async () => json(completion(FREE, 'from openrouter', { prompt_tokens: 4, completion_tokens: 4, total_tokens: 8 }))))
    const r = reporter()
    await getModel('text', bindingEnv(binding, { LLM_MODEL_FALLBACKS: `openrouter:${FREE}`, OPENROUTER_API_KEY: 'k', onUsage: r.onUsage })).doGenerate(params)
    expect(r.seen).toEqual([{ provider: 'openrouter', model: FREE, promptTokens: 4, completionTokens: 4, totalTokens: 8, reported: true }])
  })

  test('a call that is answered from a recorded answer reports nothing, and the recorded answer is unchanged', async () => {
    const { binding, runs } = fakeBinding((m) => completion(m, 'asked once', bindingUsage))
    const store = new MemoryStore()
    const r = reporter()
    const env = bindingEnv(binding, { AI_MODE: 'cache', replayStore: store, onUsage: r.onUsage })
    const first = await getModel('text', env).doGenerate(params)
    const second = await getModel('text', env).doGenerate(params)
    expect(runs).toEqual([DEEPSEEK])
    expect((second.content as { text: string }[])[0]!.text).toBe((first.content as { text: string }[])[0]!.text)
    expect(r.seen).toHaveLength(1)
  })

  test('with no reporter set nothing changes: the call answers as it always did', async () => {
    const { binding } = fakeBinding((m) => completion(m, 'plain', bindingUsage))
    const out = await getModel('text', bindingEnv(binding)).doGenerate(params)
    expect((out.content as { text: string }[])[0]!.text).toBe('plain')
  })
})

describe('modelUsage', () => {
  const std = (input: number | undefined, output: number | undefined, raw?: Record<string, unknown>) => ({
    inputTokens: { total: input, noCache: input, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: output, text: output, reasoning: 0 },
    ...(raw ? { raw } : {}),
  })

  test('the standard counts, and the total as the provider reported it', () => {
    expect(modelUsage('p', 'm', std(10, 5, { total_tokens: 16 }))).toEqual({ provider: 'p', model: 'm', promptTokens: 10, completionTokens: 5, totalTokens: 16, reported: true })
  })

  test('with no reported total the total is the two counts added up', () => {
    expect(modelUsage('p', 'm', std(10, 5))).toMatchObject({ promptTokens: 10, completionTokens: 5, totalTokens: 15, reported: true })
  })

  test('only one count known: that count is kept and the total is not guessed', () => {
    expect(modelUsage('p', 'm', std(10, undefined))).toMatchObject({ promptTokens: 10, completionTokens: null, totalTokens: null, reported: true })
  })

  test.each([[undefined], [null], [{}], [std(undefined, undefined)], [std(0, 0)], ['nonsense'], [{ inputTokens: { total: Number.NaN } }]])('%j is not reported: null counts', (usage) => {
    expect(modelUsage('p', 'm', usage)).toEqual({ provider: 'p', model: 'm', promptTokens: null, completionTokens: null, totalTokens: null, reported: false })
  })
})
