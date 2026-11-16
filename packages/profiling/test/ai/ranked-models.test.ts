import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { wrapLanguageModel } from 'ai'
import { MockLanguageModelV4 } from 'ai/test'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  AA_FREE_MODELS_URL,
  DYNAMIC_FREE_MODEL_CALL_TIMEOUT_MS,
  MemoryStore,
  ModelTimeoutError,
  OPENROUTER_MODELS_URL,
  ReplayMissError,
  aaPageUrl,
  getModel,
  isModelGoneError,
  modelCallTimeoutMs,
  replayKey,
  resetCatalogMemo,
  withFallbacks,
  withModelRetry,
  type AiEnv,
} from '../../src/ai'

// P121: with AI_MODEL_RANKING=artificial-analysis the hosted app asks OpenRouter and Artificial Analysis which free models to use, every
// hour, and calls them in that order. These tests use doubles, the two committed fixtures and a stubbed `fetch` that serves the lists and
// the model calls: no database, no network, no live model.

const fixture = (name: string) => JSON.parse(readFileSync(join(import.meta.dirname, '../fixtures', name), 'utf8')) as { data: Array<{ id: string }> }
const OR = fixture('openrouter-models-2026-11-16.json')
/** The invented Artificial Analysis answer: real model names, invented scores, in 2 pages. */
const AA_PAGES = [fixture('aa-free-models.synthetic.page1.json'), fixture('aa-free-models.synthetic.page2.json')]

const PAID = 'nvidia/nemotron-3.5-super-vl'
const SUPER = 'nvidia/nemotron-3.5-super-vl:free'
const ULTRA = 'nvidia/nemotron-3-ultra-550b-a55b:free'
const GEMMA31 = 'google/gemma-4-31b-it:free'
const GEMMA26 = 'google/gemma-4-26b-a4b-it:free'
const ERNIE = 'baidu/ernie-5.5-flash-preview:free'
const LING = 'inclusionai/ling-3.2-flash:free'
const INKLING = 'thinkingmachines/inkling-2-small:free'
const LFM = 'liquid/lfm-3-1.7b:free'
const LIGHTNING = 'nvidia/nemotron-3.5-lightning:free'

/** What the preview agent holds today, plus the two switches of P121. */
const PREVIEW = {
  LLM_PROVIDER: 'openrouter',
  LLM_MODEL: PAID,
  LLM_MODEL_FALLBACKS: [SUPER, ULTRA, GEMMA31].join(','),
  OPENROUTER_API_KEY: 'k',
  AI_MODEL_RANKING: 'artificial-analysis',
  AA_API_KEY: 'aa-key',
}
const env = (over: Partial<AiEnv> = {}, store = new MemoryStore()): AiEnv => ({ ...PREVIEW, AI_MODE: 'live', replayStore: store, ...over }) as AiEnv

const CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions'
const params = { prompt: [{ role: 'user', content: [{ type: 'text', text: 'Write a practice' }] }] } as never
const answer = (text: string) =>
  ({
    content: [{ type: 'text', text }],
    finishReason: { unified: 'stop', raw: 'stop' },
    usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } },
    warnings: [],
  }) as never
const textOf = (r: { content: unknown }) => (r.content as { text: string }[]).map((p) => p.text).join('')

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const completion = (model: string, text: string) =>
  json({ id: 'gen-1', model, choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: text } }], usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 } })
const gone = (model: string) => json({ error: { message: `No endpoints found for ${model}.`, code: 404 } }, 404)
const unpaid = () => json({ error: { message: 'Insufficient credits. Add more using https://openrouter.ai/credits', code: 402 } }, 402)

type Net = {
  /** Called for each model call. Return a Response, or a promise that never settles to hang. */
  chat?: (model: string, init: RequestInit) => Response | Promise<Response>
  aa?: 'ok' | 'fail'
  /** The AA pages served (default: the two pages of the fixture), and a page number that answers 500. */
  aaPages?: unknown[]
  aaFailPage?: number
  openrouter?: 'ok' | 'fail'
  /** The OpenRouter list served: default is the whole fixture. */
  list?: unknown[]
}

/** A `fetch` that serves both lists and the model calls, and records every URL and every model asked. */
function network(net: Net = {}) {
  const urls: string[] = []
  const asked: string[] = []
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input)
    urls.push(url)
    if (url === OPENROUTER_MODELS_URL) return net.openrouter === 'fail' ? json({}, 503) : json({ data: net.list ?? OR.data })
    if (url.startsWith(AA_FREE_MODELS_URL)) {
      const page = Number(new URL(url).searchParams.get('page'))
      if (net.aa === 'fail') return json({}, 401)
      if (net.aaFailPage === page) return json({}, 500)
      return json((net.aaPages ?? AA_PAGES)[page - 1] ?? { data: [] })
    }
    if (url === CHAT_URL) {
      const model = JSON.parse(init?.body as string).model as string
      asked.push(model)
      return net.chat ? net.chat(model, init!) : completion(model, `from ${model}`)
    }
    throw new Error(`unexpected url ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  const catalogCalls = () => urls.filter((u) => u === OPENROUTER_MODELS_URL || u.startsWith(AA_FREE_MODELS_URL))
  return { urls, asked, fetchMock, catalogCalls }
}

/** A model call that never answers until it is cancelled, as in paid-models.test.ts. */
const hang = (_model: string, init: RequestInit) =>
  new Promise<Response>((_, reject) => {
    init.signal?.addEventListener('abort', () => reject(new Error('cancelled')))
  })

const realSetTimeout = globalThis.setTimeout
const fakeClock = () => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
const until = async (done: () => boolean) => {
  for (let i = 0; i < 400 && !done(); i++) await new Promise<void>((r) => realSetTimeout(r, 5))
  expect(done()).toBe(true)
}

beforeEach(() => resetCatalogMemo())
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('the switch: AI_MODEL_RANKING', () => {
  test.each([undefined, '', 'off', 'artificial_analysis'])('%s is today\'s behaviour: the pinned list, and no list is read', async (flag) => {
    const { asked, urls } = network({ chat: (m) => (m === PAID ? gone(m) : completion(m, `from ${m}`)) })
    const out = await getModel('text', env({ AI_MODEL_RANKING: flag })).doGenerate(params)
    expect(textOf(out)).toBe(`from ${SUPER}`)
    expect(asked).toEqual([PAID, SUPER])
    expect(urls.every((u) => u === CHAT_URL)).toBe(true)
  })

  test('another provider with the switch on is unchanged: no list is read', async () => {
    const { urls } = network()
    const model = getModel('text', env({ LLM_PROVIDER: 'opencode', LLM_MODEL: 'some-model-free', OPENCODE_API_KEY: 'k', LLM_MODEL_FALLBACKS: '' }))
    await Promise.resolve(model.doGenerate(params)).catch(() => {})
    expect(urls).not.toContain(OPENROUTER_MODELS_URL)
    expect(urls).not.toContain(AA_FREE_MODELS_URL)
  })

  test('getModel stays synchronous, and the model reports the first pinned id', () => {
    network()
    const model = getModel('text', env())
    expect(model).not.toBeInstanceOf(Promise)
    expect(typeof model.doGenerate).toBe('function')
    expect(model.modelId).toBe(PAID)
    expect(model.provider).toContain('openrouter')
    expect(getModel('text', env({ LLM_MODEL: SUPER, LLM_MODEL_FALLBACKS: '' })).modelId).toBe(SUPER)
    const vision = getModel('vision', env({ VISION_PROVIDER: 'openrouter', VISION_MODEL: PAID, VISION_MODEL_FALLBACKS: SUPER }))
    expect(vision.modelId).toBe(PAID)
  })

  test('building the model reads nothing: the lists are read at the first call', () => {
    const { fetchMock } = network()
    getModel('text', env())
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('the dynamic list in a live call', () => {
  test('text: the paid pinned id first, then the best-ranked free models, then the rest of the pinned list, and no repeats', async () => {
    const { asked } = network({ chat: gone })
    await expect(getModel('text', env()).doGenerate(params)).rejects.toThrow('No endpoints found for nvidia/nemotron-3.5-super-vl')
    expect(asked).toEqual([PAID, INKLING, SUPER, ULTRA, LIGHTNING, GEMMA31])
  })

  test('text with a pinned free model outside the top 4: it comes last', async () => {
    const { asked } = network({ chat: gone })
    await expect(getModel('text', env({ LLM_MODEL_FALLBACKS: GEMMA26 })).doGenerate(params)).rejects.toThrow()
    expect(asked).toEqual([PAID, INKLING, SUPER, ULTRA, LIGHTNING, GEMMA26])
  })

  test('photo job: only models that take images, and a pinned text-only model is left out', async () => {
    const { asked } = network({ chat: gone })
    const vision = getModel('vision', env({ VISION_PROVIDER: 'openrouter', VISION_MODEL: PAID, VISION_MODEL_FALLBACKS: [SUPER, ULTRA, GEMMA31].join(',') }))
    await expect(vision.doGenerate(params)).rejects.toThrow()
    // Only three rated models take images; the pinned ones follow, and the text-only ultra model is left out.
    expect(asked).toEqual([PAID, INKLING, SUPER, GEMMA31])
    expect(asked).not.toContain(ULTRA)
    const byId = new Map(OR.data.map((m) => [m.id, m as unknown as { architecture: { input_modalities: string[] } }]))
    for (const id of asked) expect(byId.get(id)?.architecture.input_modalities, id).toContain('image')
  })

  test('with no AA key the newest free models come first', async () => {
    const { asked, catalogCalls } = network({ chat: gone })
    await expect(getModel('text', env({ AA_API_KEY: undefined })).doGenerate(params)).rejects.toThrow()
    expect(asked).toEqual([PAID, LING, ERNIE, INKLING, LFM, SUPER, ULTRA, GEMMA31])
    expect(catalogCalls()).toEqual([OPENROUTER_MODELS_URL])
  })

  test('with AA unreadable (401) the newest free models come first', async () => {
    const { asked } = network({ chat: gone, aa: 'fail' })
    await expect(getModel('text', env()).doGenerate(params)).rejects.toThrow()
    expect(asked.slice(0, 3)).toEqual([PAID, LING, ERNIE])
  })

  const row = (slug: string, name: string, score: number) => ({ slug, name, evaluations: { artificial_analysis_intelligence_index: score } })
  const page = (n: number, hasMore: boolean, data: unknown[]) => ({ tier: 'free', pagination: { page: n, page_size: 3, total_pages: 2, has_more: hasMore }, data })
  /** The best models of the hour are on page 2, as the best of the real list were on later pages. */
  const lateBest = [
    page(1, true, [row('nemotron-3-5-lightning', 'Nemotron 3.5 Lightning', 35), row('north-mini-code', 'North Mini Code', 32), row('claude-opus-5-5', 'Claude Opus 5.5', 70)]),
    page(2, false, [row('inkling-2-small', 'Inkling 2 Small', 44), row('nemotron-3-5-super-vl', 'Nemotron 3.5 Super VL', 41), row('nvidia-nemotron-3-ultra-550b-a55b', 'Nemotron 3 Ultra', 38)]),
  ]

  test('the best model can be on page 2 of the AA list: it still ranks first, and page 1 alone would not have found it', async () => {
    const { asked, catalogCalls } = network({ chat: gone, aaPages: lateBest })
    await expect(getModel('text', env()).doGenerate(params)).rejects.toThrow()
    expect(asked).toEqual([PAID, INKLING, SUPER, ULTRA, LIGHTNING, GEMMA31])
    expect(catalogCalls()).toEqual([OPENROUTER_MODELS_URL, aaPageUrl(1), aaPageUrl(2)])
    // The same answer cut to page 1 (what reading one page gives) puts the late models nowhere.
    resetCatalogMemo()
    vi.unstubAllGlobals()
    const first = network({ chat: gone, aaPages: [{ ...lateBest[0] as object, pagination: { page: 1, has_more: false } }] })
    await expect(getModel('text', env()).doGenerate(params)).rejects.toThrow()
    expect(first.asked).toEqual([PAID, LIGHTNING, 'cohere/north-mini-code:free', SUPER, ULTRA, GEMMA31])
  })

  test('the best model can be on page 2 for a photo job as well', async () => {
    const { asked } = network({ chat: gone, aaPages: lateBest })
    const vision = getModel('vision', env({ VISION_PROVIDER: 'openrouter', VISION_MODEL: PAID, VISION_MODEL_FALLBACKS: [SUPER, ULTRA, GEMMA31].join(',') }))
    await expect(vision.doGenerate(params)).rejects.toThrow()
    expect(asked).toEqual([PAID, INKLING, SUPER, GEMMA31])
  })

  test('if page 2 fails the AA list is unavailable: the newest free models come first, and the list is asked for again after 5 minutes', async () => {
    const { asked, catalogCalls } = network({ chat: gone, aaFailPage: 2 })
    await expect(getModel('text', env()).doGenerate(params)).rejects.toThrow()
    expect(asked).toEqual([PAID, LING, ERNIE, INKLING, LFM, SUPER, ULTRA, GEMMA31])
    expect(catalogCalls()).toEqual([OPENROUTER_MODELS_URL, aaPageUrl(1), aaPageUrl(2)])
  })

  test('an AA answer with no pagination block is read as one page', async () => {
    const onlyPage = { data: [row('inkling-2-small', 'Inkling 2 Small', 44), row('nemotron-3-5-lightning', 'Nemotron 3.5 Lightning', 35)] }
    const { asked, catalogCalls } = network({ chat: gone, aaPages: [onlyPage] })
    await expect(getModel('text', env()).doGenerate(params)).rejects.toThrow()
    expect(asked).toEqual([PAID, INKLING, LIGHTNING, SUPER, ULTRA, GEMMA31])
    expect(catalogCalls()).toEqual([OPENROUTER_MODELS_URL, aaPageUrl(1)])
  })

  test('with the OpenRouter list unreadable the pinned list is called as it is', async () => {
    const { asked } = network({ chat: gone, openrouter: 'fail' })
    await expect(getModel('text', env()).doGenerate(params)).rejects.toThrow()
    expect(asked).toEqual([PAID, SUPER, ULTRA, GEMMA31])
  })

  test('a pinned free model that OpenRouter removed is not called, and the call still reaches the others', async () => {
    const list = OR.data.filter((m) => m.id !== SUPER)
    const { asked } = network({ chat: (m) => (m === ULTRA ? completion(m, 'ultra answered') : gone(m)), list })
    const out = await getModel('text', env()).doGenerate(params)
    expect(textOf(out)).toBe('ultra answered')
    expect(asked).toEqual([PAID, INKLING, ULTRA])
    asked.length = 0
    await expect(getModel('text', env({ LLM_MODEL_FALLBACKS: [SUPER, GEMMA31].join(',') })).doGenerate(params)).resolves.toBeDefined()
    expect(asked).not.toContain(SUPER)
  })

  test('the lists are read once for the hour, however many calls', async () => {
    const { catalogCalls, asked } = network()
    const model = getModel('text', env())
    await model.doGenerate(params)
    await model.doGenerate(params)
    await getModel('text', env()).doGenerate(params)
    expect(catalogCalls()).toEqual([OPENROUTER_MODELS_URL, aaPageUrl(1), aaPageUrl(2)])
    expect(asked).toEqual([PAID, PAID, PAID])
  })

  test('the text and the photo model share the one read of the lists', async () => {
    const { catalogCalls } = network()
    await getModel('text', env()).doGenerate(params)
    await getModel('vision', env({ VISION_PROVIDER: 'openrouter', VISION_MODEL: PAID, VISION_MODEL_FALLBACKS: SUPER })).doGenerate(params)
    expect(catalogCalls()).toHaveLength(3)
  })

  test('both lists failing is today\'s behaviour: the pinned list, and the call is made', async () => {
    const { asked } = network({ openrouter: 'fail', aa: 'fail' })
    const out = await getModel('text', env()).doGenerate(params)
    expect(textOf(out)).toBe(`from ${PAID}`)
    expect(asked).toEqual([PAID])
  })
})

describe('time limits in the dynamic list', () => {
  test('a paid model keeps 90 s, a free model gets 120 s instead of 240 s, and the first error goes up', async () => {
    const { asked } = network({ chat: hang })
    fakeClock()
    const call = Promise.resolve(getModel('text', env()).doGenerate(params)).catch((e: unknown) => e)
    await until(() => asked.length === 1)
    expect(asked).toEqual([PAID])
    await vi.advanceTimersByTimeAsync(89_999)
    expect(asked).toEqual([PAID])
    await vi.advanceTimersByTimeAsync(1)
    await until(() => asked.length === 2)
    expect(asked).toEqual([PAID, INKLING])
    await vi.advanceTimersByTimeAsync(119_999)
    expect(asked).toEqual([PAID, INKLING])
    await vi.advanceTimersByTimeAsync(1)
    await until(() => asked.length === 3)
    expect(asked).toEqual([PAID, INKLING, SUPER])
    for (const next of [ULTRA, LIGHTNING, GEMMA31]) {
      await vi.advanceTimersByTimeAsync(120_000)
      await until(() => asked.includes(next))
    }
    expect(asked).toEqual([PAID, INKLING, SUPER, ULTRA, LIGHTNING, GEMMA31])
    await vi.advanceTimersByTimeAsync(120_000)
    const err = await call
    expect(err).toBeInstanceOf(ModelTimeoutError)
    expect((err as Error).message).toContain('after 90 seconds')
  })

  test('the limit helper: 120 s for a free model in the dynamic list, 90 s paid, 240 s everywhere else', () => {
    expect(DYNAMIC_FREE_MODEL_CALL_TIMEOUT_MS).toBe(120_000)
    expect(modelCallTimeoutMs('openrouter', SUPER, true)).toBe(120_000)
    expect(modelCallTimeoutMs('openrouter', PAID, true)).toBe(90_000)
    expect(modelCallTimeoutMs('openrouter', SUPER)).toBe(240_000)
    expect(modelCallTimeoutMs('openrouter', SUPER, false)).toBe(240_000)
    expect(modelCallTimeoutMs('openrouter', PAID)).toBe(90_000)
  })

  test('with the switch off a free model still gets 4 minutes', async () => {
    const { asked } = network({ chat: hang })
    fakeClock()
    const call = Promise.resolve(getModel('text', env({ AI_MODEL_RANKING: undefined, LLM_MODEL: SUPER, LLM_MODEL_FALLBACKS: ULTRA })).doGenerate(params)).catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(239_999)
    expect(asked).toEqual([SUPER])
    await vi.advanceTimersByTimeAsync(1)
    expect(asked).toEqual([SUPER, ULTRA])
    await vi.advanceTimersByTimeAsync(240_000)
    expect(await call).toBeInstanceOf(ModelTimeoutError)
  })
})

describe('recorded answers with a dynamic list', () => {
  /** A chat that fails the test when a model is asked. */
  const noModel = () => {
    throw new Error('a model was called')
  }

  test('cache: an answer saved under a pinned free id that is last in the dynamic list still hits, and no model is called', async () => {
    const { asked, catalogCalls } = network({ chat: noModel })
    const store = new MemoryStore()
    await store.put(await replayKey(GEMMA26, params), GEMMA26, answer('recorded under the last id'))
    const out = await getModel('text', env({ AI_MODE: 'cache', LLM_MODEL_FALLBACKS: GEMMA26 }, store)).doGenerate(params)
    expect(textOf(out)).toBe('recorded under the last id')
    expect(asked).toEqual([])
    expect(catalogCalls().length).toBeGreaterThan(0)
  })

  test.each([SUPER, ULTRA, GEMMA31, PAID, INKLING, LIGHTNING])('cache: an answer saved under %s is found too', async (id) => {
    const { asked } = network({ chat: noModel })
    const store = new MemoryStore()
    await store.put(await replayKey(id, params), id, answer(`saved under ${id}`))
    const out = await getModel('text', env({ AI_MODE: 'cache' }, store)).doGenerate(params)
    expect(textOf(out)).toBe(`saved under ${id}`)
    expect(asked).toEqual([])
  })

  test('cache: an answer saved under a pinned free id that OpenRouter has since removed still hits (nothing is called under it)', async () => {
    const list = OR.data.filter((m) => m.id !== SUPER)
    const { asked } = network({ chat: noModel, list })
    const store = new MemoryStore()
    await store.put(await replayKey(SUPER, params), SUPER, answer('recorded under the removed id'))
    const out = await getModel('text', env({ AI_MODE: 'cache' }, store)).doGenerate(params)
    expect(textOf(out)).toBe('recorded under the removed id')
    expect(asked).toEqual([])
  })

  test('cache: with the lists unreadable the pinned ids still find their recorded answers', async () => {
    const { asked } = network({ chat: noModel, openrouter: 'fail', aa: 'fail' })
    const store = new MemoryStore()
    await store.put(await replayKey(SUPER, params), SUPER, answer('recorded'))
    expect(textOf(await getModel('text', env({ AI_MODE: 'cache' }, store)).doGenerate(params))).toBe('recorded')
    expect(asked).toEqual([])
  })

  test('cache with nothing recorded: the first model of the list is called, the answer is saved under its id, and the next call is served from storage', async () => {
    const { asked } = network()
    const store = new MemoryStore()
    const model = getModel('text', env({ AI_MODE: 'cache' }, store))
    expect(textOf(await model.doGenerate(params))).toBe(`from ${PAID}`)
    expect(asked).toEqual([PAID])
    expect(await store.get(await replayKey(PAID, params))).not.toBeNull()
    expect(await store.get(await replayKey(ULTRA, params))).toBeNull()
    expect(textOf(await model.doGenerate(params))).toBe(`from ${PAID}`)
    expect(asked).toEqual([PAID])
  })

  test('cache with nothing recorded and the first models gone: the next ranked model answers and its id gets the record', async () => {
    const { asked } = network({ chat: (m) => (m === PAID ? unpaid() : m === INKLING ? gone(m) : completion(m, `from ${m}`)) })
    const store = new MemoryStore()
    expect(textOf(await getModel('text', env({ AI_MODE: 'cache' }, store)).doGenerate(params))).toBe(`from ${SUPER}`)
    expect(asked).toEqual([PAID, INKLING, SUPER])
    expect(await store.get(await replayKey(SUPER, params))).not.toBeNull()
  })

  test('replay: a recorded answer is found, a call that was never recorded is a miss naming the first model, and no model is asked', async () => {
    const { asked } = network({ chat: noModel })
    const store = new MemoryStore()
    await store.put(await replayKey(GEMMA31, params), GEMMA31, answer('recorded'))
    const model = getModel('text', env({ AI_MODE: 'replay' }, store))
    expect(textOf(await model.doGenerate(params))).toBe('recorded')
    const other = { prompt: [{ role: 'user', content: [{ type: 'text', text: 'never recorded' }] }] } as never
    const err = await Promise.resolve(model.doGenerate(other)).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ReplayMissError)
    expect((err as Error).message).toContain(`(${PAID}:`)
    expect(asked).toEqual([])
  })
})

describe('a model that is gone or unpaid does not stop the chain', () => {
  test('the check: status 402 or 404, or a message that says the model is gone or unpaid', () => {
    expect(isModelGoneError(Object.assign(new Error('x'), { statusCode: 404 }))).toBe(true)
    expect(isModelGoneError(Object.assign(new Error('x'), { statusCode: 402 }))).toBe(true)
    expect(isModelGoneError(Object.assign(new Error('x'), { status: 404 }))).toBe(true)
    for (const message of [
      'No endpoints found for nvidia/foo:free.',
      'foo is not a valid model ID',
      'The model `foo` was not found',
      'model foo not found',
      'No allowed providers are available for the selected model.',
      'This model is not available in your region',
      'The model has been deprecated',
      'Insufficient credits. Add more at openrouter.ai',
      'This request requires more credits, or fewer max_tokens',
      'Payment Required',
    ]) expect(isModelGoneError(new Error(message)), message).toBe(true)
    expect(isModelGoneError({ cause: Object.assign(new Error('inner'), { statusCode: 404 }) })).toBe(true)
  })

  test('other errors are not "gone": a bad request, a rate limit, a server error, a timeout, nothing', () => {
    for (const code of [400, 401, 403, 408, 422, 429, 500, 503]) expect(isModelGoneError(Object.assign(new Error('x'), { statusCode: code })), String(code)).toBe(false)
    expect(isModelGoneError(new Error('bad request'))).toBe(false)
    expect(isModelGoneError(new Error('Rate limit exceeded: provider returned error'))).toBe(false)
    expect(isModelGoneError(new ModelTimeoutError(1000))).toBe(false)
    expect(isModelGoneError(null)).toBe(false)
    expect(isModelGoneError(undefined)).toBe(false)
    expect(isModelGoneError('404')).toBe(false)
  })

  const ok = (text: string) => new MockLanguageModelV4({ modelId: text, doGenerate: async () => answer(text) })
  const failing = (id: string, err: unknown) => new MockLanguageModelV4({ modelId: id, doGenerate: async () => { throw err } })

  test.each([
    ['404', Object.assign(new Error('Not Found'), { statusCode: 404 })],
    ['402', Object.assign(new Error('Payment Required'), { statusCode: 402 })],
    ['a "no endpoints" message', new Error('No endpoints found for x')],
  ])('withFallbacks moves on after %s and the next model answers', async (_name, err) => {
    const a = failing('a', err)
    const b = ok('from b')
    const chain = withFallbacks([a, b] as never)
    expect(textOf(await chain.doGenerate(params))).toBe('from b')
    expect(a.doGenerateCalls.length).toBe(1)
    expect(b.doGenerateCalls.length).toBe(1)
  })

  test('with no model left the first error goes up, and a 400 still stops the chain', async () => {
    const first = Object.assign(new Error('Not Found'), { statusCode: 404 })
    const second = Object.assign(new Error('Payment Required'), { statusCode: 402 })
    await expect(withFallbacks([failing('a', first), failing('b', second)] as never).doGenerate(params)).rejects.toBe(first)
    const bad = failing('c', Object.assign(new Error('bad request'), { statusCode: 400 }))
    const b = ok('from b')
    await expect(withFallbacks([bad, b] as never).doGenerate(params)).rejects.toThrow('bad request')
    expect(b.doGenerateCalls.length).toBe(0)
  })

  test('a single model that is gone gives its own error', async () => {
    const err = Object.assign(new Error('Not Found'), { statusCode: 404 })
    await expect(withFallbacks([failing('a', err)] as never).doGenerate(params)).rejects.toBe(err)
  })

  test('the same model is not tried again: a 404, a 402, and a 5xx whose message says the model is gone', async () => {
    const waits: number[] = []
    const sleep = async (ms: number) => void waits.push(ms)
    for (const err of [
      Object.assign(new Error('Not Found'), { statusCode: 404 }),
      Object.assign(new Error('Payment Required'), { statusCode: 402 }),
      Object.assign(new Error('No endpoints found for x'), { statusCode: 503 }),
      Object.assign(new Error('Model temporarily not available'), { statusCode: 500 }),
    ]) {
      const a = failing('a', err)
      const b = ok('from b')
      const chain = withFallbacks([wrapLanguageModel({ model: a, middleware: withModelRetry(sleep, [1, 2, 3]) }), wrapLanguageModel({ model: b, middleware: withModelRetry(sleep, [1, 2, 3]) })])
      expect(textOf(await chain.doGenerate(params))).toBe('from b')
      expect(a.doGenerateCalls.length, String(err.message)).toBe(1)
    }
    expect(waits).toEqual([])
  })

  test('a plain 503 is still retried on the same model first, as before', async () => {
    const waits: number[] = []
    let n = 0
    const flaky = new MockLanguageModelV4({
      modelId: 'a',
      doGenerate: async () => {
        if (n++ < 2) throw Object.assign(new Error('Service temporarily overloaded'), { statusCode: 503 })
        return answer('from a')
      },
    })
    const chain = withFallbacks([wrapLanguageModel({ model: flaky, middleware: withModelRetry(async (ms) => void waits.push(ms), [1, 2, 3]) }), ok('from b')] as never)
    expect(textOf(await chain.doGenerate(params))).toBe('from a')
    expect(waits).toEqual([1, 2])
  })

  test('a real chain, switch off: a 404 on the paid model and a 402 on the first free model, and the next one answers', async () => {
    const { asked } = network({ chat: (m) => (m === PAID ? gone(m) : m === SUPER ? unpaid() : completion(m, `from ${m}`)) })
    const out = await getModel('text', env({ AI_MODEL_RANKING: undefined })).doGenerate(params)
    expect(textOf(out)).toBe(`from ${ULTRA}`)
    expect(asked).toEqual([PAID, SUPER, ULTRA])
  })

  test('a real chain, dynamic list: a 404 and a 402 move on to the next ranked model', async () => {
    const { asked } = network({ chat: (m) => (m === PAID ? gone(m) : m === INKLING ? unpaid() : completion(m, `from ${m}`)) })
    const out = await getModel('text', env()).doGenerate(params)
    expect(textOf(out)).toBe(`from ${SUPER}`)
    expect(asked).toEqual([PAID, INKLING, SUPER])
  })
})
