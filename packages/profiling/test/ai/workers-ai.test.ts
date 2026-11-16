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
  bindingFetch,
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
    expect(() => getModel('text', env({ CF_ACCOUNT_ID: '', CF_AI_TOKEN: '' }))).toThrow('CF_AI_TOKEN')
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

// P121e: no API token. The agent's own Workers AI binding (env.AI) takes the same OpenAI chat body and returns the same completion object, so the
// OpenAI provider runs through a `fetch` that is backed by the binding.
/**
 * What the real binding returned for DeepSeek V4.1 Flash and GLM 5.3 Flash (coordinator's live check, 16 November 2026): the OpenAI chat-completion
 * object with the keys id, object, created, model, choices and usage, where usage also holds `prompt_tokens_details` and an extra `neurons`.
 */
const openaiOutput = (model: string, text: string) => ({
  id: 'chatcmpl-1',
  object: 'chat.completion',
  created: 1,
  model,
  choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7, prompt_tokens_details: { cached_tokens: 0 }, neurons: 12.5 },
})

type Run = { model: string; input: Record<string, unknown>; options: unknown[] }
/** A fake Workers AI binding: records each `run` and answers through `handler`. Nothing leaves the machine. */
function fakeBinding(handler: (model: string, input: Record<string, unknown>) => unknown = (m) => openaiOutput(m, `from ${m}`)) {
  const runs: Run[] = []
  const binding = {
    run: vi.fn(async (model: string, input: Record<string, unknown>, ...options: unknown[]) => {
      runs.push({ model, input, options })
      return handler(model, input)
    }),
  }
  return { binding, runs, asked: () => runs.map((r) => r.model) }
}

const BINDING_URL = 'https://workers-ai.binding/v1/chat/completions'
const post = (body: unknown) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) })
/** The binding env: no token, no account id, only the binding. */
const bindingEnv = (binding: unknown, over: Partial<AiEnv> = {}, store = new MemoryStore()) =>
  env({ CF_ACCOUNT_ID: undefined, CF_AI_TOKEN: undefined, AI_BINDING: binding as never, ...over }, store)

/** Runs a call that waits in fake time (the retry waits and the time limit) until it has settled. */
async function settle<T>(call: Promise<T>): Promise<T | unknown> {
  let done = false
  const out = call.then((v) => v, (e: unknown) => e).finally(() => { done = true })
  for (let i = 0; i < 400 && !done; i++) {
    await vi.advanceTimersByTimeAsync(3_000)
    await new Promise<void>((r) => realSetTimeout(r, 1))
  }
  expect(done).toBe(true)
  return out
}

describe('bindingFetch', () => {
  const body = {
    model: DEEPSEEK,
    messages: [
      { role: 'system', content: 'You write practice sessions.' },
      { role: 'user', content: [{ type: 'text', text: 'Read the answers' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,AQID' } }] },
    ],
    max_tokens: 4096,
    temperature: 0.2,
    response_format: { type: 'json_object' },
  }

  test('the model is taken out of the body and the rest reaches run unchanged, image part included', async () => {
    const { binding, runs } = fakeBinding()
    const res = await bindingFetch(binding)(BINDING_URL, post(body))
    expect(runs).toHaveLength(1)
    expect(runs[0]!.model).toBe(DEEPSEEK)
    const { model: _model, ...rest } = body
    expect(runs[0]!.input).toEqual(rest)
    expect(runs[0]!.input).not.toHaveProperty('model')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/json')
    expect(await res.json()).toEqual(openaiOutput(DEEPSEEK, `from ${DEEPSEEK}`))
  })

  test('a Request object works as well as a URL and an init', async () => {
    const { binding, runs } = fakeBinding()
    const res = await bindingFetch(binding)(new Request(BINDING_URL, post(body)))
    expect(res.status).toBe(200)
    expect(runs[0]!.model).toBe(DEEPSEEK)
  })

  test.each([
    ['Capacity temporarily exceeded', 429],
    ['Rate limit exceeded', 429],
    ['Too many requests', 429],
    ['3040: CAPACITY EXCEEDED', 429],
    ['please slow down: you hit the RATE', 429],
    ['Internal server error', 500],
    ['AiError: something broke', 500],
    ['', 500],
  ])('a binding error "%s" becomes status %s with the message in the OpenAI error body', async (message, status) => {
    const { binding } = fakeBinding(() => {
      throw new Error(message)
    })
    const res = await bindingFetch(binding)(BINDING_URL, post(body))
    expect(res.status).toBe(status)
    expect(res.headers.get('content-type')).toBe('application/json')
    const json = (await res.json()) as { error: { message: string } }
    expect(typeof json.error.message).toBe('string')
    if (message) expect(json.error.message).toBe(message)
  })

  test('a binding that throws something that is not an Error, or rejects, is a 500 with the text', async () => {
    const thrown = fakeBinding(() => {
      throw 'plain text failure'
    })
    const a = await bindingFetch(thrown.binding)(BINDING_URL, post(body))
    expect(a.status).toBe(500)
    expect(((await a.json()) as { error: { message: string } }).error.message).toBe('plain text failure')
    const rejected = { run: vi.fn(() => Promise.reject(new Error('Capacity exceeded'))) }
    expect((await bindingFetch(rejected)(BINDING_URL, post(body))).status).toBe(429)
    const syncThrow = { run: vi.fn(() => { throw new Error('boom') }) }
    expect((await bindingFetch(syncThrow as never)(BINDING_URL, post(body))).status).toBe(500)
  })

  test.each([[{}], [{ response: 'text only' }], [null], ['a string'], [[]], [{ choices: 'no' }], [{ result: { choices: [] } }]])('an output without choices (%j) is a 502 that names the model', async (output) => {
    const { binding } = fakeBinding(() => output)
    const res = await bindingFetch(binding)(BINDING_URL, post(body))
    expect(res.status).toBe(502)
    expect(((await res.json()) as { error: { message: string } }).error.message).toContain(DEEPSEEK)
  })

  test('streaming is refused with 400 and the binding is not called', async () => {
    const { binding, runs } = fakeBinding()
    const res = await bindingFetch(binding)(BINDING_URL, post({ ...body, stream: true }))
    expect(res.status).toBe(400)
    expect(runs).toHaveLength(0)
    // stream: false is fine and goes through with the rest.
    expect((await bindingFetch(binding)(BINDING_URL, post({ ...body, stream: false }))).status).toBe(200)
    expect(runs[0]!.input.stream).toBe(false)
  })

  test('a body that is not a JSON object, or has no model, is a 400 and the binding is not called', async () => {
    const { binding, runs } = fakeBinding()
    for (const bad of ['not json', '[]', 'null', '{}', JSON.stringify({ model: 5, messages: [] }), '']) {
      expect((await bindingFetch(binding)(BINDING_URL, post(bad))).status, bad).toBe(400)
    }
    expect(runs).toHaveLength(0)
  })

  test('a call that is already cancelled never reaches the binding, and a cancel while it waits ends the fetch', async () => {
    const { binding, runs } = fakeBinding()
    const done = new AbortController()
    done.abort(new Error('cancelled by the caller'))
    await expect(bindingFetch(binding)(BINDING_URL, { ...post(body), signal: done.signal })).rejects.toThrow('cancelled by the caller')
    expect(runs).toHaveLength(0)

    const stuck = { run: vi.fn(() => new Promise<unknown>(() => {})) }
    const later = new AbortController()
    const pending = bindingFetch(stuck)(BINDING_URL, { ...post(body), signal: later.signal })
    later.abort(new Error('the time limit passed'))
    await expect(pending).rejects.toThrow('the time limit passed')
    expect(stuck.run).toHaveBeenCalledTimes(1)
  })

  test('a binding that fails after the call was cancelled leaves no unhandled rejection', async () => {
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    let fail: (e: Error) => void = () => {}
    const slow = { run: vi.fn(() => new Promise<unknown>((_, reject) => { fail = reject })) }
    const controller = new AbortController()
    const pending = bindingFetch(slow)(BINDING_URL, { ...post(body), signal: controller.signal })
    controller.abort(new Error('cancelled'))
    await expect(pending).rejects.toThrow('cancelled')
    fail(new Error('too late'))
    await new Promise<void>((r) => realSetTimeout(r, 20))
    process.off('unhandledRejection', unhandled)
    expect(unhandled).not.toHaveBeenCalled()
  })
})

describe('the workers-ai provider through the binding (no token)', () => {
  test('getModel with the binding and no token: the text comes back through the provider, and no network is used', async () => {
    const { fetchMock } = network()
    const { binding, runs } = fakeBinding()
    const model = getModel('text', bindingEnv(binding))
    expect(model.modelId).toBe(DEEPSEEK)
    expect(model.provider).toContain('workers-ai')
    expect(textOf(await model.doGenerate(params))).toBe(`from ${DEEPSEEK}`)
    expect(runs).toHaveLength(1)
    expect(runs[0]!.model).toBe(DEEPSEEK)
    expect(runs[0]!.input).not.toHaveProperty('model')
    expect((runs[0]!.input.messages as Array<{ role: string }>)[0]!.role).toBe('user')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('generateText works: the answer text, and the token counts of the binding output', async () => {
    network()
    const { binding } = fakeBinding()
    const out = await generateText({ model: getModel('text', bindingEnv(binding)), system: 'You write practices.', prompt: 'Write a practice' })
    expect(out.text).toBe(`from ${DEEPSEEK}`)
    expect(out.usage.inputTokens).toBe(3)
    expect(out.usage.outputTokens).toBe(4)
  })

  test('a photo reaches the binding as an image_url part of the message', async () => {
    network()
    const { binding, runs } = fakeBinding()
    const model = getModel('vision', bindingEnv(binding))
    const out = await generateText({ model, messages: [{ role: 'user', content: [{ type: 'text', text: 'Read the answers' }, { type: 'file', data: new Uint8Array([1, 2, 3]), mediaType: 'image/png' }] }] })
    expect(out.text).toBe(`from ${DEEPSEEK}`)
    const parts = runs[0]!.input.messages as Array<{ content: Array<{ type: string; image_url?: { url: string } }> }>
    expect(parts[0]!.content.map((p) => p.type)).toEqual(['text', 'image_url'])
    expect(parts[0]!.content[1]!.image_url?.url).toMatch(/^data:image\/png;base64,/)
  })

  test('the extra usage fields of the real binding output (prompt_tokens_details, neurons) are tolerated, and cached tokens are read', async () => {
    network()
    const output = { ...openaiOutput(DEEPSEEK, 'ok'), usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14, prompt_tokens_details: { cached_tokens: 6 }, neurons: 99.25 } }
    const { binding } = fakeBinding(() => output)
    const out = await generateText({ model: getModel('text', bindingEnv(binding)), prompt: 'hi' })
    expect(out.text).toBe('ok')
    expect(out.usage.inputTokens).toBe(10)
    expect(out.usage.outputTokens).toBe(4)
    expect(out.usage.totalTokens).toBe(14)
    // The answer is also what the replay layer would store: the output goes through the provider like any other.
    expect(out.finishReason).toBe('stop')
  })

  test('JSON asked for in the prompt (generateJson) works through the binding', async () => {
    network()
    const { binding } = fakeBinding((m) => openaiOutput(m, '{"questions":[1,2,3]}'))
    const out = await generateText({ model: getModel('text', bindingEnv(binding)), prompt: 'Return JSON' })
    expect(JSON.parse(out.text)).toEqual({ questions: [1, 2, 3] })
  })

  test('a capacity error moves the chain on to GLM, after the usual retries, and its answer is returned', async () => {
    network()
    const { binding, runs } = fakeBinding((m) => {
      if (m === DEEPSEEK) throw new Error('Capacity temporarily exceeded')
      return openaiOutput(m, `from ${m}`)
    })
    fakeClock()
    const call = Promise.resolve(getModel('text', bindingEnv(binding)).doGenerate(params))
    const out = (await settle(call)) as { content: unknown }
    expect(textOf(out)).toBe(`from ${GLM}`)
    // One try and the four retries of the first model (2, 5, 10 and 20 s apart), then the backup.
    expect(runs.map((r) => r.model)).toEqual([DEEPSEEK, DEEPSEEK, DEEPSEEK, DEEPSEEK, DEEPSEEK, GLM])
  })

  test('an output without choices moves on to GLM too', async () => {
    network()
    const { binding, runs } = fakeBinding((m) => (m === DEEPSEEK ? { response: 'old shape' } : openaiOutput(m, `from ${m}`)))
    fakeClock()
    const out = (await settle(Promise.resolve(getModel('text', bindingEnv(binding)).doGenerate(params)))) as { content: unknown }
    expect(textOf(out)).toBe(`from ${GLM}`)
    expect(runs[0]!.model).toBe(DEEPSEEK)
    expect(runs.at(-1)!.model).toBe(GLM)
  })

  test('both models failing sends the first error up (a 429 with the message), and nothing else is asked', async () => {
    network()
    const { binding, runs } = fakeBinding((m) => {
      throw new Error(m === DEEPSEEK ? 'Capacity temporarily exceeded' : 'Internal server error')
    })
    fakeClock()
    const err = (await settle(Promise.resolve(getModel('text', bindingEnv(binding)).doGenerate(params)))) as { statusCode?: number; message?: string }
    expect(err.statusCode).toBe(429)
    expect(err.message).toContain('Capacity temporarily exceeded')
    expect(new Set(runs.map((r) => r.model))).toEqual(new Set([DEEPSEEK, GLM]))
  })

  test('a binding that never answers: 150 s for the first model, then the backup is asked', async () => {
    network()
    const { binding, asked } = fakeBinding(() => new Promise(() => {}))
    fakeClock()
    const call = Promise.resolve(getModel('text', bindingEnv(binding)).doGenerate(params)).catch((e: unknown) => e)
    await until(() => asked().length === 1)
    await vi.advanceTimersByTimeAsync(149_999)
    expect(asked()).toEqual([DEEPSEEK])
    await vi.advanceTimersByTimeAsync(1)
    await until(() => asked().length === 2)
    expect(asked()).toEqual([DEEPSEEK, GLM])
    await vi.advanceTimersByTimeAsync(150_000)
    const err = await call
    expect(err).toBeInstanceOf(ModelTimeoutError)
    expect((err as Error).message).toContain('after 150 seconds')
  })

  test('with a token present REST is used and the binding is never called', async () => {
    const { calls } = network()
    const { binding, runs } = fakeBinding()
    expect(textOf(await getModel('text', env({ AI_BINDING: binding as never })).doGenerate(params))).toBe(`from ${DEEPSEEK}`)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe(CF_URL)
    expect(calls[0]!.headers.authorization).toBe(`Bearer ${TOKEN}`)
    expect(runs).toHaveLength(0)
  })

  test('with a token but no account id REST still names CF_ACCOUNT_ID', () => {
    const { binding } = fakeBinding()
    expect(() => getModel('text', env({ CF_ACCOUNT_ID: undefined, AI_BINDING: binding as never }))).toThrow('CF_ACCOUNT_ID')
  })

  test('with neither a token nor the binding the plain error names both, and never a secret', () => {
    network()
    for (const over of [{ CF_ACCOUNT_ID: undefined, CF_AI_TOKEN: undefined }, { CF_AI_TOKEN: undefined }, { CF_AI_TOKEN: '   ', CF_ACCOUNT_ID: ACCOUNT }]) {
      expect(() => getModel('text', env(over)), JSON.stringify(over)).toThrow(/CF_AI_TOKEN or the AI binding/)
      expect(() => getModel('vision', env(over))).toThrow(/AI binding/)
    }
  })

  test('the binding needs no account id and no token: the account id is only for REST', async () => {
    network()
    const { binding } = fakeBinding()
    expect(() => getModel('text', bindingEnv(binding, { CF_ACCOUNT_ID: undefined }))).not.toThrow()
    expect(textOf(await getModel('text', bindingEnv(binding, { CF_ACCOUNT_ID: '' })).doGenerate(params))).toBe(`from ${DEEPSEEK}`)
  })

  test('the binding is not asked for in replay, and cache hits and misses behave as with REST', async () => {
    network()
    const { binding, runs } = fakeBinding()
    // cache miss: the binding is called once, the answer is saved under the new id, the next call comes from storage, the old ids are never called.
    const store = new MemoryStore()
    const model = getModel('text', bindingEnv(binding, { AI_MODE: 'cache', AI_RECORDED_IDS: OLD_IDS }, store))
    expect(textOf(await model.doGenerate(params))).toBe(`from ${DEEPSEEK}`)
    expect(runs.map((r) => r.model)).toEqual([DEEPSEEK])
    expect(await store.get(await replayKey(DEEPSEEK, params))).not.toBeNull()
    expect(textOf(await model.doGenerate(params))).toBe(`from ${DEEPSEEK}`)
    expect(runs).toHaveLength(1)
    // a recorded answer under an old id is found with no binding call
    const recorded = new MemoryStore()
    await recorded.put(await replayKey(NEMOTRON, params), NEMOTRON, answer('recorded under the old id'))
    expect(textOf(await getModel('text', bindingEnv(binding, { AI_MODE: 'cache', AI_RECORDED_IDS: OLD_IDS }, recorded)).doGenerate(params))).toBe('recorded under the old id')
    expect(textOf(await getModel('text', bindingEnv(binding, { AI_MODE: 'replay', AI_RECORDED_IDS: OLD_IDS }, recorded)).doGenerate(params))).toBe('recorded under the old id')
    expect(runs).toHaveLength(1)
  })

  test('the committed fixture still resolves in cache and replay with the binding and no token', async () => {
    const { fetchMock } = network()
    const { binding, runs } = fakeBinding()
    const store = new MemoryStore()
    const rows = parseReplays(readFileSync(REPLAYS_FIXTURE))
    for (const r of rows) await store.put(r.key, r.model, r.response)
    type Part = { type?: string; text?: string }
    type Message = { role: string; content: string | Part[] }
    const textOfContent = (content: string | Part[]) => (typeof content === 'string' ? content : content.map((p) => p.text ?? '').join(''))
    const lessons = rows.flatMap((row) => {
      const messages = (row.response as { request?: { body?: { messages?: Message[] } } }).request?.body?.messages ?? []
      const system = messages.find((m) => m.role === 'system')
      const user = messages.find((m) => m.role === 'user')
      if (!system || !user || (typeof user.content !== 'string' && user.content.some((p) => p.type !== 'text'))) return []
      return /# Job: write_lesson/.test(textOfContent(system.content)) ? [{ row, system: textOfContent(system.content), prompt: textOfContent(user.content) }] : []
    })
    expect(lessons.length).toBeGreaterThanOrEqual(30)
    for (const mode of ['cache', 'replay'] as const) {
      const model = getModel('text', bindingEnv(binding, { AI_MODE: mode, AI_RECORDED_IDS: OLD_IDS }, store))
      for (const l of lessons) {
        const saved = ((l.row.response as { content?: Part[] }).content ?? []).filter((p) => p.type === 'text').map((p) => p.text ?? '').join('')
        expect((await generateText({ model, system: l.system, prompt: l.prompt })).text, l.row.key).toBe(saved)
      }
    }
    expect(runs).toHaveLength(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
