import { APICallError, wrapLanguageModel } from 'ai'
import { MockLanguageModelV4 } from 'ai/test'
import { describe, expect, test, vi } from 'vitest'
import { getModel, getSpeechModel, isModelGoneError, isRefusalError, MemoryStore, withModelRetry, type AiEnv } from '../../src/ai'

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
  // P121b: any error moves on to the next model, a 400 too. With no model left the first error goes up.
  expect((await withFallbacks([bad, b] as never).doGenerate(params)).content).toEqual([{ type: 'text', text: 'from b' }])
  expect(b.doGenerateCalls.length).toBe(2)
  await expect(withFallbacks([bad, bad] as never).doGenerate(params)).rejects.toThrow('bad request')
  const miss = new MockLanguageModelV4({ modelId: 'd', doGenerate: async () => { throw new ReplayMissError('k') } })
  expect((await withFallbacks([miss, b] as never).doGenerate(params)).content).toEqual([{ type: 'text', text: 'from b' }])
})

test('extractJson takes the first object, ignoring fences, text and a second object after it', async () => {
  const { extractJson } = await import('../../src/ai')
  expect(extractJson('Here:\n```json\n{"a":{"b":"}"},"c":[1]}\n```\nthanks {x}')).toEqual({ a: { b: '}' }, c: [1] })
  expect(extractJson('{"a":1}\n{"a":2}')).toEqual({ a: 1 })
  expect(() => extractJson('{"a":')).toThrow('No object generated')
})

// One live model call has a time limit. These tests use a short limit (a few milliseconds) and doubles for the model: no network.
describe('a model call that never answers', () => {
  const answer = { content: [{ type: 'text', text: 'hi' }], finishReason: { unified: 'stop', raw: 'stop' }, usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } }, warnings: [] } as never
  const params = { prompt: [{ role: 'user', content: [{ type: 'text', text: 'q' }] }] } as never
  /** Never answers: the promise ends only when the call is cancelled. */
  const hang = (options: { abortSignal?: AbortSignal }) =>
    new Promise<never>((_, reject) => {
      const stop = () => reject(new Error('This operation was aborted'))
      if (options.abortSignal?.aborted) stop()
      else options.abortSignal?.addEventListener('abort', stop)
    })

  async function parts() {
    const { MockLanguageModelV4 } = await import('ai/test')
    const { wrapLanguageModel } = await import('ai')
    const lib = await import('../../src/ai')
    return { MockLanguageModelV4, wrapLanguageModel, ...lib }
  }

  test('the limit is 4 minutes by default, one try and not the sum of the retries', async () => {
    const { MODEL_CALL_TIMEOUT_MS } = await parts()
    expect(MODEL_CALL_TIMEOUT_MS).toBe(240_000)
  })

  test('ends after the limit with an error that says timeout, and the call is cancelled', async () => {
    const { MockLanguageModelV4, wrapLanguageModel, withModelRetry, ModelTimeoutError } = await parts()
    const m = new MockLanguageModelV4({ doGenerate: async (options) => hang(options) })
    const started = Date.now()
    const err = await Promise.resolve(wrapLanguageModel({ model: m, middleware: withModelRetry(async () => {}, [], 30) }).doGenerate(params)).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ModelTimeoutError)
    expect((err as Error).message).toMatch(/timeout/i)
    expect(Date.now() - started).toBeLessThan(2000)
    expect(m.doGenerateCalls.length).toBe(1)
    expect(m.doGenerateCalls[0]!.abortSignal?.aborted).toBe(true)
  })

  test('a timeout is not tried again on the same model: it is thrown at once, with no wait', async () => {
    const { MockLanguageModelV4, wrapLanguageModel, withModelRetry, ModelTimeoutError } = await parts()
    const waits: number[] = []
    const m = new MockLanguageModelV4({ doGenerate: async (options) => hang(options) })
    await expect(wrapLanguageModel({ model: m, middleware: withModelRetry(async (ms) => void waits.push(ms), [7, 8, 9], 20) }).doGenerate(params)).rejects.toBeInstanceOf(ModelTimeoutError)
    expect(m.doGenerateCalls.length).toBe(1)
    expect(waits).toEqual([])
  })

  test('one model only, and it never answers: one call, and a timeout error goes up', async () => {
    const { MockLanguageModelV4, wrapLanguageModel, withModelRetry, withFallbacks, ModelTimeoutError } = await parts()
    const m = new MockLanguageModelV4({ doGenerate: async (options) => hang(options) })
    const chain = withFallbacks([wrapLanguageModel({ model: m, middleware: withModelRetry(async () => {}, [1, 2, 3], 20) })])
    const err = await Promise.resolve(chain.doGenerate(params)).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ModelTimeoutError)
    expect((err as Error).message).toMatch(/timeout/i)
    expect(m.doGenerateCalls.length).toBe(1)
  })

  test('the next model gets the call: model 1 never answers, model 2 answers, and the time spent is one limit', async () => {
    const { MockLanguageModelV4, wrapLanguageModel, withModelRetry, withFallbacks } = await parts()
    const waits: number[] = []
    const sleep = async (ms: number) => void waits.push(ms)
    const first = new MockLanguageModelV4({ modelId: 'one', doGenerate: async (options) => hang(options) })
    const second = new MockLanguageModelV4({ modelId: 'two', doGenerate: async () => ({ ...(answer as object), content: [{ type: 'text', text: 'from two' }] }) as never })
    const chain = withFallbacks([
      wrapLanguageModel({ model: first, middleware: withModelRetry(sleep, [1, 2, 3], 40) }),
      wrapLanguageModel({ model: second, middleware: withModelRetry(sleep, [1, 2, 3], 40) }),
    ])
    const started = Date.now()
    const out = await chain.doGenerate(params)
    const spent = Date.now() - started
    expect(out.content).toEqual([{ type: 'text', text: 'from two' }])
    expect(first.doGenerateCalls.length).toBe(1)
    expect(second.doGenerateCalls.length).toBe(1)
    expect(waits).toEqual([])
    // One limit (40 ms here), not five tries of it.
    expect(spent).toBeGreaterThanOrEqual(35)
    expect(spent).toBeLessThan(150)
  })

  test('with no model left, the timeout error goes up as it did, and each model was called once', async () => {
    const { MockLanguageModelV4, wrapLanguageModel, withModelRetry, withFallbacks, ModelTimeoutError } = await parts()
    const first = new MockLanguageModelV4({ modelId: 'one', doGenerate: async (options) => hang(options) })
    const second = new MockLanguageModelV4({ modelId: 'two', doGenerate: async (options) => hang(options) })
    const chain = withFallbacks([
      wrapLanguageModel({ model: first, middleware: withModelRetry(async () => {}, [1, 2], 20) }),
      wrapLanguageModel({ model: second, middleware: withModelRetry(async () => {}, [1, 2], 20) }),
    ])
    await expect(chain.doGenerate(params)).rejects.toBeInstanceOf(ModelTimeoutError)
    expect(first.doGenerateCalls.length).toBe(1)
    expect(second.doGenerateCalls.length).toBe(1)
  })

  test('a 500 from model 1 is retried on model 1 as before, and only then does model 2 get the call', async () => {
    const { MockLanguageModelV4, wrapLanguageModel, withModelRetry, withFallbacks } = await parts()
    const waits: number[] = []
    const sleep = async (ms: number) => void waits.push(ms)
    let tries = 0
    const first = new MockLanguageModelV4({
      modelId: 'one',
      doGenerate: async () => {
        tries++
        throw Object.assign(new Error('Internal server error'), { statusCode: 500 })
      },
    })
    const second = new MockLanguageModelV4({ modelId: 'two', doGenerate: async () => answer })
    const chain = withFallbacks([
      wrapLanguageModel({ model: first, middleware: withModelRetry(sleep, [5, 6], 5000) }),
      wrapLanguageModel({ model: second, middleware: withModelRetry(sleep, [5, 6], 5000) }),
    ])
    expect((await chain.doGenerate(params)).content).toEqual([{ type: 'text', text: 'hi' }])
    expect(tries).toBe(3)
    expect(waits).toEqual([5, 6])
    expect(second.doGenerateCalls.length).toBe(1)
  })

  test('a 500 that goes away on model 1 is answered by model 1, as before', async () => {
    const { MockLanguageModelV4, wrapLanguageModel, withModelRetry } = await parts()
    const waits: number[] = []
    let tries = 0
    const m = new MockLanguageModelV4({
      doGenerate: async () => {
        if (++tries < 2) throw Object.assign(new Error('Internal server error'), { statusCode: 500 })
        return answer
      },
    })
    const out = await wrapLanguageModel({ model: m, middleware: withModelRetry(async (ms) => void waits.push(ms), [5, 6], 5000) }).doGenerate(params)
    expect(out.content).toEqual([{ type: 'text', text: 'hi' }])
    expect(waits).toEqual([5])
  })

  test('a call that answers in time is untouched, and its timer is gone', async () => {
    const { MockLanguageModelV4, wrapLanguageModel, withModelRetry } = await parts()
    vi.useFakeTimers()
    try {
      const m = new MockLanguageModelV4({ doGenerate: async () => answer })
      const out = await wrapLanguageModel({ model: m, middleware: withModelRetry(async () => {}, [1], 240_000) }).doGenerate(params)
      expect(out).toBe(answer)
      expect(vi.getTimerCount()).toBe(0)
      expect(m.doGenerateCalls.length).toBe(1)
      // The model got the same call as before, with one more thing: the signal that cancels it.
      const { abortSignal: signal, ...rest } = m.doGenerateCalls[0]!
      expect(signal).toBeInstanceOf(AbortSignal)
      expect(signal!.aborted).toBe(false)
      expect(rest).toEqual(params)
    } finally {
      vi.useRealTimers()
    }
  })

  test('the caller\'s own cancel still works: it is not a timeout and it is not retried', async () => {
    const { MockLanguageModelV4, wrapLanguageModel, withModelRetry } = await parts()
    const m = new MockLanguageModelV4({ doGenerate: async (options) => hang(options) })
    const caller = new AbortController()
    const call = wrapLanguageModel({ model: m, middleware: withModelRetry(async () => {}, [1, 2], 5000) }).doGenerate({ ...(params as object), abortSignal: caller.signal } as never)
    setTimeout(() => caller.abort(), 10)
    await expect(call).rejects.toThrow('This operation was aborted')
    expect(m.doGenerateCalls.length).toBe(1)
  })

  test('a call that already holds a cancelled signal is not started as a live call that can hang', async () => {
    const { MockLanguageModelV4, wrapLanguageModel, withModelRetry } = await parts()
    const m = new MockLanguageModelV4({ doGenerate: async (options) => hang(options) })
    const caller = new AbortController()
    caller.abort()
    const call = wrapLanguageModel({ model: m, middleware: withModelRetry(async () => {}, [], 5000) }).doGenerate({ ...(params as object), abortSignal: caller.signal } as never)
    await expect(call).rejects.toThrow('This operation was aborted')
  })

  test('in replay mode nothing is timed: a recorded answer comes back with no timer, a miss is a miss', async () => {
    const { MockLanguageModelV4, wrapLanguageModel, withModelRetry, withReplay, MemoryStore, ReplayMissError } = await parts()
    const store = new MemoryStore()
    const inner = new MockLanguageModelV4({ modelId: 'replayed', doGenerate: async () => answer })
    await wrapLanguageModel({ model: inner, middleware: [withReplay(store, 'record'), withModelRetry(async () => {}, [], 240_000)] }).doGenerate(params)
    expect(inner.doGenerateCalls.length).toBe(1)

    vi.useFakeTimers()
    try {
      const replaying = new MockLanguageModelV4({ modelId: 'replayed', doGenerate: async (o) => hang(o) })
      const chain = wrapLanguageModel({ model: replaying, middleware: [withReplay(store, 'replay'), withModelRetry(async () => {}, [], 240_000)] })
      const hit = await chain.doGenerate(params)
      expect(hit.content).toEqual([{ type: 'text', text: 'hi' }])
      expect(vi.getTimerCount()).toBe(0)
      const other = { prompt: [{ role: 'user', content: [{ type: 'text', text: 'something never recorded' }] }] } as never
      await expect(chain.doGenerate(other)).rejects.toBeInstanceOf(ReplayMissError)
      expect(vi.getTimerCount()).toBe(0)
      expect(replaying.doGenerateCalls.length).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  test('the replay key does not change: the replay layer sees the call as it was, the signal is added below it', async () => {
    const { MockLanguageModelV4, wrapLanguageModel, withModelRetry, withReplay, replayKey } = await parts()
    const keys = async (middleware: never[]) => {
      const seen: string[] = []
      const store = { get: async () => null, put: async (key: string) => void seen.push(key) }
      const inner = new MockLanguageModelV4({ modelId: 'keyed', doGenerate: async () => answer })
      const withStore = [withReplay(store, 'record'), ...middleware]
      await wrapLanguageModel({ model: inner, middleware: withStore }).doGenerate(params)
      return seen
    }
    const before = await keys([])
    const after = await keys([withModelRetry(async () => {}, [], 240_000)] as never[])
    expect(after).toEqual(before)
    expect(after).toEqual([await replayKey('keyed', params)])
  })

  test('getModel puts the time limit on the live model, inside the replay layer', async () => {
    const { getModel, MemoryStore } = await parts()
    const fetchMock = vi.fn((_url: unknown, init?: RequestInit) => new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted by the limit')))))
    vi.stubGlobal('fetch', fetchMock)
    vi.useFakeTimers()
    try {
      const m = getModel('text', { AI_MODE: 'live', replayStore: new MemoryStore(), LLM_PROVIDER: 'opencode', LLM_MODEL: 'some-model-free', OPENCODE_API_KEY: 'k' })
      const call = Promise.resolve(m.doGenerate(params)).catch((e: unknown) => e)
      await vi.advanceTimersByTimeAsync(240_000)
      // The try ended with the limit: the request was cancelled, and the same model is not asked again.
      expect(await call).toBeInstanceOf((await import('../../src/ai')).ModelTimeoutError)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect((fetchMock.mock.calls[0]![1] as RequestInit).signal?.aborted).toBe(true)
      await vi.advanceTimersByTimeAsync(60_000)
      expect(fetchMock).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
      vi.unstubAllGlobals()
    }
  })
})

// P121i: a Cloudflare model id that does not exist is skipped at once. The real Workers AI binding throws, for an id it does not have (captured
// 17 November 2026 from a local wrangler dev, no model ran): an Error (class InferenceUpstreamError) with name "AiError", the message
// "5007: No such model @cf/deepseek-ai/not-a-model or task", and no code, status, statusCode or cause. Doubles only: no network, no database.
describe('a model that does not exist ("5007: No such model") is a gone model', () => {
  const NO_SUCH_MODEL = '5007: No such model @cf/deepseek-ai/not-a-model or task'
  /** The error as the real binding throws it. */
  const bindingError = () => Object.assign(new Error(NO_SUCH_MODEL), { name: 'AiError' })
  const apiCallError = (message: string, statusCode: number, cause?: unknown) => new APICallError({ message, url: 'https://workers-ai.binding/v1/chat/completions', requestBodyValues: {}, statusCode, cause })

  test('isModelGoneError is true for the error the real binding throws, and for the words alone, whatever their case', () => {
    expect(isModelGoneError(bindingError())).toBe(true)
    expect(isModelGoneError(new Error(NO_SUCH_MODEL))).toBe(true)
    expect(isModelGoneError(new Error('No such model'))).toBe(true)
    expect(isModelGoneError(new Error('no such model @cf/zai-org/not-a-model'))).toBe(true)
    expect(isModelGoneError(new Error('NO SUCH MODEL'))).toBe(true)
  })

  test('it is true when an APICallError (a 500) carries the words in its message, or when they are in its cause', () => {
    expect(isModelGoneError(apiCallError(NO_SUCH_MODEL, 500))).toBe(true)
    expect(isModelGoneError(apiCallError('Cannot connect', 500, bindingError()))).toBe(true)
    expect(isModelGoneError({ message: 'wrapped', cause: bindingError() })).toBe(true)
    expect(isModelGoneError({ message: 'wrapped twice', cause: { message: 'inner', cause: new Error(NO_SUCH_MODEL) } })).toBe(true)
  })

  test('a plain 500, a capacity error and the other old words keep their meaning: not gone, or gone as before', () => {
    expect(isModelGoneError(apiCallError('Internal error', 500))).toBe(false)
    expect(isModelGoneError(new Error('Internal error'))).toBe(false)
    expect(isModelGoneError(apiCallError('Capacity temporarily exceeded', 429))).toBe(false)
    expect(isModelGoneError(new Error('AiError: something broke'))).toBe(false)
    expect(isModelGoneError(new Error('No endpoints found for nvidia/foo:free.'))).toBe(true)
    // "such" and "model" apart are not the words.
    expect(isModelGoneError(new Error('No such file'))).toBe(false)
    expect(isModelGoneError(new Error('the model answered with such a long text'))).toBe(false)
  })

  test('isRefusalError follows (the dynamic list leaves out a model that does not exist)', () => {
    expect(isRefusalError(bindingError())).toBe(true)
    expect(isRefusalError(apiCallError('Internal error', 500))).toBe(false)
  })

  test('the retry layer throws it at once: one try and no wait', async () => {
    const waits: number[] = []
    const sleep = async (ms: number) => void waits.push(ms)
    // What the provider throws for it: a 500 whose message holds the binding's words (the message alone must be enough to skip the model).
    const gone = new MockLanguageModelV4({ doGenerate: async () => { throw apiCallError(NO_SUCH_MODEL, 500) } })
    const params = { prompt: [{ role: 'user', content: [{ type: 'text', text: 'q' }] }] } as never
    await expect(wrapLanguageModel({ model: gone, middleware: withModelRetry(sleep, [1, 2, 3, 4]) }).doGenerate(params)).rejects.toThrow('No such model')
    expect(gone.doGenerateCalls.length).toBe(1)
    expect(waits).toEqual([])
    // An ordinary 500 is still retried with the waits, as before.
    const waits500: number[] = []
    const broken = new MockLanguageModelV4({ doGenerate: async () => { throw apiCallError('Internal error', 500) } })
    await expect(wrapLanguageModel({ model: broken, middleware: withModelRetry(async (ms) => void waits500.push(ms), [1, 2, 3]) }).doGenerate(params)).rejects.toThrow('Internal error')
    expect(broken.doGenerateCalls.length).toBe(4)
    expect(waits500).toEqual([1, 2, 3])
  })
})
