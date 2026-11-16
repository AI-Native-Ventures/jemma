import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { APICallError } from 'ai'
import { MockLanguageModelV4 } from 'ai/test'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { backendFromEnv, limitParkMsFor, modelsFor, runnerFor } from '../backend'
import { FatalBackendError, LIMIT_PARK_MS } from '../chain'
import { OPENROUTER_MODELS, OPENROUTER_PARK_MS, ESTIMATE_PER_M, effortFromEnv, makeKeyUsage, makeOpenRouterRunner, openrouterModel, openrouterModelsFromEnv, readKey } from '../openrouter'
import { runOpencode } from '../opencode'

const KEY = 'test-secret-key-0123456789'

const answer = (text: string, openrouter?: Record<string, unknown>) => ({
  content: [{ type: 'text' as const, text }],
  finishReason: { unified: 'stop' as const, raw: 'stop' },
  usage: { inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 40, text: 40, reasoning: 0 } },
  warnings: [],
  ...(openrouter ? { providerMetadata: { openrouter } } : {}),
})

const runnerOf = (doGenerate: () => Promise<ReturnType<typeof answer>>, seen: string[] = []) =>
  makeOpenRouterRunner({
    apiKey: KEY,
    makeModel: (id) => {
      seen.push(id)
      return new MockLanguageModelV4({ modelId: id, doGenerate: doGenerate as never })
    },
  })

const apiError = (statusCode: number, message = 'nope') => new APICallError({ message, url: 'https://openrouter.ai/api/v1/chat/completions', requestBodyValues: {}, statusCode })

describe('the OpenRouter runner', () => {
  test('returns the text, the tokens, the cached tokens and the cost OpenRouter reports', async () => {
    const seen: string[] = []
    const run = runnerOf(async () => answer('{"a":1}', { usage: { promptTokens: 20_000, completionTokens: 6_000, promptTokensDetails: { cachedTokens: 18_000 }, cost: 0.0123 } }), seen)
    const r = await run('z-ai/glm-5.3-flash', 'prompt', { timeoutMs: 5000 })
    expect(r).toMatchObject({ text: '{"a":1}', tokensIn: 20_000, tokensCached: 18_000, tokensOut: 6_000, costUsd: 0.0123, limited: false })
    expect(r.tokensReasoning).toBeUndefined()
    expect(r.costEstimated).toBeUndefined()
    expect(r.error).toBeUndefined()
    expect(seen).toEqual(['z-ai/glm-5.3-flash'])
  })

  test('the thinking tokens are read from the completion details, and the real cost is kept as reported', async () => {
    const run = runnerOf(async () => answer('{"a":1}', { usage: { promptTokens: 11_000, completionTokens: 9_000, completionTokensDetails: { reasoningTokens: 8_400 }, promptTokensDetails: { cachedTokens: 0 }, cost: 0.00531 } }))
    const r = await run('deepseek/deepseek-v4.1-flash-1017', 'p', { timeoutMs: 5000 })
    expect(r).toMatchObject({ tokensIn: 11_000, tokensCached: 0, tokensOut: 9_000, tokensReasoning: 8_400, costUsd: 0.00531 })
    expect(r.costEstimated).toBeUndefined()
  })

  test('with no cost reported it estimates one, a little high, and says so', async () => {
    const run = runnerOf(async () => answer('{"a":1}', { usage: { promptTokens: 10_000, completionTokens: 2_000, promptTokensDetails: { cachedTokens: 4_000 } } }))
    const r = await run('deepseek/deepseek-v4-flash', 'p', { timeoutMs: 5000 })
    const expected = (6_000 * ESTIMATE_PER_M.input + 4_000 * ESTIMATE_PER_M.cached + 2_000 * ESTIMATE_PER_M.output) / 1_000_000
    expect(r.costUsd).toBeCloseTo(expected, 10)
    expect(r.costEstimated).toBe(true)
  })

  test('with no provider metadata at all it still reads the tokens from the SDK usage', async () => {
    const r = await runnerOf(async () => answer('{"a":1}'))('deepseek/deepseek-v4-flash', 'p', { timeoutMs: 5000 })
    expect(r.tokensIn).toBe(100)
    expect(r.tokensOut).toBe(40)
    expect(r.costEstimated).toBe(true)
  })

  test('HTTP 429 is a limit (a short rest), not a failure of the lesson', async () => {
    const r = await runnerOf(() => Promise.reject(apiError(429)))('z-ai/glm-5.3-flash', 'p', { timeoutMs: 5000 })
    expect(r).toMatchObject({ limited: true })
  })

  test.each([402, 401, 403])('HTTP %s stops the whole run: no credit or a refused key is not something another model fixes', async (status) => {
    await expect(runnerOf(() => Promise.reject(apiError(status)))('z-ai/glm-5.3-flash', 'p', { timeoutMs: 5000 })).rejects.toBeInstanceOf(FatalBackendError)
  })

  test('another HTTP error, a timeout and an empty reply are failures of that call only', async () => {
    const server = await runnerOf(() => Promise.reject(apiError(503, 'overloaded')))('m/x', 'p', { timeoutMs: 5000 })
    expect(server).toMatchObject({ limited: false, error: expect.stringContaining('503') })
    const slow = await runnerOf(() => new Promise((_resolve, reject) => setTimeout(() => reject(Object.assign(new Error('The operation was aborted'), { name: 'TimeoutError' })), 10)))('m/x', 'p', { timeoutMs: 1000 })
    expect(slow.error).toMatch(/timed out after 1s/)
    const empty = await runnerOf(async () => answer('   '))('m/x', 'p', { timeoutMs: 5000 })
    expect(empty.error).toMatch(/no text/)
  })

  test('the key is never in an error text', async () => {
    const r = await runnerOf(() => Promise.reject(apiError(500, `bad gateway for ${KEY} at the edge`)))('m/x', 'p', { timeoutMs: 5000 })
    expect(r.error).not.toContain(KEY)
    expect(r.error).toContain('[key]')
    const plain = await runnerOf(() => Promise.reject(new Error(`boom ${KEY}`)))('m/x', 'p', { timeoutMs: 5000 })
    expect(plain.error).not.toContain(KEY)
  })

  test('the reasoning effort is low unless TEACH_EFFORT says another, and it reaches the model', () => {
    expect(effortFromEnv({})).toBe('low')
    expect(effortFromEnv({ TEACH_EFFORT: ' None ' })).toBe('none')
    expect(() => effortFromEnv({ TEACH_EFFORT: 'max' })).toThrow(/none, minimal, low or medium/)
    const model = openrouterModel(KEY, 'none')('deepseek/deepseek-v4-flash') as unknown as { settings?: Record<string, unknown> }
    expect(model.settings).toMatchObject({ reasoning: { effort: 'none' }, usage: { include: true } })
  })

  test('the model is built with low reasoning effort and usage accounting', () => {
    const model = openrouterModel(KEY)('z-ai/glm-5.3-flash') as unknown as { settings?: Record<string, unknown>; modelId?: string }
    expect(model.modelId).toBe('z-ai/glm-5.3-flash')
    expect(model.settings).toMatchObject({ reasoning: { effort: 'low' }, usage: { include: true } })
  })
})

describe('the key file', () => {
  let dir: string
  beforeEach(() => void (dir = mkdtempSync(join(tmpdir(), 'teach-key-'))))
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  test('is read from the file the env names, trimmed', () => {
    const file = join(dir, 'key.txt')
    writeFileSync(file, `${KEY}\n`)
    expect(readKey({ TEACH_OPENROUTER_KEY_FILE: file })).toBe(KEY)
  })

  test('a missing variable, a missing file and an empty file are errors that never show the key', () => {
    expect(() => readKey({})).toThrow(/TEACH_OPENROUTER_KEY_FILE/)
    expect(() => readKey({ TEACH_OPENROUTER_KEY_FILE: join(dir, 'nope.txt') })).toThrow(/cannot read the key file/)
    const empty = join(dir, 'empty.txt')
    writeFileSync(empty, '  \n')
    expect(() => readKey({ TEACH_OPENROUTER_KEY_FILE: empty })).toThrow(/empty/)
  })

  test('runnerFor reads the key only for the OpenRouter backend', () => {
    expect(runnerFor('opencode', {})).toBe(runOpencode)
    expect(() => runnerFor('openrouter', {})).toThrow(/TEACH_OPENROUTER_KEY_FILE/)
    const file = join(dir, 'key.txt')
    writeFileSync(file, KEY)
    expect(typeof runnerFor('openrouter', { TEACH_OPENROUTER_KEY_FILE: file })).toBe('function')
  })
})

describe('the backend switch', () => {
  test('OpenCode is the default; openrouter is chosen by TEACH_BACKEND; anything else is refused', () => {
    expect(backendFromEnv({})).toBe('opencode')
    expect(backendFromEnv({ TEACH_BACKEND: 'opencode' })).toBe('opencode')
    expect(backendFromEnv({ TEACH_BACKEND: ' OpenRouter ' })).toBe('openrouter')
    expect(() => backendFromEnv({ TEACH_BACKEND: 'anthropic' })).toThrow(/opencode or openrouter/)
  })

  test('each backend has its own ranked chain and its own checks of TEACH_MODELS', () => {
    expect(OPENROUTER_MODELS).toEqual(['z-ai/glm-5.3-flash', 'deepseek/deepseek-v4.1-flash-1017', 'deepseek/deepseek-v4-flash'])
    expect(modelsFor('openrouter', {})).toEqual(OPENROUTER_MODELS)
    expect(modelsFor('opencode', {})[0]).toBe('opencode/hy4-flash-free')
    expect(modelsFor('openrouter', { TEACH_MODELS: 'deepseek/deepseek-v4-flash, qwen/qwen3-30b' })).toEqual(['deepseek/deepseek-v4-flash', 'qwen/qwen3-30b'])
    expect(() => modelsFor('openrouter', { TEACH_MODELS: 'anthropic/claude-sonnet-5' })).toThrow(/closed, expensive/)
    expect(() => modelsFor('openrouter', { TEACH_MODELS: 'openai/gpt-6' })).toThrow(/closed, expensive/)
    expect(() => modelsFor('openrouter', { TEACH_MODELS: 'not a model' })).toThrow(/OpenRouter model id/)
    expect(() => modelsFor('opencode', { TEACH_MODELS: 'deepseek/deepseek-v4-flash' })).toThrow(/OpenCode/)
    expect(openrouterModelsFromEnv({ TEACH_MODELS: '' })).toEqual(OPENROUTER_MODELS)
  })

  test('a paid rate limit rests two minutes, OpenCode free quota an hour', () => {
    expect(limitParkMsFor('openrouter')).toBe(OPENROUTER_PARK_MS)
    expect(OPENROUTER_PARK_MS).toBe(2 * 60_000)
    expect(limitParkMsFor('opencode')).toBe(LIMIT_PARK_MS)
  })
})

describe('the key usage read from OpenRouter', () => {
  const fakeFetch = (respond: () => Promise<Response>, seen: { url?: string; auth?: string } = {}) =>
    (async (url: string | URL | Request, init?: RequestInit) => {
      seen.url = String(url)
      seen.auth = (init?.headers as Record<string, string> | undefined)?.authorization
      return respond()
    }) as unknown as typeof fetch

  test('reads data.usage from GET /api/v1/key with the key as a bearer token', async () => {
    const seen: { url?: string; auth?: string } = {}
    const usage = await makeKeyUsage(KEY, fakeFetch(async () => Response.json({ data: { usage: 0.9122, limit: 50 } }), seen))()
    expect(usage).toBe(0.9122)
    expect(seen.url).toBe('https://openrouter.ai/api/v1/key')
    expect(seen.auth).toBe(`Bearer ${KEY}`)
  })

  test('a refused request, a network error and a body without a number are null, never an error', async () => {
    expect(await makeKeyUsage(KEY, fakeFetch(async () => new Response('no', { status: 401 })))()).toBeNull()
    expect(await makeKeyUsage(KEY, fakeFetch(() => Promise.reject(new Error('offline'))))()).toBeNull()
    expect(await makeKeyUsage(KEY, fakeFetch(async () => Response.json({ data: { usage: 'a lot' } })))()).toBeNull()
    expect(await makeKeyUsage(KEY, fakeFetch(async () => Response.json({})))()).toBeNull()
  })
})
