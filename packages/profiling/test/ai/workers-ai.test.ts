import { readFileSync } from 'node:fs'
import { generateText } from 'ai'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { REPLAYS_FIXTURE, parseReplays } from '../../../../scripts/load-replays'
import {
  MODEL_CALL_TIMEOUT_MS,
  MemoryStore,
  ModelTimeoutError,
  PAID_MODEL_CALL_TIMEOUT_MS,
  ReplayMissError,
  WORKERS_AI_MODEL_CALL_TIMEOUT_MS,
  getModel,
  modelCallTimeoutMs,
  recordedIdList,
  replayKey,
  type AiEnv,
} from '../../src/ai'

// P121d: the hosted AI runs on Cloudflare Workers AI (DeepSeek V4.1 Flash first, GLM 5.3 Flash as backup), and the demo's recorded answers, which
// were saved under the old OpenRouter ids, keep hitting through lookup-only ids (AI_RECORDED_IDS). Doubles and a fake `fetch` only: no database,
// no network, no live model, no real token.

const DEEPSEEK = '@cf/deepseek-ai/deepseek-v4.1-flash-1017'
const GLM = '@cf/zai-org/glm-5.3-flash'
const NEMOTRON = 'nvidia/nemotron-3.5-super-vl:free'
const ULTRA = 'nvidia/nemotron-3-ultra-550b-a55b:free'
const GEMMA = 'google/gemma-4-31b-it:free'
const OLD_IDS = [NEMOTRON, ULTRA, GEMMA].join(',')
const ACCOUNT = 'acct-123'
const TOKEN = 'tok-not-a-real-token'
const CF_URL = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/ai/v1/chat/completions`

const BASE: Partial<AiEnv> = {
  LLM_PROVIDER: 'workers-ai',
  LLM_MODEL: DEEPSEEK,
  LLM_MODEL_FALLBACKS: GLM,
  VISION_PROVIDER: 'workers-ai',
  VISION_MODEL: DEEPSEEK,
  VISION_MODEL_FALLBACKS: GLM,
  CF_ACCOUNT_ID: ACCOUNT,
  CF_AI_TOKEN: TOKEN,
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
const cfError = (status: number, message = 'No route for that URI') => json({ errors: [{ code: 7000, message }], success: false, messages: [], result: null }, status)

type Call = { url: string; model: string; headers: Record<string, string>; body: { model: string; messages: Array<{ role: string; content: unknown }> } }
/** A `fetch` that records each request (URL, model, headers, body) and answers through `handler`. Nothing leaves the machine. */
function network(handler: (model: string, init: RequestInit) => Response | Promise<Response> = (m) => completion(m, `from ${m}`)) {
  const calls: Call[] = []
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
    const body = JSON.parse(init?.body as string)
    calls.push({ url: String(input), model: body.model as string, headers: Object.fromEntries(new Headers(init?.headers).entries()), body })
    return handler(body.model as string, init!)
  })
  vi.stubGlobal('fetch', fetchMock)
  return { calls, fetchMock, asked: () => calls.map((c) => c.model) }
}

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

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('the workers-ai provider', () => {
  test('it calls the Cloudflare account address and sends the token as a bearer token', async () => {
    const { calls } = network()
    const out = await getModel('text', env()).doGenerate(params)
    expect(textOf(out)).toBe(`from ${DEEPSEEK}`)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe(CF_URL)
    expect(calls[0]!.headers.authorization).toBe(`Bearer ${TOKEN}`)
    expect(calls[0]!.model).toBe(DEEPSEEK)
  })

  test('the address follows CF_ACCOUNT_ID', async () => {
    const { calls } = network()
    await getModel('text', env({ CF_ACCOUNT_ID: 'another-account' })).doGenerate(params)
    expect(calls[0]!.url).toBe('https://api.cloudflare.com/client/v4/accounts/another-account/ai/v1/chat/completions')
  })

  test('the model reports the first id and a provider name that says workers-ai', () => {
    network()
    const model = getModel('text', env())
    expect(model.modelId).toBe(DEEPSEEK)
    expect(model.provider).toContain('workers-ai')
  })

  test('a photo goes as an image part of the chat message, to the vision model of the vision pair', async () => {
    const { calls } = network()
    const model = getModel('vision', env({ VISION_MODEL: GLM, VISION_MODEL_FALLBACKS: DEEPSEEK }))
    const out = await generateText({
      model,
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Read the answers' }, { type: 'file', data: new Uint8Array([1, 2, 3]), mediaType: 'image/png' }] }],
    })
    expect(out.text).toBe(`from ${GLM}`)
    expect(calls[0]!.url).toBe(CF_URL)
    expect(calls[0]!.model).toBe(GLM)
    const parts = calls[0]!.body.messages[0]!.content as Array<{ type: string; image_url?: { url: string } }>
    expect(parts.map((p) => p.type)).toEqual(['text', 'image_url'])
    expect(parts[1]!.image_url?.url).toMatch(/^data:image\/png;base64,/)
  })

  test('a missing CF_ACCOUNT_ID or CF_AI_TOKEN is a plain error that names the variable and never shows the token', () => {
    network()
    expect(() => getModel('text', env({ CF_ACCOUNT_ID: undefined }))).toThrow('CF_ACCOUNT_ID')
    expect(() => getModel('text', env({ CF_AI_TOKEN: undefined }))).toThrow('CF_AI_TOKEN')
    expect(() => getModel('text', env({ CF_ACCOUNT_ID: '', CF_AI_TOKEN: '' }))).toThrow('CF_ACCOUNT_ID')
    expect(() => getModel('vision', env({ CF_AI_TOKEN: undefined }))).toThrow('CF_AI_TOKEN')
    try {
      getModel('text', env({ CF_ACCOUNT_ID: undefined }))
    } catch (err) {
      expect((err as Error).message).not.toContain(TOKEN)
      expect((err as Error).name).toBe('Error')
    }
  })

  test('replay needs no token: it never calls a model, so a missing token is no error', async () => {
    const { fetchMock } = network()
    const store = new MemoryStore()
    await store.put(await replayKey(DEEPSEEK, params), DEEPSEEK, answer('recorded'))
    const model = getModel('text', env({ AI_MODE: 'replay', CF_ACCOUNT_ID: undefined, CF_AI_TOKEN: undefined }, store))
    expect(textOf(await model.doGenerate(params))).toBe('recorded')
    // The same with one model and no fallback (a single model has no lookup layer of its own).
    const single = getModel('text', env({ AI_MODE: 'replay', LLM_MODEL_FALLBACKS: '', CF_ACCOUNT_ID: undefined, CF_AI_TOKEN: undefined }, store))
    expect(textOf(await single.doGenerate(params))).toBe('recorded')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('the other providers are as before (an unknown one still says so)', () => {
    expect(() => getModel('text', env({ LLM_PROVIDER: 'nope' }))).toThrow('Unknown LLM_PROVIDER: nope')
  })
})

describe('the backup model and the end of the list', () => {
  test('DeepSeek fails, GLM answers: the next model gets the call, and only Cloudflare is called', async () => {
    const { asked, calls } = network((m) => (m === DEEPSEEK ? cfError(404) : completion(m, `from ${m}`)))
    expect(textOf(await getModel('text', env()).doGenerate(params))).toBe(`from ${GLM}`)
    expect(asked()).toEqual([DEEPSEEK, GLM])
    expect(calls.every((c) => c.url === CF_URL)).toBe(true)
  })

  test.each([[403], [400], [401], [422]])('any error from the first model (status %s) moves on to the backup', async (status) => {
    const { asked } = network((m) => (m === DEEPSEEK ? cfError(status) : completion(m, `from ${m}`)))
    expect(textOf(await getModel('text', env()).doGenerate(params))).toBe(`from ${GLM}`)
    expect(asked()).toEqual([DEEPSEEK, GLM])
  })

  test('both fail: the first error goes up, nothing else is called (no last resort), so the screen shows Try again', async () => {
    const { asked, calls } = network((m) => (m === DEEPSEEK ? cfError(404) : cfError(403, 'forbidden')))
    await expect(getModel('text', env()).doGenerate(params)).rejects.toMatchObject({ statusCode: 404 })
    expect(asked()).toEqual([DEEPSEEK, GLM])
    expect(calls.every((c) => c.url === CF_URL)).toBe(true)
    expect(asked().some((id) => id.startsWith('nvidia/') || id.startsWith('google/'))).toBe(false)
  })
})

describe('the time limit of a Workers AI try', () => {
  test('150 seconds for workers-ai, and the other limits are as before', () => {
    expect(WORKERS_AI_MODEL_CALL_TIMEOUT_MS).toBe(150_000)
    expect(modelCallTimeoutMs('workers-ai', DEEPSEEK)).toBe(150_000)
    expect(modelCallTimeoutMs('workers-ai', GLM, true)).toBe(150_000)
    expect(modelCallTimeoutMs('openrouter', 'nvidia/nemotron-3.5-super-vl')).toBe(PAID_MODEL_CALL_TIMEOUT_MS)
    expect(modelCallTimeoutMs('openrouter', NEMOTRON)).toBe(MODEL_CALL_TIMEOUT_MS)
    expect(PAID_MODEL_CALL_TIMEOUT_MS).toBe(90_000)
    expect(MODEL_CALL_TIMEOUT_MS).toBe(240_000)
  })

  test('live: DeepSeek gets 150 s, then GLM gets 150 s, then the first error (a timeout) goes up', async () => {
    const { asked } = network(hang)
    fakeClock()
    const call = Promise.resolve(getModel('text', env()).doGenerate(params)).catch((e: unknown) => e)
    await until(() => asked().length === 1)
    await vi.advanceTimersByTimeAsync(149_999)
    expect(asked()).toEqual([DEEPSEEK])
    await vi.advanceTimersByTimeAsync(1)
    await until(() => asked().length === 2)
    expect(asked()).toEqual([DEEPSEEK, GLM])
    await vi.advanceTimersByTimeAsync(149_999)
    await vi.advanceTimersByTimeAsync(1)
    const err = await call
    expect(err).toBeInstanceOf(ModelTimeoutError)
    expect((err as Error).message).toContain('after 150 seconds')
    expect(asked()).toEqual([DEEPSEEK, GLM])
  })
})

describe('AI_RECORDED_IDS: recorded answers of the old ids keep hitting, and the old ids are never called', () => {
  const cache = (over: Partial<AiEnv> = {}, store = new MemoryStore()) => env({ AI_MODE: 'cache', AI_RECORDED_IDS: OLD_IDS, ...over }, store)

  test('the list: comma separated, blanks and repeats dropped', () => {
    expect(recordedIdList(OLD_IDS)).toEqual([NEMOTRON, ULTRA, GEMMA])
    expect(recordedIdList(` ${NEMOTRON} , ,${ULTRA},${NEMOTRON},`)).toEqual([NEMOTRON, ULTRA])
    expect(recordedIdList(undefined)).toEqual([])
    expect(recordedIdList('')).toEqual([])
  })

  test.each([NEMOTRON, ULTRA, GEMMA])('cache: an answer recorded under %s is returned and no model is called', async (id) => {
    const { fetchMock } = network()
    const store = new MemoryStore()
    await store.put(await replayKey(id, params), id, answer(`recorded under ${id}`))
    expect(textOf(await getModel('text', cache({}, store)).doGenerate(params))).toBe(`recorded under ${id}`)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('cache with one model and no fallbacks: the old ids are still looked up', async () => {
    const { fetchMock } = network()
    const store = new MemoryStore()
    await store.put(await replayKey(NEMOTRON, params), NEMOTRON, answer('recorded'))
    expect(textOf(await getModel('text', cache({ LLM_MODEL_FALLBACKS: '' }, store)).doGenerate(params))).toBe('recorded')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('cache on a miss: the Workers AI model is called, the old ids never are, and the answer is saved under the new id', async () => {
    const { asked, calls } = network()
    const store = new MemoryStore()
    const model = getModel('text', cache({}, store))
    expect(textOf(await model.doGenerate(params))).toBe(`from ${DEEPSEEK}`)
    expect(asked()).toEqual([DEEPSEEK])
    expect(calls[0]!.url).toBe(CF_URL)
    expect(await store.get(await replayKey(DEEPSEEK, params))).not.toBeNull()
    expect(await store.get(await replayKey(NEMOTRON, params))).toBeNull()
    expect(textOf(await model.doGenerate(params))).toBe(`from ${DEEPSEEK}`)
    expect(asked()).toEqual([DEEPSEEK])
  })

  test('cache when the Workers AI models fail on a miss: still no old id is called', async () => {
    const { asked } = network(() => cfError(404))
    await expect(getModel('text', cache()).doGenerate(params)).rejects.toMatchObject({ statusCode: 404 })
    expect(asked()).toEqual([DEEPSEEK, GLM])
  })

  test('cache: an answer under the new id is found too, and when both exist the old (free) id wins, as free ids always did', async () => {
    const { fetchMock } = network()
    const onlyNew = new MemoryStore()
    await onlyNew.put(await replayKey(DEEPSEEK, params), DEEPSEEK, answer('under the new id'))
    expect(textOf(await getModel('text', cache({}, onlyNew)).doGenerate(params))).toBe('under the new id')
    const both = new MemoryStore()
    await both.put(await replayKey(DEEPSEEK, params), DEEPSEEK, answer('under the new id'))
    await both.put(await replayKey(NEMOTRON, params), NEMOTRON, answer('under the old id'))
    // The free ids win, as they always did: the recorded demo answer is the one that is shown.
    expect(textOf(await getModel('text', cache({}, both)).doGenerate(params))).toBe('under the old id')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('replay: an old recorded answer is found, a call never recorded is a miss naming the first model, and no model is called', async () => {
    const { fetchMock } = network()
    const store = new MemoryStore()
    await store.put(await replayKey(GEMMA, params), GEMMA, answer('recorded'))
    const model = getModel('text', cache({ AI_MODE: 'replay' }, store))
    expect(textOf(await model.doGenerate(params))).toBe('recorded')
    const other = { prompt: [{ role: 'user', content: [{ type: 'text', text: 'never recorded' }] }] } as never
    const err = await Promise.resolve(model.doGenerate(other)).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ReplayMissError)
    expect((err as Error).message).toContain(`(${DEEPSEEK}:`)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('unset, nothing changes: an answer recorded under an old id is a miss, and the Workers AI model is called', async () => {
    const { asked } = network()
    const store = new MemoryStore()
    await store.put(await replayKey(NEMOTRON, params), NEMOTRON, answer('recorded under the old id'))
    expect(textOf(await getModel('text', env({ AI_MODE: 'cache' }, store)).doGenerate(params))).toBe(`from ${DEEPSEEK}`)
    expect(asked()).toEqual([DEEPSEEK])
    const replay = getModel('text', env({ AI_MODE: 'replay' }, new MemoryStore()))
    await expect(replay.doGenerate(params)).rejects.toBeInstanceOf(ReplayMissError)
  })

  test('live and record modes look nothing up: the old ids are not touched', async () => {
    for (const mode of ['live', 'record'] as const) {
      const { asked } = network()
      const store = new MemoryStore()
      await store.put(await replayKey(NEMOTRON, params), NEMOTRON, answer('recorded'))
      expect(textOf(await getModel('text', env({ AI_MODE: mode, AI_RECORDED_IDS: OLD_IDS }, store)).doGenerate(params)), mode).toBe(`from ${DEEPSEEK}`)
      expect(asked(), mode).toEqual([DEEPSEEK])
      vi.unstubAllGlobals()
    }
  })

  test('with OpenRouter models the variable is harmless: a call recorded under its own id still hits', async () => {
    const { fetchMock } = network()
    const store = new MemoryStore()
    await store.put(await replayKey(NEMOTRON, params), NEMOTRON, answer('recorded'))
    const openrouter = env({ LLM_PROVIDER: 'openrouter', LLM_MODEL: NEMOTRON, LLM_MODEL_FALLBACKS: ULTRA, OPENROUTER_API_KEY: 'k', AI_MODE: 'cache', AI_RECORDED_IDS: OLD_IDS }, store)
    expect(textOf(await getModel('text', openrouter).doGenerate(params))).toBe('recorded')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('the demo path still replays with Workers AI first (the committed fixture)', () => {
  type Part = { type?: string; text?: string }
  type Message = { role: string; content: string | Part[] }
  const rows = parseReplays(readFileSync(REPLAYS_FIXTURE))
  const text = (content: string | Part[]) => (typeof content === 'string' ? content : content.map((p) => p.text ?? '').join(''))
  const lessons = rows.flatMap((row) => {
    const messages = (row.response as { request?: { body?: { messages?: Message[] } } }).request?.body?.messages ?? []
    const system = messages.find((m) => m.role === 'system')
    const user = messages.find((m) => m.role === 'user')
    if (!system || !user || (typeof user.content !== 'string' && user.content.some((p) => p.type !== 'text'))) return []
    return /# Job: write_lesson/.test(text(system.content)) ? [{ row, system: text(system.content), prompt: text(user.content) }] : []
  })
  const savedText = (response: unknown) => ((response as { content?: Part[] }).content ?? []).filter((p) => p.type === 'text').map((p) => p.text ?? '').join('')

  test('every id a recorded answer was saved under is in AI_RECORDED_IDS', () => {
    const list = new Set(recordedIdList(OLD_IDS))
    const saved = [...new Set(rows.map((r) => r.model))]
    expect(saved.length).toBeGreaterThan(0)
    expect(saved.filter((id) => !list.has(id))).toEqual([])
  })

  test.each(['cache', 'replay'] as const)('%s: every recorded lesson is answered with Workers AI first, and nothing is called', async (mode) => {
    const { fetchMock } = network()
    const store = new MemoryStore()
    for (const r of rows) await store.put(r.key, r.model, r.response)
    expect(lessons.length).toBeGreaterThanOrEqual(30)
    const model = getModel('text', env({ AI_MODE: mode, AI_RECORDED_IDS: OLD_IDS }, store))
    expect(model.modelId).toBe(DEEPSEEK)
    for (const l of lessons) expect((await generateText({ model, system: l.system, prompt: l.prompt })).text, l.row.key).toBe(savedText(l.row.response))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('without AI_RECORDED_IDS the same lessons are a miss in replay (so the variable is what makes them hit)', async () => {
    network()
    const store = new MemoryStore()
    for (const r of rows) await store.put(r.key, r.model, r.response)
    const model = getModel('text', env({ AI_MODE: 'replay' }, store))
    const l = lessons[0]!
    await expect(generateText({ model, system: l.system, prompt: l.prompt, maxRetries: 0 })).rejects.toBeDefined()
  })
})
