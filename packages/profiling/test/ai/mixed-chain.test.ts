import { readFileSync } from 'node:fs'
import { generateText } from 'ai'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { REPLAYS_FIXTURE, parseReplays } from '../../../../scripts/load-replays'
import { MemoryStore, ModelTimeoutError, PROVIDER_PREFIXES, getModel, modelList, replayKey, splitProviderId, type AiEnv } from '../../src/ai'

// P121g: when all three Cloudflare models fail, Jemma falls back to the free OpenRouter models. One list mixes providers through a per-id prefix
// (`openrouter:nvidia/...:free`). Each id is built with its own provider, time limit and replay layer, and the replay key is the bare id.
// A fake `fetch` only: no database, no network, no live model, no real token.

const DEEPSEEK = '@cf/deepseek-ai/deepseek-v4.1-flash-1017'
const GLM = '@cf/zai-org/glm-5.3-flash'
const INKLING = '@cf/thinkingmachines/inkling-2-small'
const NEMOTRON = 'nvidia/nemotron-3.5-super-vl:free'
const ULTRA = 'nvidia/nemotron-3-ultra-550b-a55b:free'
const GEMMA = 'google/gemma-4-31b-it:free'
const OLD_IDS = [NEMOTRON, ULTRA, GEMMA].join(',')
const ACCOUNT = 'acct-123'
const CF_TOKEN = 'cf-token-not-real'
const OR_KEY = 'or-key-not-real'
const CF_URL = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/ai/v1/chat/completions`
const OR_URL = 'https://openrouter.ai/api/v1/chat/completions'

const TEXT_FALLBACKS = [GLM, INKLING, `openrouter:${NEMOTRON}`, `openrouter:${ULTRA}`].join(',')
const VISION_FALLBACKS = [GLM, INKLING, `openrouter:${NEMOTRON}`, `openrouter:${GEMMA}`].join(',')

/** The live preview config of P121g (REST way, so the tests need no binding). */
const BASE: Partial<AiEnv> = {
  LLM_PROVIDER: 'workers-ai',
  LLM_MODEL: DEEPSEEK,
  LLM_MODEL_FALLBACKS: TEXT_FALLBACKS,
  VISION_PROVIDER: 'workers-ai',
  VISION_MODEL: DEEPSEEK,
  VISION_MODEL_FALLBACKS: VISION_FALLBACKS,
  CF_ACCOUNT_ID: ACCOUNT,
  CF_AI_TOKEN: CF_TOKEN,
  OPENROUTER_API_KEY: OR_KEY,
  AI_MODE: 'live',
}
const env = (over: Partial<AiEnv> = {}, store = new MemoryStore()): AiEnv => ({ ...BASE, replayStore: store, ...over }) as AiEnv

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
  json({ id: 'gen-1', object: 'chat.completion', created: 1, model, choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: text } }], usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 } })
const cfGone = () => json({ errors: [{ code: 7000, message: 'No route for that URI' }], success: false }, 404)
const orRefused = () => json({ error: { message: 'forbidden', code: 403 } }, 403)

type Call = { url: string; model: string; headers: Record<string, string> }
/** A `fetch` that records every request (URL, model in the body, headers) and answers through `handler`. */
function network(handler: (url: string, model: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: Call[] = []
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input)
    const model = (JSON.parse(init?.body as string) as { model: string }).model
    calls.push({ url, model, headers: Object.fromEntries(new Headers(init?.headers).entries()) })
    return handler(url, model, init!)
  })
  vi.stubGlobal('fetch', fetchMock)
  return { calls, fetchMock, asked: () => calls.map((c) => c.model), urls: () => calls.map((c) => c.url) }
}

/** Cloudflare says the model is gone (a fast, non-retried error); OpenRouter answers. */
const cloudflareFailsOpenRouterAnswers = (url: string, model: string) => (url === CF_URL ? cfGone() : completion(model, `from ${model}`))

const hang = (_url: string, _model: string, init: RequestInit) =>
  new Promise<Response>((_, reject) => {
    init.signal?.addEventListener('abort', () => reject(new Error('cancelled')))
  })

const realSetTimeout = globalThis.setTimeout
const fakeClock = () => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
const until = async (done: () => boolean) => {
  for (let i = 0; i < 400 && !done(); i++) await new Promise<void>((r) => realSetTimeout(r, 5))
  expect(done()).toBe(true)
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('splitProviderId', () => {
  test('a known provider before the first colon is the provider, the rest is the bare id', () => {
    expect(splitProviderId(`openrouter:${NEMOTRON}`, 'workers-ai')).toEqual({ provider: 'openrouter', id: NEMOTRON })
    expect(splitProviderId(`workers-ai:${GLM}`, 'openrouter')).toEqual({ provider: 'workers-ai', id: GLM })
    expect(splitProviderId('openrouter:nvidia/x:free', 'workers-ai')).toEqual({ provider: 'openrouter', id: 'nvidia/x:free' })
  })

  test.each(['openrouter', 'workers-ai', 'deepseek', 'anthropic', 'google', 'openai', 'opencode'])('%s is a provider prefix', (name) => {
    expect(splitProviderId(`${name}:some-model`, 'other')).toEqual({ provider: name, id: 'some-model' })
    expect(PROVIDER_PREFIXES).toContain(name)
  })

  test('an id without such a prefix keeps the default provider and stays exactly as it is', () => {
    expect(splitProviderId('nvidia/x:free', 'workers-ai')).toEqual({ provider: 'workers-ai', id: 'nvidia/x:free' })
    expect(splitProviderId(NEMOTRON, 'openrouter')).toEqual({ provider: 'openrouter', id: NEMOTRON })
    expect(splitProviderId(GEMMA, 'openrouter')).toEqual({ provider: 'openrouter', id: GEMMA })
    expect(splitProviderId(GLM, 'workers-ai')).toEqual({ provider: 'workers-ai', id: GLM })
    expect(splitProviderId('deepseek-chat', 'deepseek')).toEqual({ provider: 'deepseek', id: 'deepseek-chat' })
    expect(splitProviderId('', 'workers-ai')).toEqual({ provider: 'workers-ai', id: '' })
  })

  test('only an exact provider name counts: another name, another case, a name inside a path or a longer name are all left alone', () => {
    for (const raw of ['foo:bar', 'OpenRouter:x', 'WORKERS-AI:x', 'openrouters:x', 'openrouter :x', 'google/gemma-4-31b-it:free', 'a/openrouter:free', ':x', 'x:']) {
      expect(splitProviderId(raw, 'workers-ai'), raw).toEqual({ provider: 'workers-ai', id: raw })
    }
  })

  test('only the first colon splits, and spaces around the whole id are dropped', () => {
    expect(splitProviderId('openrouter:a:b:free', 'x')).toEqual({ provider: 'openrouter', id: 'a:b:free' })
    expect(splitProviderId('  openrouter:nvidia/x:free  ', 'x')).toEqual({ provider: 'openrouter', id: 'nvidia/x:free' })
    expect(splitProviderId('  nvidia/x:free ', 'x')).toEqual({ provider: 'x', id: 'nvidia/x:free' })
  })

  test('the list of ids is unchanged: the prefix is part of the id until the chain is built', () => {
    expect(modelList(DEEPSEEK, TEXT_FALLBACKS)).toEqual([DEEPSEEK, GLM, INKLING, `openrouter:${NEMOTRON}`, `openrouter:${ULTRA}`])
  })
})

describe('a mixed chain: Cloudflare first, free OpenRouter after', () => {
  test('all three Cloudflare models fail, the first free OpenRouter model answers, and each id went to its own provider', async () => {
    const { calls } = network(cloudflareFailsOpenRouterAnswers)
    const out = await getModel('text', env()).doGenerate(params)
    expect(textOf(out)).toBe(`from ${NEMOTRON}`)
    expect(calls.map((c) => [c.url, c.model])).toEqual([
      [CF_URL, DEEPSEEK],
      [CF_URL, GLM],
      [CF_URL, INKLING],
      [OR_URL, NEMOTRON],
    ])
    for (const c of calls.filter((c) => c.url === CF_URL)) expect(c.headers.authorization).toBe(`Bearer ${CF_TOKEN}`)
    expect(calls[3]!.headers.authorization).toBe(`Bearer ${OR_KEY}`)
  })

  test('the prefix never reaches the provider: the request names the bare id', async () => {
    const { calls } = network(cloudflareFailsOpenRouterAnswers)
    await getModel('text', env()).doGenerate(params)
    expect(calls.some((c) => c.model.includes('openrouter:'))).toBe(false)
    expect(calls.every((c) => !c.model.startsWith('workers-ai:'))).toBe(true)
  })

  test('a Cloudflare model that answers ends the call: the free models are never asked', async () => {
    const { asked } = network((_url, model) => (model === DEEPSEEK ? cfGone() : completion(model, `from ${model}`)))
    expect(textOf(await getModel('text', env()).doGenerate(params))).toBe(`from ${GLM}`)
    expect(asked()).toEqual([DEEPSEEK, GLM])
  })

  test('the free fallback list goes in order: the first free model fails, the second answers', async () => {
    const { asked } = network((url, model) => (url === CF_URL || model === NEMOTRON ? cfGone() : completion(model, `from ${model}`)))
    expect(textOf(await getModel('text', env()).doGenerate(params))).toBe(`from ${ULTRA}`)
    expect(asked()).toEqual([DEEPSEEK, GLM, INKLING, NEMOTRON, ULTRA])
  })

  test('the photo chain ends in Gemma 4 31B, not Nemotron 3 Ultra (which does not read photos)', async () => {
    const { asked } = network((url, model) => (url === CF_URL || model === NEMOTRON ? cfGone() : completion(model, `from ${model}`)))
    expect(textOf(await getModel('vision', env()).doGenerate(params))).toBe(`from ${GEMMA}`)
    expect(asked()).toEqual([DEEPSEEK, GLM, INKLING, NEMOTRON, GEMMA])
    expect(asked()).not.toContain(ULTRA)
  })

  test('every model fails: the first error (Cloudflare, 404) goes up and each of the five was asked once', async () => {
    const { asked } = network((url) => (url === CF_URL ? cfGone() : orRefused()))
    await expect(getModel('text', env()).doGenerate(params)).rejects.toMatchObject({ statusCode: 404 })
    expect(asked()).toEqual([DEEPSEEK, GLM, INKLING, NEMOTRON, ULTRA])
  })

  test('a prefix wins over the default provider of the kind, at any place in the list', async () => {
    const { calls } = network(cloudflareFailsOpenRouterAnswers)
    const out = await getModel('text', env({ LLM_PROVIDER: 'openrouter', LLM_MODEL: `workers-ai:${DEEPSEEK}`, LLM_MODEL_FALLBACKS: NEMOTRON })).doGenerate(params)
    expect(calls.map((c) => [c.url, c.model])).toEqual([
      [CF_URL, DEEPSEEK],
      [OR_URL, NEMOTRON],
    ])
    expect(textOf(out)).toBe(`from ${NEMOTRON}`)
  })

  test('the model reports the first id, without a prefix', () => {
    network(cloudflareFailsOpenRouterAnswers)
    expect(getModel('text', env()).modelId).toBe(DEEPSEEK)
    expect(getModel('text', env({ LLM_PROVIDER: 'workers-ai', LLM_MODEL: `openrouter:${NEMOTRON}`, LLM_MODEL_FALLBACKS: GLM })).modelId).toBe(NEMOTRON)
  })

  test('a list with no prefix is as before: one provider for every id', async () => {
    const { calls } = network(cloudflareFailsOpenRouterAnswers)
    await expect(getModel('text', env({ LLM_MODEL_FALLBACKS: `${GLM},${INKLING}` })).doGenerate(params)).rejects.toMatchObject({ statusCode: 404 })
    expect(calls.map((c) => c.url)).toEqual([CF_URL, CF_URL, CF_URL])
  })
})

describe('the time limits of a mixed chain', () => {
  test('3 Cloudflare tries of 150 s, then each free OpenRouter model 120 s (not 240 s), then the first error goes up', async () => {
    const { asked } = network(hang)
    fakeClock()
    const call = Promise.resolve(getModel('text', env()).doGenerate(params)).catch((e: unknown) => e)
    await until(() => asked().length === 1)
    const step = async (ms: number, count: number) => {
      await vi.advanceTimersByTimeAsync(ms)
      await until(() => asked().length === count)
    }
    await vi.advanceTimersByTimeAsync(149_999)
    expect(asked()).toEqual([DEEPSEEK])
    await step(1, 2)
    await vi.advanceTimersByTimeAsync(149_999)
    expect(asked()).toEqual([DEEPSEEK, GLM])
    await step(1, 3)
    await vi.advanceTimersByTimeAsync(149_999)
    expect(asked()).toEqual([DEEPSEEK, GLM, INKLING])
    await step(1, 4)
    // The first free model has 120 s, not 240 s.
    await vi.advanceTimersByTimeAsync(119_999)
    expect(asked()).toEqual([DEEPSEEK, GLM, INKLING, NEMOTRON])
    await step(1, 5)
    await vi.advanceTimersByTimeAsync(119_999)
    expect(asked()).toEqual([DEEPSEEK, GLM, INKLING, NEMOTRON, ULTRA])
    await vi.advanceTimersByTimeAsync(1)
    const err = await call
    expect(err).toBeInstanceOf(ModelTimeoutError)
    expect((err as Error).message).toContain('after 150 seconds')
    // 3 x 150 + 2 x 120 = 690 seconds: inside the 15 minutes of a queued job.
    expect(3 * 150 + 2 * 120).toBeLessThan(15 * 60)
  })

  test('a free OpenRouter id that comes after another free id is still after a non-free one: 120 s', async () => {
    const { asked } = network(hang)
    fakeClock()
    const call = Promise.resolve(getModel('text', env({ LLM_MODEL_FALLBACKS: `openrouter:${NEMOTRON},openrouter:${ULTRA}` })).doGenerate(params)).catch((e: unknown) => e)
    await until(() => asked().length === 1)
    await vi.advanceTimersByTimeAsync(150_000)
    await until(() => asked().length === 2)
    await vi.advanceTimersByTimeAsync(119_999)
    expect(asked()).toEqual([DEEPSEEK, NEMOTRON])
    await vi.advanceTimersByTimeAsync(1)
    await until(() => asked().length === 3)
    await vi.advanceTimersByTimeAsync(120_000)
    expect(await call).toBeInstanceOf(ModelTimeoutError)
  })

  test('a free OpenRouter id that comes first keeps 240 s, as does a list of free ids alone', async () => {
    const first = network(hang)
    fakeClock()
    const call = Promise.resolve(getModel('text', env({ LLM_MODEL: `openrouter:${NEMOTRON}`, LLM_MODEL_FALLBACKS: GLM })).doGenerate(params)).catch((e: unknown) => e)
    await until(() => first.asked().length === 1)
    await vi.advanceTimersByTimeAsync(239_999)
    expect(first.asked()).toEqual([NEMOTRON])
    await vi.advanceTimersByTimeAsync(1)
    await until(() => first.asked().length === 2)
    await vi.advanceTimersByTimeAsync(150_000)
    expect(await call).toBeInstanceOf(ModelTimeoutError)

    vi.useRealTimers()
    vi.unstubAllGlobals()
    const alone = network(hang)
    fakeClock()
    const call2 = Promise.resolve(getModel('text', env({ LLM_PROVIDER: 'openrouter', LLM_MODEL: NEMOTRON, LLM_MODEL_FALLBACKS: ULTRA })).doGenerate(params)).catch((e: unknown) => e)
    await until(() => alone.asked().length === 1)
    await vi.advanceTimersByTimeAsync(239_999)
    expect(alone.asked()).toEqual([NEMOTRON])
    await vi.advanceTimersByTimeAsync(1)
    await until(() => alone.asked().length === 2)
    await vi.advanceTimersByTimeAsync(240_000)
    expect(await call2).toBeInstanceOf(ModelTimeoutError)
  })

  test('a paid OpenRouter id in a mixed chain keeps 90 s', async () => {
    const { asked } = network(hang)
    fakeClock()
    const call = Promise.resolve(getModel('text', env({ LLM_MODEL_FALLBACKS: 'openrouter:nvidia/nemotron-3.5-super-vl' })).doGenerate(params)).catch((e: unknown) => e)
    await until(() => asked().length === 1)
    await vi.advanceTimersByTimeAsync(150_000)
    await until(() => asked().length === 2)
    await vi.advanceTimersByTimeAsync(89_999)
    expect(asked()).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(await call).toBeInstanceOf(ModelTimeoutError)
  })
})

describe('recorded answers with a mixed chain (the replay key is the bare id)', () => {
  const cache = (over: Partial<AiEnv> = {}, store = new MemoryStore()) => env({ AI_MODE: 'cache', AI_RECORDED_IDS: OLD_IDS, ...over }, store)

  test.each([NEMOTRON, ULTRA, GEMMA])('cache: an answer recorded under the bare id %s hits, and nothing is called', async (id) => {
    const { fetchMock } = network(cloudflareFailsOpenRouterAnswers)
    const store = new MemoryStore()
    await store.put(await replayKey(id, params), id, answer(`recorded under ${id}`))
    expect(textOf(await getModel('text', cache({}, store)).doGenerate(params))).toBe(`recorded under ${id}`)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('the lookup works with no AI_RECORDED_IDS at all, because the prefixed fallbacks are looked up under their bare ids', async () => {
    const { fetchMock } = network(cloudflareFailsOpenRouterAnswers)
    const store = new MemoryStore()
    await store.put(await replayKey(NEMOTRON, params), NEMOTRON, answer('recorded'))
    expect(textOf(await getModel('text', cache({ AI_RECORDED_IDS: undefined }, store)).doGenerate(params))).toBe('recorded')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('an answer saved under the PREFIXED text is not a recorded answer: only bare ids are keys', async () => {
    const { asked } = network(cloudflareFailsOpenRouterAnswers)
    const store = new MemoryStore()
    await store.put(await replayKey(`openrouter:${NEMOTRON}`, params), `openrouter:${NEMOTRON}`, answer('under the prefixed text'))
    expect(textOf(await getModel('text', cache({ AI_RECORDED_IDS: undefined }, store)).doGenerate(params))).toBe(`from ${NEMOTRON}`)
    expect(asked()).toEqual([DEEPSEEK, GLM, INKLING, NEMOTRON])
  })

  test('cache on a miss: the free OpenRouter answer is saved under the bare id, and the next call comes from storage', async () => {
    const { asked } = network(cloudflareFailsOpenRouterAnswers)
    const store = new MemoryStore()
    const model = getModel('text', cache({}, store))
    expect(textOf(await model.doGenerate(params))).toBe(`from ${NEMOTRON}`)
    expect(asked()).toEqual([DEEPSEEK, GLM, INKLING, NEMOTRON])
    expect(await store.get(await replayKey(NEMOTRON, params))).not.toBeNull()
    expect(await store.get(await replayKey(`openrouter:${NEMOTRON}`, params))).toBeNull()
    expect(await store.get(await replayKey(DEEPSEEK, params))).toBeNull()
    expect(textOf(await model.doGenerate(params))).toBe(`from ${NEMOTRON}`)
    expect(asked()).toHaveLength(4)
  })

  test('replay: a recorded answer under a bare id is found, an unrecorded call is a miss, and no model is asked', async () => {
    const { fetchMock } = network(cloudflareFailsOpenRouterAnswers)
    const store = new MemoryStore()
    await store.put(await replayKey(ULTRA, params), ULTRA, answer('recorded'))
    const model = getModel('text', cache({ AI_MODE: 'replay' }, store))
    expect(textOf(await model.doGenerate(params))).toBe('recorded')
    const other = { prompt: [{ role: 'user', content: [{ type: 'text', text: 'never recorded' }] }] } as never
    await expect(model.doGenerate(other)).rejects.toThrow('Replay miss')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('the committed fixture still resolves in cache and replay with the mixed list (and calls nothing)', async () => {
    const { fetchMock } = network(cloudflareFailsOpenRouterAnswers)
    type Part = { type?: string; text?: string }
    type Message = { role: string; content: string | Part[] }
    const rows = parseReplays(readFileSync(REPLAYS_FIXTURE))
    const textOfContent = (content: string | Part[]) => (typeof content === 'string' ? content : content.map((p) => p.text ?? '').join(''))
    const lessons = rows.flatMap((row) => {
      const messages = (row.response as { request?: { body?: { messages?: Message[] } } }).request?.body?.messages ?? []
      const system = messages.find((m) => m.role === 'system')
      const user = messages.find((m) => m.role === 'user')
      if (!system || !user || (typeof user.content !== 'string' && user.content.some((p) => p.type !== 'text'))) return []
      return /# Job: write_lesson/.test(textOfContent(system.content)) ? [{ row, system: textOfContent(system.content), prompt: textOfContent(user.content) }] : []
    })
    expect(lessons.length).toBeGreaterThanOrEqual(30)
    const store = new MemoryStore()
    for (const r of rows) await store.put(r.key, r.model, r.response)
    for (const mode of ['cache', 'replay'] as const) {
      const model = getModel('text', cache({ AI_MODE: mode }, store))
      for (const l of lessons) {
        const saved = ((l.row.response as { content?: Part[] }).content ?? []).filter((p) => p.type === 'text').map((p) => p.text ?? '').join('')
        expect((await generateText({ model, system: l.system, prompt: l.prompt })).text, l.row.key).toBe(saved)
      }
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
