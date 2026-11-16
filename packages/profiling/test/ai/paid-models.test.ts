import { readFileSync } from 'node:fs'
import { generateText } from 'ai'
import { MockLanguageModelV4 } from 'ai/test'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { REPLAYS_FIXTURE, parseReplays } from '../../../../scripts/load-replays'
import {
  MODEL_CALL_TIMEOUT_MS,
  MemoryStore,
  PAID_MODEL_CALL_TIMEOUT_MS,
  ModelTimeoutError,
  ReplayMissError,
  getModel,
  isPaidModel,
  modelCallTimeoutMs,
  modelList,
  recordedFirst,
  replayKey,
  type AiEnv,
} from '../../src/ai'

// P113: the hosted app calls paid hosting of the same open-weights model first and the free listings as fallback, and every recorded
// answer (all of them were saved under a free id) still replays with no new call. These tests use doubles and a stubbed `fetch`: no
// database, no network, no live model.

const PAID = 'nvidia/nemotron-3.5-super-vl'
const FREE1 = 'nvidia/nemotron-3.5-super-vl:free'
const FREE2 = 'nvidia/nemotron-3-ultra-550b-a55b:free'
const FREE3 = 'google/gemma-4-31b-it:free'
/** The config the preview agent is given: the paid id first, then the free list (its own free twin first). */
const PREVIEW = { LLM_PROVIDER: 'openrouter', LLM_MODEL: PAID, LLM_MODEL_FALLBACKS: [FREE1, FREE2, FREE3].join(','), OPENROUTER_API_KEY: 'k' }

const params = { prompt: [{ role: 'user', content: [{ type: 'text', text: 'Write a practice' }] }] } as never
const answer = (text: string) =>
  ({
    content: [{ type: 'text', text }],
    finishReason: { unified: 'stop', raw: 'stop' },
    usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } },
    warnings: [],
  }) as never
const textOf = (r: { content: unknown }) => (r.content as { text: string }[]).map((p) => p.text).join('')

const realSetTimeout = globalThis.setTimeout
/** Only the clock of the model limits is faked. The key of a call is a hash the runtime makes in real time, so a test waits for it for real. */
const fakeClock = () => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
const until = async (done: () => boolean) => {
  for (let i = 0; i < 400 && !done(); i++) await new Promise<void>((r) => realSetTimeout(r, 5))
  expect(done()).toBe(true)
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/** A `fetch` that records which model each request asked for and never answers until the request is cancelled. */
function hangingFetch() {
  const asked: string[] = []
  const fetchMock = vi.fn(
    (_url: unknown, init?: RequestInit) =>
      new Promise<Response>((_, reject) => {
        asked.push(JSON.parse(init?.body as string).model as string)
        init?.signal?.addEventListener('abort', () => reject(new Error('cancelled')))
      }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return { asked, fetchMock }
}

/** A `fetch` that fails the test if it is ever called: the proof that nothing went to a model. */
function noFetch() {
  const fetchMock = vi.fn(async () => {
    throw new Error('a model was called')
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const env = (over: Partial<AiEnv>, store = new MemoryStore()): AiEnv => ({ ...PREVIEW, replayStore: store, ...over }) as AiEnv

describe('the model list', () => {
  test('the first model, then the fallbacks in the order given', () => {
    expect(modelList(PAID, [FREE1, FREE2, FREE3].join(','))).toEqual([PAID, FREE1, FREE2, FREE3])
  })

  test('blanks, spaces, and an id that is already in the list are dropped', () => {
    expect(modelList(PAID, ` ${FREE1} , ,${FREE2},${PAID},${FREE1}, `)).toEqual([PAID, FREE1, FREE2])
  })

  test('the default is unchanged: one model, or the model and its fallbacks as before', () => {
    expect(modelList('a', undefined)).toEqual(['a'])
    expect(modelList('a', '')).toEqual(['a'])
    expect(modelList('a', 'b,a,c')).toEqual(['a', 'b', 'c'])
    // No model set: the list is one empty id, as it always was (the provider then says what is missing).
    expect(modelList(undefined, undefined)).toEqual([''])
  })

  test('getModel builds the chain from LLM_MODEL and LLM_MODEL_FALLBACKS, the vision chain from the VISION pair', () => {
    expect(getModel('text', env({})).modelId).toBe(PAID)
    const vision = getModel('vision', env({ VISION_PROVIDER: 'openrouter', VISION_MODEL: PAID, VISION_MODEL_FALLBACKS: FREE1 }))
    expect(vision.modelId).toBe(PAID)
  })
})

describe('which models are paid, and how long one call may take', () => {
  test('on OpenRouter an id without :free is paid, one with :free is not', () => {
    expect(isPaidModel('openrouter', PAID)).toBe(true)
    expect(isPaidModel('openrouter', FREE1)).toBe(false)
    expect(isPaidModel('openrouter', FREE3.toUpperCase())).toBe(false)
    expect(isPaidModel('openrouter', '')).toBe(false)
  })

  test('other providers keep the old limit: the id says nothing about the price there', () => {
    for (const provider of ['deepseek', 'opencode', 'google', 'openai', 'anthropic']) expect(isPaidModel(provider, 'some-model')).toBe(false)
  })

  test('a paid model gets 90 seconds, every other model keeps 4 minutes', () => {
    expect(PAID_MODEL_CALL_TIMEOUT_MS).toBe(90_000)
    expect(MODEL_CALL_TIMEOUT_MS).toBe(240_000)
    expect(modelCallTimeoutMs('openrouter', PAID)).toBe(90_000)
    expect(modelCallTimeoutMs('openrouter', FREE1)).toBe(240_000)
    expect(modelCallTimeoutMs('opencode', 'some-model-free')).toBe(240_000)
    expect(modelCallTimeoutMs('deepseek', 'deepseek-chat')).toBe(240_000)
  })

  test('live: the paid model gets 90 s, then each free model in list order gets 4 minutes, and the first error goes up', async () => {
    const { asked, fetchMock } = hangingFetch()
    fakeClock()
    const chain = getModel('text', env({ AI_MODE: 'live' }))
    const call = Promise.resolve(chain.doGenerate(params)).catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(89_999)
    expect(asked).toEqual([PAID])
    await vi.advanceTimersByTimeAsync(1)
    expect(asked).toEqual([PAID, FREE1])
    await vi.advanceTimersByTimeAsync(239_999)
    expect(asked).toEqual([PAID, FREE1])
    await vi.advanceTimersByTimeAsync(1)
    expect(asked).toEqual([PAID, FREE1, FREE2])
    await vi.advanceTimersByTimeAsync(240_000)
    expect(asked).toEqual([PAID, FREE1, FREE2, FREE3])
    await vi.advanceTimersByTimeAsync(240_000)
    const err = await call
    expect(err).toBeInstanceOf(ModelTimeoutError)
    expect((err as Error).message).toContain('after 90 seconds')
    // Each model was asked once: a timeout is not tried again on the same model.
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  test('a local run with a free first model is as before: 4 minutes', async () => {
    const { asked } = hangingFetch()
    fakeClock()
    const chain = getModel('text', env({ AI_MODE: 'live', LLM_MODEL: FREE1, LLM_MODEL_FALLBACKS: FREE2 }))
    const call = Promise.resolve(chain.doGenerate(params)).catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(239_999)
    expect(asked).toEqual([FREE1])
    await vi.advanceTimersByTimeAsync(1)
    expect(asked).toEqual([FREE1, FREE2])
    await vi.advanceTimersByTimeAsync(240_000)
    expect(await call).toBeInstanceOf(ModelTimeoutError)
  })
})

describe('recorded answers are looked up under every id of the list before any model is called', () => {
  test('cache: an answer saved under the free id is used, and the paid model is never called', async () => {
    const fetchMock = noFetch()
    const store = new MemoryStore()
    await store.put(await replayKey(FREE1, params), FREE1, answer('recorded under the free id'))
    const out = await getModel('text', env({ AI_MODE: 'cache' }, store)).doGenerate(params)
    expect(textOf(out)).toBe('recorded under the free id')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test.each([FREE2, FREE3, PAID])('cache: an answer saved under %s is found too', async (id) => {
    const fetchMock = noFetch()
    const store = new MemoryStore()
    await store.put(await replayKey(id, params), id, answer(`saved under ${id}`))
    const out = await getModel('text', env({ AI_MODE: 'cache' }, store)).doGenerate(params)
    expect(textOf(out)).toBe(`saved under ${id}`)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('replay: the same, and a call that was never recorded is a miss, with no model asked', async () => {
    const fetchMock = noFetch()
    const store = new MemoryStore()
    await store.put(await replayKey(FREE1, params), FREE1, answer('recorded'))
    const chain = getModel('text', env({ AI_MODE: 'replay' }, store))
    expect(textOf(await chain.doGenerate(params))).toBe('recorded')
    const other = { prompt: [{ role: 'user', content: [{ type: 'text', text: 'never recorded' }] }] } as never
    await expect(chain.doGenerate(other)).rejects.toBeInstanceOf(ReplayMissError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('the miss in replay names the first model of the list, as before', async () => {
    noFetch()
    const other = { prompt: [{ role: 'user', content: [{ type: 'text', text: 'never recorded' }] }] } as never
    const err = await Promise.resolve(getModel('text', env({ AI_MODE: 'replay' })).doGenerate(other)).catch((e: unknown) => e)
    expect((err as Error).message).toContain(`(${PAID}:`)
  })

  test('cache with no recorded answer: the paid model is called first, its answer is saved under the paid id, and the next call is served from storage', async () => {
    const body = JSON.stringify({
      id: 'gen-1',
      model: PAID,
      choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'from the paid model' } }],
      usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 },
    })
    const asked: string[] = []
    const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
      asked.push(JSON.parse(init?.body as string).model as string)
      return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetchMock)
    const store = new MemoryStore()
    const chain = getModel('text', env({ AI_MODE: 'cache' }, store))
    expect(textOf(await chain.doGenerate(params))).toBe('from the paid model')
    expect(asked).toEqual([PAID])
    expect(await store.get(await replayKey(PAID, params))).not.toBeNull()
    expect(await store.get(await replayKey(FREE1, params))).toBeNull()
    expect(textOf(await chain.doGenerate(params))).toBe('from the paid model')
    expect(asked).toEqual([PAID])
  })

  test('record and live modes do not look anything up: the paid model is asked', async () => {
    for (const mode of ['live', 'record'] as const) {
      const { asked } = hangingFetch()
      fakeClock()
      const store = new MemoryStore()
      await store.put(await replayKey(FREE1, params), FREE1, answer('recorded'))
      const call = Promise.resolve(getModel('text', env({ AI_MODE: mode, LLM_MODEL_FALLBACKS: [FREE1, FREE2].join(',') }, store)).doGenerate(params)).catch((e: unknown) => e)
      await until(() => asked.length === 1)
      expect(asked, mode).toEqual([PAID])
      await vi.advanceTimersByTimeAsync(90_000)
      await until(() => asked.length === 2)
      expect(asked, mode).toEqual([PAID, FREE1])
      await vi.advanceTimersByTimeAsync(240_000)
      await until(() => asked.length === 3)
      await vi.advanceTimersByTimeAsync(240_000)
      expect(await call, mode).toBeInstanceOf(ModelTimeoutError)
      expect(asked, mode).toEqual([PAID, FREE1, FREE2])
      vi.useRealTimers()
    }
  })

  test('a model list of one is unchanged: the paid id alone in cache calls the model on a miss', async () => {
    const { asked } = hangingFetch()
    fakeClock()
    const call = Promise.resolve(getModel('text', env({ AI_MODE: 'cache', LLM_MODEL_FALLBACKS: '' })).doGenerate(params)).catch((e: unknown) => e)
    await until(() => asked.length === 1)
    await vi.advanceTimersByTimeAsync(90_000)
    expect(asked).toEqual([PAID])
    expect(await call).toBeInstanceOf(ModelTimeoutError)
  })
})

describe('recordedFirst', () => {
  const miss = (id: string) => new MockLanguageModelV4({ modelId: id, doGenerate: async () => { throw new ReplayMissError(`k-${id}`, id) } })
  const hit = (id: string, text: string) => new MockLanguageModelV4({ modelId: id, doGenerate: async () => answer(text) })
  const broken = (id: string) => new MockLanguageModelV4({ modelId: id, doGenerate: async () => { throw new Error('ai_replays read failed: slow') } })
  const live = (text: string) => new MockLanguageModelV4({ modelId: 'live', doGenerate: async () => answer(text) })

  test('a recorded answer is returned and the live chain is not called', async () => {
    const then = live('from a model')
    const chain = recordedFirst([miss(PAID), hit(FREE1, 'recorded')] as never, then as never, true)
    expect(textOf(await chain.doGenerate(params))).toBe('recorded')
    expect(then.doGenerateCalls.length).toBe(0)
  })

  test('with several recorded answers the free id wins, then list order', async () => {
    const out = await recordedFirst([hit(PAID, 'paid'), hit(FREE2, 'second free'), hit(FREE1, 'first free')] as never, null, false).doGenerate(params)
    expect(textOf(out)).toBe('second free')
    const onlyPaid = await recordedFirst([hit(PAID, 'paid'), miss(FREE1)] as never, null, false).doGenerate(params)
    expect(textOf(onlyPaid)).toBe('paid')
  })

  test('every id is looked up, none of them is a model call', async () => {
    const models = [miss(PAID), miss(FREE1), hit(FREE3, 'recorded')]
    await recordedFirst(models as never, null, false).doGenerate(params)
    expect(models.map((m) => m.doGenerateCalls.length)).toEqual([1, 1, 1])
  })

  test('on a miss everywhere the live chain gets the call', async () => {
    const then = live('from a model')
    const chain = recordedFirst([miss(PAID), miss(FREE1)] as never, then as never, true)
    expect(textOf(await chain.doGenerate(params))).toBe('from a model')
    expect(then.doGenerateCalls.length).toBe(1)
  })

  test('with no live chain a miss everywhere is the first model\'s miss', async () => {
    const err = await Promise.resolve(recordedFirst([miss(PAID), miss(FREE1)] as never, null, false).doGenerate(params)).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ReplayMissError)
    expect((err as Error).message).toContain(`(${PAID})`)
  })

  test('cache: a store that fails is a miss and the model is asked, as in a single layer', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const then = live('from a model')
    const out = await recordedFirst([broken(PAID), miss(FREE1)] as never, then as never, true).doGenerate(params)
    expect(textOf(out)).toBe('from a model')
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })

  test('replay: a store that fails is an error when nothing was found, and a found answer still wins', async () => {
    await expect(recordedFirst([broken(PAID), miss(FREE1)] as never, null, false).doGenerate(params)).rejects.toThrow('ai_replays read failed')
    expect(textOf(await recordedFirst([broken(PAID), hit(FREE1, 'recorded')] as never, null, false).doGenerate(params))).toBe('recorded')
  })

  test('it looks like the first model of the list from outside', () => {
    const then = live('x')
    const chain = recordedFirst([miss(PAID), miss(FREE1)] as never, then as never, true)
    expect(chain.modelId).toBe(PAID)
    expect(chain.provider).toBe(miss(PAID).provider)
  })
})

describe('the demo path still replays with the paid list (the committed fixture)', () => {
  type Part = { type?: string; text?: string }
  type Message = { role: string; content: string | Part[] }
  const rows = parseReplays(readFileSync(REPLAYS_FIXTURE))
  const text = (content: string | Part[]) => (typeof content === 'string' ? content : content.map((p) => p.text ?? '').join(''))
  // A recorded answer keeps the request the model was sent. The lesson calls are plain text, so each can be asked again exactly as the job
  // asks it (`generateJson`: a system text and a prompt), and the key it gets must be the key the row was saved under.
  const lessons = rows.flatMap((row) => {
    const messages = (row.response as { request?: { body?: { messages?: Message[] } } }).request?.body?.messages ?? []
    const system = messages.find((m) => m.role === 'system')
    const user = messages.find((m) => m.role === 'user')
    if (!system || !user || (typeof user.content !== 'string' && user.content.some((p) => p.type !== 'text'))) return []
    return /# Job: write_lesson/.test(text(system.content)) ? [{ row, system: text(system.content), prompt: text(user.content) }] : []
  })
  const savedText = (response: unknown) => ((response as { content?: Part[] }).content ?? []).filter((p) => p.type === 'text').map((p) => p.text ?? '').join('')

  test('every id a recorded answer was saved under is in the list the preview uses', () => {
    const list = new Set(modelList(PREVIEW.LLM_MODEL, PREVIEW.LLM_MODEL_FALLBACKS))
    const saved = [...new Set(rows.map((r) => r.model))]
    expect(saved.length).toBeGreaterThan(0)
    expect(saved.filter((id) => !list.has(id))).toEqual([])
  })

  test('the lesson calls are found in the fixture: asked again as the job asks, each has the key of its row', async () => {
    expect(lessons.length).toBeGreaterThanOrEqual(30)
    for (const l of lessons) {
      let call: unknown
      const spy = new MockLanguageModelV4({ modelId: l.row.model, doGenerate: async (o: unknown) => ((call = o), answer('x')) })
      await generateText({ model: spy, system: l.system, prompt: l.prompt })
      expect(await replayKey(l.row.model, call), l.row.key).toBe(l.row.key)
    }
  })

  test.each(['cache', 'replay'] as const)('%s: every recorded lesson is answered with the paid id first, and no model is called', async (mode) => {
    const fetchMock = noFetch()
    const store = new MemoryStore()
    for (const r of rows) await store.put(r.key, r.model, r.response)
    const model = getModel('text', env({ AI_MODE: mode }, store))
    expect(model.modelId).toBe(PAID)
    for (const l of lessons) expect((await generateText({ model, system: l.system, prompt: l.prompt })).text, l.row.key).toBe(savedText(l.row.response))
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
