import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  AA_FREE_MODELS_URL,
  CATALOG_FAILURE_TTL_MS,
  CATALOG_TTL_MS,
  OPENROUTER_MODELS_URL,
  aaScore,
  loadCatalog,
  normaliseAaName,
  normaliseOpenRouterId,
  rankModels,
  resetCatalogMemo,
  type AaModel,
  type OpenRouterModel,
} from '../../src/ai'

// P121: the hosted app picks its free models from OpenRouter's public list and Artificial Analysis's ranking. These tests use two committed
// fixtures (a trimmed copy of OpenRouter's list of 16 November 2026, and an invented Artificial Analysis answer in the documented shape) and a
// fake `fetch`. No database, no network, no model.

const fixture = (name: string) => JSON.parse(readFileSync(join(import.meta.dirname, '../fixtures', name), 'utf8')) as { data: unknown[] }
const OR = fixture('openrouter-models-2026-11-16.json').data as OpenRouterModel[]
const AA_RAW = fixture('aa-free-models.synthetic.json')

const row = (r: Record<string, unknown>) => r as { slug: string; name: string; evaluations?: { artificial_analysis_intelligence_index?: number } }
/** The parsed form of the synthetic answer, the way `loadCatalog` hands it over. */
const AA: AaModel[] = (AA_RAW.data as ReturnType<typeof row>[]).map((r) => ({
  slug: r.slug,
  name: r.name,
  score: r.evaluations?.artificial_analysis_intelligence_index ?? null,
}))

const orModel = (id: string, over: Partial<OpenRouterModel> = {}): OpenRouterModel => ({
  id,
  created: 1_700_000_000,
  context_length: 200_000,
  architecture: { input_modalities: ['text'] },
  supported_parameters: ['tools', 'temperature'],
  pricing: { prompt: '0', completion: '0' },
  ...over,
})
const aaRow = (slug: string, name: string, score: number | null): AaModel => ({ slug, name, score })
const hasImage = (id: string) => OR.find((m) => m.id === id)?.architecture?.input_modalities?.includes('image') ?? false

const PAID = 'nvidia/nemotron-3.5-super-vl'
const SUPER = 'nvidia/nemotron-3.5-super-vl:free'
const ULTRA = 'nvidia/nemotron-3-ultra-550b-a55b:free'
const GEMMA31 = 'google/gemma-4-31b-it:free'
const GEMMA26 = 'google/gemma-4-26b-a4b-it:free'
const ERNIE = 'baidu/ernie-5.5-flash-preview:free'
const LING = 'inclusionai/ling-3.2-flash:free'

describe('the name normaliser', () => {
  test('an OpenRouter id loses the creator and the :free suffix, and . _ and spaces become -', () => {
    expect(normaliseOpenRouterId(SUPER)).toBe('nemotron-3-5-super-vl')
    expect(normaliseOpenRouterId(GEMMA31)).toBe('gemma-4-31b-it')
    expect(normaliseOpenRouterId(GEMMA26)).toBe('gemma-4-26b-a4b-it')
    expect(normaliseOpenRouterId('Liquid/LFM-3-1.7B:FREE')).toBe('lfm-3-1-7b')
    expect(normaliseOpenRouterId('some_creator/My_Model  v2.0:free')).toBe('my-model-v2-0')
  })

  test('an id with no creator and no suffix is just lowercased and cleaned', () => {
    expect(normaliseOpenRouterId('Gemma-4')).toBe('gemma-4')
    expect(normaliseOpenRouterId('')).toBe('')
  })

  test('an AA name loses parenthesised effort words, a slug is cleaned the same way', () => {
    expect(normaliseAaName('Claude Opus 5.5 (max)')).toBe('claude-opus-5-5')
    expect(normaliseAaName('Gemma 4 26B A4B (Reasoning)')).toBe('gemma-4-26b-a4b')
    expect(normaliseAaName('Foo__Bar  (high) ')).toBe('foo-bar')
    expect(normaliseAaName('claude-opus-5-5')).toBe('claude-opus-5-5')
    expect(normaliseAaName('Nemotron 3.5 Super (non-reasoning)')).toBe('nemotron-3-5-super')
  })

  test('repeats of the separator collapse and the ends are trimmed', () => {
    expect(normaliseAaName(' -- A  .. B -- ')).toBe('a-b')
  })
})

describe('aaScore: which AA row is this OpenRouter model', () => {
  const score = (id: string, rows: AaModel[]) => aaScore({ id }, rows)

  test('equal normalised names match, by slug or by name', () => {
    expect(score('google/gemma-4-31b:free', [aaRow('gemma-4-31b', 'x', 38)])).toBe(38)
    expect(score('google/gemma-4-31b:free', [aaRow('other-slug', 'Gemma 4 31B (max)', 39)])).toBe(39)
  })

  test.each(['it', 'instruct', 'chat', 'preview', 'vl', 'a4b', 'a55b', '31b', '7b', 'free'])('one trailing variant token (%s) on either side still matches', (token) => {
    expect(score(`acme/thing-1-${token}:free`, [aaRow('thing-1', 'Thing 1', 12)])).toBe(12)
    expect(score('acme/thing-1:free', [aaRow(`thing-1-${token}`, `Thing 1 ${token}`, 13)])).toBe(13)
  })

  test('a trailing word that is not a variant token does not match', () => {
    expect(score('acme/thing-1-pro:free', [aaRow('thing-1', 'Thing 1', 12)])).toBeNull()
    expect(score('acme/thing-1:free', [aaRow('thing-1-pro', 'Thing 1 Pro', 12)])).toBeNull()
    expect(score('acme/thing-1-max:free', [aaRow('thing-1-mini', 'Thing 1 Mini', 12)])).toBeNull()
  })

  test('two trailing tokens do not match: the rule is one token', () => {
    expect(score('acme/thing-1-a4b-it:free', [aaRow('thing-1', 'Thing 1', 12)])).toBeNull()
  })

  test('a name that only starts the same way does not match', () => {
    expect(score('google/gemma-4-31b-it:free', [aaRow('gemma-4-3', 'Gemma 4 3', 5), aaRow('gemma-4', 'Gemma 4', 6)])).toBeNull()
    expect(score('acme/thing-10:free', [aaRow('thing-1', 'Thing 1', 7)])).toBeNull()
  })

  test('several rows match: the highest score wins', () => {
    const rows = [aaRow('gemma-4-31b', 'Gemma 4 31B (Reasoning)', 38.2), aaRow('gemma-4-31b-nr', 'Gemma 4 31B (Non-reasoning)', 30.1)]
    expect(score(GEMMA31, rows)).toBe(38.2)
  })

  test('no match is null, and so is a match with no score (unrated)', () => {
    expect(score(GEMMA31, [aaRow('claude-opus-5-5', 'Claude Opus 5.5', 59.1)])).toBeNull()
    expect(score(GEMMA31, [aaRow('gemma-4-31b', 'Gemma 4 31B', null)])).toBeNull()
    expect(score(GEMMA31, [])).toBeNull()
    expect(score('', [aaRow('', '', 3)])).toBeNull()
  })

  test('a row with no score does not hide a rated row of the same model', () => {
    expect(score(GEMMA31, [aaRow('gemma-4-31b', 'Gemma 4 31B', null), aaRow('gemma-4-31b-r', 'Gemma 4 31B (Reasoning)', 21)])).toBe(21)
  })

  test("today's real OpenRouter ids against the invented AA rows", () => {
    expect(score(SUPER, AA)).toBe(41)
    expect(score(GEMMA31, AA)).toBe(38.2)
    expect(score(GEMMA26, AA)).toBe(33.5)
    expect(score(ULTRA, AA)).toBe(47)
    expect(score(ERNIE, AA)).toBe(44)
    expect(score(LING, AA)).toBe(36)
    expect(score('nvidia/nemotron-3.5-lightning:free', AA)).toBe(28)
    expect(score('thinkingmachines/inkling-2-small:free', AA)).toBe(29)
    expect(score('nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', AA)).toBe(31)
    // These have an AA row with no score, or no AA row at all.
    expect(score('dots-studio/dots-3-note-preview:free', AA)).toBeNull()
    expect(score('particle-ai/particle-1:free', AA)).toBeNull()
    expect(score('liquid/lfm-3-1.7b:free', AA)).toBeNull()
    expect(score('cohere/north-mini-code:free', AA)).toBeNull()
    expect(score('recursive/flint-v1.0:free', AA)).toBeNull()
  })
})

describe('rankModels: the candidates', () => {
  const rank = (over: Partial<Parameters<typeof rankModels>[0]> = {}) => rankModels({ kind: 'text', openrouter: OR, aa: AA, pinned: [], ...over })

  test('only :free ids with tools and enough context are candidates, closed and open alike', () => {
    const list = [
      orModel('a/paid-model', { pricing: { prompt: '0.001', completion: '0.002' } }),
      orModel('a/no-tools:free', { supported_parameters: ['temperature'] }),
      orModel('a/short:free', { context_length: 100_000 }),
      orModel('a/no-context:free', { context_length: undefined }),
      orModel('a/ok:free'),
      orModel('closed/frontier:free'),
    ]
    const aa = [aaRow('paid-model', 'Paid', 99), aaRow('no-tools', 'No tools', 98), aaRow('short', 'Short', 97), aaRow('no-context', 'No context', 96), aaRow('ok', 'Ok', 50), aaRow('frontier', 'Frontier', 60)]
    expect(rank({ openrouter: list, aa })).toEqual(['closed/frontier:free', 'a/ok:free'])
  })

  test('the context limit is 131072 by default and can be set', () => {
    const list = [orModel('a/edge:free', { context_length: 131_072 }), orModel('a/below:free', { context_length: 131_071 })]
    const aa = [aaRow('edge', 'Edge', 10), aaRow('below', 'Below', 20)]
    expect(rank({ openrouter: list, aa })).toEqual(['a/edge:free'])
    expect(rank({ openrouter: list, aa, minContext: 100_000 })).toEqual(['a/below:free', 'a/edge:free'])
    expect(rank({ openrouter: list, aa, minContext: 200_000 }, )).toEqual([])
  })

  test('a model id that ends with :free in capitals counts as free', () => {
    expect(rank({ openrouter: [orModel('a/loud:FREE')], aa: [aaRow('loud', 'Loud', 5)] })).toEqual(['a/loud:FREE'])
  })

  test('a photo job (vision) only gets models that take images', () => {
    const list = [orModel('a/text-only:free'), orModel('a/sees:free', { architecture: { input_modalities: ['text', 'image'] } }), orModel('a/no-arch:free', { architecture: undefined })]
    const aa = [aaRow('text-only', 'T', 90), aaRow('sees', 'S', 10), aaRow('no-arch', 'N', 80)]
    expect(rank({ kind: 'vision', openrouter: list, aa })).toEqual(['a/sees:free'])
    expect(rank({ kind: 'text', openrouter: list, aa })).toEqual(['a/text-only:free', 'a/no-arch:free', 'a/sees:free'])
  })
})

describe('rankModels: the order', () => {
  const rank = (over: Partial<Parameters<typeof rankModels>[0]> = {}) => rankModels({ kind: 'text', openrouter: OR, aa: AA, pinned: [], ...over })

  test('with AA data a model with no AA score is dropped', () => {
    const list = [orModel('a/rated:free'), orModel('a/unrated:free'), orModel('a/blank:free')]
    const out = rank({ openrouter: list, aa: [aaRow('rated', 'Rated', 10), aaRow('blank', 'Blank', null)] })
    expect(out).toEqual(['a/rated:free'])
  })

  test('sorted by score, high to low, and cut at 4 by default', () => {
    const out = rank()
    expect(out).toEqual([ULTRA, ERNIE, SUPER, GEMMA31])
    expect(rank({ top: 2 })).toEqual([ULTRA, ERNIE])
    expect(rank({ top: 20 })).toEqual([ULTRA, ERNIE, SUPER, GEMMA31, LING, GEMMA26, 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', 'thinkingmachines/inkling-2-small:free', 'nvidia/nemotron-3.5-lightning:free'])
  })

  test('a tie goes to the larger context, then to the id', () => {
    const list = [
      orModel('b/small:free', { context_length: 200_000 }),
      orModel('a/small:free', { context_length: 200_000 }),
      orModel('c/big:free', { context_length: 900_000 }),
    ]
    const aa = [aaRow('small', 'Small', 30), aaRow('big', 'Big', 30)]
    expect(rank({ openrouter: list, aa })).toEqual(['c/big:free', 'a/small:free', 'b/small:free'])
  })

  test("today's list for a text job, with the invented AA scores", () => {
    expect(rank({ top: 4 })).toEqual(['nvidia/nemotron-3-ultra-550b-a55b:free', 'baidu/ernie-5.5-flash-preview:free', 'nvidia/nemotron-3.5-super-vl:free', 'google/gemma-4-31b-it:free'])
  })

  test("today's list for a photo job, with the invented AA scores: every model takes images", () => {
    const out = rank({ kind: 'vision' })
    expect(out).toEqual([SUPER, GEMMA31, LING, GEMMA26])
    for (const id of out) expect(hasImage(id), id).toBe(true)
  })

  test('a photo job never gets a text-only model, whatever the scores (every free text-only model of the fixture is rated high here)', () => {
    const textOnly = OR.filter((m) => m.id.endsWith(':free') && !m.architecture?.input_modalities?.includes('image'))
    expect(textOnly.length).toBeGreaterThan(3)
    const aa = [...OR.filter((m) => m.id.endsWith(':free')).map((m, i) => aaRow(m.id.split('/')[1]!.replace(':free', ''), m.name ?? m.id, textOnly.includes(m) ? 90 - i : 10 + i))]
    for (const top of [1, 4, 20]) for (const id of rank({ kind: 'vision', aa, top })) expect(hasImage(id), id).toBe(true)
  })

  test('with no AA data the newest models come first (by created, then context, then id)', () => {
    expect(rank({ aa: null })).toEqual([LING, ERNIE, 'thinkingmachines/inkling-2-small:free', 'liquid/lfm-3-1.7b:free'])
    expect(rank({ aa: null, kind: 'vision' })).toEqual([LING, 'thinkingmachines/inkling-2-small:free', 'particle-ai/particle-1:free', SUPER])
    const list = [orModel('b/x:free', { created: 5, context_length: 200_000 }), orModel('a/x:free', { created: 5, context_length: 200_000 }), orModel('c/x:free', { created: 5, context_length: 300_000 }), orModel('d/old:free', { created: 1 }), orModel('e/missing:free', { created: undefined })]
    expect(rank({ openrouter: list, aa: null })).toEqual(['c/x:free', 'a/x:free', 'b/x:free', 'd/old:free'])
  })
})

describe('rankModels: the pinned ids (the env list)', () => {
  const rank = (over: Partial<Parameters<typeof rankModels>[0]> = {}) => rankModels({ kind: 'text', openrouter: OR, aa: AA, pinned: [], ...over })

  test('pinned free ids come after the ranked ones, in env order, with no repeats', () => {
    const out = rank({ pinned: [GEMMA26, SUPER, 'liquid/lfm-3-1.7b:free', GEMMA26], top: 2 })
    expect(out).toEqual([ULTRA, ERNIE, GEMMA26, SUPER, 'liquid/lfm-3-1.7b:free'])
  })

  test('a pinned id that the ranking already holds is not added again', () => {
    expect(rank({ pinned: [SUPER, ULTRA, GEMMA31] })).toEqual([ULTRA, ERNIE, SUPER, GEMMA31])
  })

  test('a pinned free id that OpenRouter no longer lists (removed) is skipped when the list was read', () => {
    expect(rank({ pinned: ['gone/old-model:free', GEMMA26], top: 1 })).toEqual([ULTRA, GEMMA26])
  })

  test('a pinned paid id goes first, before the ranked ones, and stays even when it is not in the list', () => {
    expect(rank({ pinned: [PAID, GEMMA26], top: 2 })).toEqual([PAID, ULTRA, ERNIE, GEMMA26])
    expect(rank({ pinned: ['unlisted/paid-only', SUPER], top: 1 })).toEqual(['unlisted/paid-only', ULTRA, SUPER])
  })

  test('several pinned paid ids keep their env order, all before the ranked ones', () => {
    expect(rank({ pinned: ['p/two', 'p/one', GEMMA26], top: 1 })).toEqual(['p/two', 'p/one', ULTRA, GEMMA26])
  })

  test('the pinned list is the env list: blanks and repeats are skipped', () => {
    expect(rank({ pinned: ['', ` ${PAID} `, PAID], top: 1 })).toEqual([PAID, ULTRA])
  })

  test('with no OpenRouter list (the read failed) the result is the pinned list as it is', () => {
    const pinned = [PAID, SUPER, 'gone/old-model:free', ULTRA]
    expect(rank({ openrouter: null, pinned })).toEqual(pinned)
    expect(rank({ openrouter: null, aa: null, pinned })).toEqual(pinned)
  })

  test('if everything is filtered out the pinned list comes back, never an empty list', () => {
    expect(rank({ aa: [aaRow('nothing-matches', 'Nothing', 50)], pinned: [SUPER, GEMMA31] })).toEqual([SUPER, GEMMA31])
    expect(rank({ openrouter: [], pinned: [SUPER] })).toEqual([SUPER])
    // Only the pinned paid id survives here (the pinned free id is not in the list), and one id is not an empty list.
    expect(rank({ openrouter: [orModel('a/short:free', { context_length: 10 })], aa: null, pinned: [PAID, SUPER] })).toEqual([PAID])
    // Nothing at all, nothing pinned: there is nothing to return.
    expect(rank({ openrouter: [], pinned: [] })).toEqual([])
  })

  test('the pinned list that comes back is a copy: changing it does not change the input', () => {
    const pinned = [SUPER]
    const out = rank({ openrouter: null, pinned })
    out.push('x')
    expect(pinned).toEqual([SUPER])
  })

  test('a photo job drops a pinned model that OpenRouter lists as text-only, and keeps one that takes images', () => {
    const out = rank({ kind: 'vision', pinned: [PAID, SUPER, ULTRA, GEMMA31, GEMMA26], top: 1 })
    expect(out).toEqual([PAID, SUPER, GEMMA31, GEMMA26])
    for (const id of out.filter((i) => i !== PAID)) expect(hasImage(id), id).toBe(true)
    // For a text job the same pinned text-only model stays.
    expect(rank({ kind: 'text', pinned: [ULTRA], top: 1 })).toEqual([ULTRA])
    expect(rank({ kind: 'text', pinned: ['liquid/lfm-3-1.7b:free'], top: 1 })).toEqual([ULTRA, 'liquid/lfm-3-1.7b:free'])
  })

  test('a photo job drops a pinned paid id that OpenRouter lists as text-only, and keeps one it does not know', () => {
    expect(rank({ kind: 'vision', pinned: ['nvidia/nemotron-3-ultra-550b-a55b', 'unlisted/paid-vl'], top: 1 })).toEqual(['unlisted/paid-vl', SUPER])
  })
})

describe('loadCatalog', () => {
  const orBody = () => ({ data: OR })
  const aaBody = () => AA_RAW
  const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

  type Handlers = { openrouter?: () => Response | Promise<Response>; aa?: () => Response | Promise<Response> }
  function fakeFetch(h: Handlers = {}) {
    const calls: { url: string; headers: Record<string, string>; signal?: AbortSignal | null }[] = []
    const fn = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input)
      calls.push({ url, headers: Object.fromEntries(new Headers(init?.headers).entries()), signal: init?.signal })
      if (url === OPENROUTER_MODELS_URL) return h.openrouter ? h.openrouter() : respond(orBody())
      if (url === AA_FREE_MODELS_URL) return h.aa ? h.aa() : respond(aaBody())
      throw new Error(`unexpected url ${url}`)
    })
    return { fn, calls }
  }

  let clock = 1_000_000
  const now = () => clock
  const env = { AA_API_KEY: 'aa-test-key' }

  beforeEach(() => {
    resetCatalogMemo()
    clock = 1_000_000
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  test('the two addresses are the public OpenRouter list and the AA free list', () => {
    expect(OPENROUTER_MODELS_URL).toBe('https://openrouter.ai/api/v1/models')
    expect(AA_FREE_MODELS_URL).toBe('https://artificialanalysis.ai/api/v2/language/models/free')
  })

  test('reads both lists; the AA call carries the key in x-api-key and the OpenRouter call carries no key', async () => {
    const { fn, calls } = fakeFetch()
    const catalog = await loadCatalog(env, fn as never, now)
    expect(catalog.openrouter?.length).toBe(OR.length)
    expect(catalog.aa?.length).toBe(AA.length)
    expect(catalog.aa?.find((m) => m.slug === 'gemma-4-31b')).toEqual({ slug: 'gemma-4-31b', name: 'Gemma 4 31B (Reasoning)', score: 38.2 })
    expect(calls.find((c) => c.url === AA_FREE_MODELS_URL)?.headers['x-api-key']).toBe('aa-test-key')
    expect(calls.find((c) => c.url === OPENROUTER_MODELS_URL)?.headers['x-api-key']).toBeUndefined()
    expect(calls.find((c) => c.url === OPENROUTER_MODELS_URL)?.headers.authorization).toBeUndefined()
  })

  test('no AA key: AA is null and AA is never called', async () => {
    const { fn, calls } = fakeFetch()
    for (const key of [undefined, '', '   ']) {
      resetCatalogMemo()
      const catalog = await loadCatalog({ AA_API_KEY: key }, fn as never, now)
      expect(catalog.aa).toBeNull()
      expect(catalog.openrouter).not.toBeNull()
    }
    expect(calls.some((c) => c.url === AA_FREE_MODELS_URL)).toBe(false)
  })

  test('a second call within the hour makes no fetch at all', async () => {
    const { fn } = fakeFetch()
    const first = await loadCatalog(env, fn as never, now)
    expect(fn).toHaveBeenCalledTimes(2)
    clock += CATALOG_TTL_MS - 1
    const second = await loadCatalog(env, fn as never, now)
    expect(fn).toHaveBeenCalledTimes(2)
    expect(second).toEqual(first)
  })

  test('after the hour it reads again', async () => {
    const { fn } = fakeFetch()
    await loadCatalog(env, fn as never, now)
    clock += CATALOG_TTL_MS
    await loadCatalog(env, fn as never, now)
    expect(fn).toHaveBeenCalledTimes(4)
  })

  test('the memo is shared: two catalogs in one isolate read once', async () => {
    const a = fakeFetch()
    const b = fakeFetch()
    await loadCatalog(env, a.fn as never, now)
    await loadCatalog(env, b.fn as never, now)
    expect(b.fn).not.toHaveBeenCalled()
  })

  test('a failed read is null for that list only, and is read again after 5 minutes, not before', async () => {
    let failing = true
    const { fn } = fakeFetch({ openrouter: () => (failing ? respond({ error: 'down' }, 503) : respond(orBody())) })
    const first = await loadCatalog(env, fn as never, now)
    expect(first.openrouter).toBeNull()
    expect(first.aa).not.toBeNull()
    expect(fn).toHaveBeenCalledTimes(2)
    failing = false
    clock += CATALOG_FAILURE_TTL_MS - 1
    expect((await loadCatalog(env, fn as never, now)).openrouter).toBeNull()
    expect(fn).toHaveBeenCalledTimes(2)
    clock += 1
    const later = await loadCatalog(env, fn as never, now)
    expect(later.openrouter?.length).toBe(OR.length)
    // The AA list was good and is kept for its hour: only OpenRouter was read again.
    expect(fn).toHaveBeenCalledTimes(3)
  })

  test('the failure memo is 5 minutes and the success memo is 1 hour', () => {
    expect(CATALOG_FAILURE_TTL_MS).toBe(5 * 60_000)
    expect(CATALOG_TTL_MS).toBe(60 * 60_000)
  })

  test('it never throws: a fetch that throws, a bad status, bad JSON and the wrong shape are all null', async () => {
    const cases: Handlers[] = [
      { openrouter: () => Promise.reject(new Error('network down')), aa: () => Promise.reject(new Error('network down')) },
      { openrouter: () => respond({}, 500), aa: () => respond({}, 401) },
      { openrouter: () => new Response('<html>', { status: 200 }), aa: () => new Response('not json', { status: 200 }) },
      { openrouter: () => respond({ data: 'nope' }), aa: () => respond({ data: {} }) },
      { openrouter: () => respond({ data: [] }), aa: () => respond({ data: [] }) },
      { openrouter: () => respond(null), aa: () => respond(null) },
    ]
    for (const h of cases) {
      resetCatalogMemo()
      const { fn } = fakeFetch(h)
      expect(await loadCatalog(env, fn as never, now)).toEqual({ openrouter: null, aa: null })
    }
  })

  test('a fetch function that throws before it returns a promise is also null', async () => {
    const fn = () => {
      throw new Error('sync throw')
    }
    expect(await loadCatalog(env, fn as never, now)).toEqual({ openrouter: null, aa: null })
  })

  test('each read has a 5 second limit, and the request is cancelled when it passes', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const never = (signalOf: (s: AbortSignal) => void) => (_url: unknown, init?: RequestInit) =>
      new Promise<Response>((_, reject) => {
        signalOf(init!.signal!)
        init!.signal!.addEventListener('abort', () => reject(new Error('cancelled')))
      })
    const signals: AbortSignal[] = []
    const fn = vi.fn(never((s) => signals.push(s)))
    const call = loadCatalog(env, fn as never, now)
    await vi.advanceTimersByTimeAsync(4_999)
    expect(signals.map((s) => s.aborted)).toEqual([false, false])
    await vi.advanceTimersByTimeAsync(1)
    expect(await call).toEqual({ openrouter: null, aa: null })
    expect(signals.map((s) => s.aborted)).toEqual([true, true])
  })

  test('a read that ignores the cancel still ends at 5 seconds', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const fn = vi.fn(() => new Promise<Response>(() => {}))
    const call = loadCatalog(env, fn as never, now)
    await vi.advanceTimersByTimeAsync(5_000)
    expect(await call).toEqual({ openrouter: null, aa: null })
  })

  test('a read that answers in time leaves no timer behind', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { fn } = fakeFetch()
    await loadCatalog(env, fn as never, now)
    expect(vi.getTimerCount()).toBe(0)
  })

  test('the OpenRouter list keeps what it needs and drops entries with no id', async () => {
    const { fn } = fakeFetch({ openrouter: () => respond({ data: [OR[0], { name: 'no id' }, null, 7, { id: 5 }, OR[1]] }) })
    const catalog = await loadCatalog(env, fn as never, now)
    expect(catalog.openrouter?.map((m) => m.id)).toEqual([OR[0]!.id, OR[1]!.id])
    expect(catalog.openrouter?.[0]).toMatchObject({ id: OR[0]!.id, context_length: OR[0]!.context_length })
  })

  test('the AA score is read from evaluations, or from the other places it may sit, and a missing score is null', async () => {
    const body = {
      data: [
        { slug: 'a', name: 'A', evaluations: { artificial_analysis_intelligence_index: 11.5 } },
        { slug: 'b', name: 'B', evaluations: { intelligence_index: 12 } },
        { slug: 'c', name: 'C', artificial_analysis_intelligence_index: 13 },
        { slug: 'd', name: 'D', intelligence_index: 14 },
        { slug: 'e', name: 'E', evaluations: {} },
        { slug: 'f', name: 'F' },
        { slug: 'g', name: 'G', evaluations: { artificial_analysis_intelligence_index: 'high' } },
        { slug: 'h', name: 'H', evaluations: { artificial_analysis_intelligence_index: null } },
        { name: 'no slug', evaluations: { artificial_analysis_intelligence_index: 5 } },
        { slug: 'i' },
        'junk',
        null,
      ],
    }
    const { fn } = fakeFetch({ aa: () => respond(body) })
    const catalog = await loadCatalog(env, fn as never, now)
    expect(catalog.aa?.map((m) => [m.slug, m.score])).toEqual([
      ['a', 11.5],
      ['b', 12],
      ['c', 13],
      ['d', 14],
      ['e', null],
      ['f', null],
      ['g', null],
      ['h', null],
      ['no slug', 5],
      ['i', null],
    ])
  })

  test('an AA answer that is a bare list of rows is read too', async () => {
    const { fn } = fakeFetch({ aa: () => respond([{ slug: 'a', name: 'A', evaluations: { artificial_analysis_intelligence_index: 9 } }]) })
    expect((await loadCatalog(env, fn as never, now)).aa).toEqual([{ slug: 'a', name: 'A', score: 9 }])
  })

  test('a failed read writes one line to the log, and never the key', async () => {
    const { fn } = fakeFetch({ aa: () => respond({}, 401) })
    await loadCatalog(env, fn as never, now)
    const lines = vi.mocked(console.error).mock.calls.map((c) => c.join(' '))
    expect(lines.length).toBeGreaterThan(0)
    for (const line of lines) expect(line).not.toContain('aa-test-key')
  })

  test('a different AA key reads AA again, so a changed key is not served from the memo of the old one', async () => {
    const { fn } = fakeFetch()
    await loadCatalog({ AA_API_KEY: 'one' }, fn as never, now)
    await loadCatalog({ AA_API_KEY: 'two' }, fn as never, now)
    expect(fn).toHaveBeenCalledTimes(3)
  })
})
