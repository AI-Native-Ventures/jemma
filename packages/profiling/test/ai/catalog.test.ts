import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  AA_FREE_MODELS_URL,
  AA_MAX_PAGES,
  CATALOG_FAILURE_TTL_MS,
  CATALOG_TTL_MS,
  OPENROUTER_MODELS_URL,
  aaKeys,
  aaPageUrl,
  aaScore,
  loadCatalog,
  normaliseAaName,
  normaliseOpenRouterId,
  openRouterKeys,
  rankModels,
  resetCatalogMemo,
  stripVariantWords,
  type AaModel,
  type OpenRouterModel,
} from '../../src/ai'

// P121: the hosted app picks its free models from OpenRouter's public list and Artificial Analysis's ranking. These tests use committed
// fixtures (a trimmed copy of OpenRouter's public list of 16 November 2026, and an Artificial Analysis answer in two pages with real model
// names and INVENTED scores: no real Artificial Analysis score is in this repository) and a fake `fetch`. No database, no network, no model.

const fixtureDir = join(import.meta.dirname, '../fixtures')
const readFixture = (name: string) => JSON.parse(readFileSync(join(fixtureDir, name), 'utf8')) as { data: unknown[] }
const OR = readFixture('openrouter-models-2026-11-16.json').data as OpenRouterModel[]

type AaRow = { slug: string; name: string; evaluations?: { artificial_analysis_intelligence_index?: number | null } }
const AA_PAGES = [readFixture('aa-free-models.synthetic.page1.json'), readFixture('aa-free-models.synthetic.page2.json')]
/** The parsed form of the invented answer, the way `loadCatalog` hands it over (both pages, in order). */
const AA: AaModel[] = AA_PAGES.flatMap((p) => (p.data as AaRow[]).map((r) => ({ slug: r.slug, name: r.name, score: r.evaluations?.artificial_analysis_intelligence_index ?? null })))

const realSetTimeout = globalThis.setTimeout
/** Waits in real time (the model clock may be faked) until `done` holds. */
const waitFor = async (done: () => boolean) => {
  for (let i = 0; i < 400 && !done(); i++) await new Promise<void>((r) => realSetTimeout(r, 5))
  expect(done()).toBe(true)
}

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
const LIGHTNING = 'nvidia/nemotron-3.5-lightning:free'
const NANO_OMNI = 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free'
const GEMMA31 = 'google/gemma-4-31b-it:free'
const GEMMA26 = 'google/gemma-4-26b-a4b-it:free'
const INKLING = 'thinkingmachines/inkling-2-small:free'
const NORTH = 'cohere/north-mini-code:free'
const ERNIE = 'baidu/ernie-5.5-flash-preview:free'
const LING = 'inclusionai/ling-3.2-flash:free'
const LFM = 'liquid/lfm-3-1.7b:free'
const DOTS = 'dots-studio/dots-3-note-preview:free'
const PARTICLE = 'particle-ai/particle-1:free'
const FLINT = 'recursive/flint-v1.0:free'

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
    expect(normaliseAaName('Claude Opus 5.5 (Max, Default Fallback)')).toBe('claude-opus-5-5')
    expect(normaliseAaName('Gemma 4 26B A4B (Reasoning)')).toBe('gemma-4-26b-a4b')
    expect(normaliseAaName('Foo__Bar  (high) ')).toBe('foo-bar')
    expect(normaliseAaName('claude-opus-5-5')).toBe('claude-opus-5-5')
    expect(normaliseAaName('Gemma 4 31B (Non-reasoning)')).toBe('gemma-4-31b')
    expect(normaliseAaName('glm-4.5')).toBe('glm-4-5')
  })

  test('repeats of the separator collapse and the ends are trimmed', () => {
    expect(normaliseAaName(' -- A  .. B -- ')).toBe('a-b')
  })

  test('only it, instruct, chat, preview, free and reasoning are taken off the end, again and again', () => {
    expect(stripVariantWords('gemma-4-31b-it')).toBe('gemma-4-31b')
    expect(stripVariantWords('gemma-4-26b-a4b-it')).toBe('gemma-4-26b-a4b')
    expect(stripVariantWords('thing-instruct-chat')).toBe('thing')
    expect(stripVariantWords('thing-preview-free')).toBe('thing')
    expect(stripVariantWords('nemotron-3-nano-omni-30b-a3b-reasoning')).toBe('nemotron-3-nano-omni-30b-a3b')
    expect(stripVariantWords('ernie-5-5-flash-preview')).toBe('ernie-5-5-flash')
  })

  test('size words and vl stay, a word in the middle stays, and a name is never emptied', () => {
    for (const name of ['nemotron-3-5-super-vl', 'gemma-4-31b', 'gemma-4-26b-a4b', 'thing-e4b', 'thing-7b', 'it-thing', 'thing-chat-pro']) expect(stripVariantWords(name), name).toBe(name)
    expect(stripVariantWords('chat')).toBe('chat')
    expect(stripVariantWords('it')).toBe('it')
    expect(stripVariantWords('')).toBe('')
  })

  test('an OpenRouter id goes by its base name and by creator plus base name', () => {
    expect(openRouterKeys('nvidia/nemotron-3-ultra-550b-a55b:free')).toEqual(['nemotron-3-ultra-550b-a55b', 'nvidia-nemotron-3-ultra-550b-a55b'])
    expect(openRouterKeys(GEMMA31)).toEqual(['gemma-4-31b', 'google-gemma-4-31b'])
    expect(openRouterKeys('Liquid/LFM-3-1.7B:free')).toEqual(['lfm-3-1-7b', 'liquid-lfm-3-1-7b'])
    expect(openRouterKeys('no-creator-model')).toEqual(['no-creator-model'])
    expect(openRouterKeys('')).toEqual([])
  })

  test('an AA row goes by its slug and by its name, stripped the same way', () => {
    expect(aaKeys({ slug: 'nvidia-nemotron-3-ultra-550b-a55b', name: 'Nemotron 3 Ultra 550B A55B (Reasoning)' }).sort()).toEqual(['nemotron-3-ultra-550b-a55b', 'nvidia-nemotron-3-ultra-550b-a55b'])
    expect(aaKeys({ slug: 'gemma-4-31b', name: 'Gemma 4 31B (Reasoning)' })).toEqual(['gemma-4-31b'])
    expect(aaKeys({ slug: 'mistral-large-4-preview', name: 'Mistral Large 4 Preview' })).toEqual(['mistral-large-4'])
    expect(aaKeys({ slug: '', name: '' })).toEqual([])
  })
})

describe('aaScore: which AA row is this OpenRouter model', () => {
  const score = (id: string, rows: AaModel[]) => aaScore({ id }, rows)

  test('equal normalised names match, by slug or by name', () => {
    expect(score('google/gemma-4-31b:free', [aaRow('gemma-4-31b', 'x', 38)])).toBe(38)
    expect(score('google/gemma-4-31b:free', [aaRow('other-slug', 'Gemma 4 31B (max)', 39)])).toBe(39)
  })

  test.each(['it', 'instruct', 'chat', 'preview', 'free', 'reasoning'])('the trailing word %s is ignored on either side', (word) => {
    expect(score(`acme/thing-1-${word}:free`, [aaRow('thing-1', 'Thing 1', 12)])).toBe(12)
    expect(score('acme/thing-1:free', [aaRow(`thing-1-${word}`, `Thing 1 ${word}`, 13)])).toBe(13)
    expect(score(`acme/thing-1-${word}:free`, [aaRow(`thing-1-${word}`, `x`, 14)])).toBe(14)
  })

  test('several trailing words are all ignored', () => {
    expect(score('acme/thing-1-instruct-chat:free', [aaRow('thing-1', 'Thing 1', 12)])).toBe(12)
    expect(score('acme/thing-1:free', [aaRow('thing-1-it-preview', 'Thing 1', 15)])).toBe(15)
  })

  test.each(['vl', '31b', '7b', 'a4b', 'a55b', 'e4b', 'pro', 'mini'])('the word %s is NOT ignored: it names another model', (word) => {
    expect(score(`acme/thing-1-${word}:free`, [aaRow('thing-1', 'Thing 1', 12)])).toBeNull()
    expect(score('acme/thing-1:free', [aaRow(`thing-1-${word}`, `Thing 1 ${word}`, 13)])).toBeNull()
  })

  test('the size of a model separates it from its sibling: gemma-4-26b-a4b is never gemma-4-31b', () => {
    const rows = [aaRow('gemma-4-31b', 'Gemma 4 31B (Reasoning)', 30), aaRow('gemma-4-12b', 'Gemma 4 12B (Reasoning)', 25)]
    expect(score(GEMMA26, rows)).toBeNull()
    expect(score(GEMMA26, [...rows, aaRow('gemma-4-26b-a4b', 'Gemma 4 26B A4B (Reasoning)', 33)])).toBe(33)
    expect(score(GEMMA31, rows)).toBe(30)
  })

  test('a vl model is not its text-only sibling', () => {
    expect(score(SUPER, [aaRow('nemotron-3-5-super', 'Nemotron 3.5 Super', 50)])).toBeNull()
    expect(score(SUPER, [aaRow('nemotron-3-5-super-vl', 'Nemotron 3.5 Super VL', 41)])).toBe(41)
  })

  test('the creator may be part of the AA slug: both the base name and creator plus base are compared with both the slug and the name', () => {
    expect(score(ULTRA, [aaRow('nvidia-nemotron-3-ultra-550b-a55b', 'Something Else', 38)])).toBe(38)
    expect(score(ULTRA, [aaRow('something-else', 'NVIDIA Nemotron 3 Ultra 550B A55B', 39)])).toBe(39)
    expect(score(ULTRA, [aaRow('nemotron-3-ultra-550b-a55b', 'Other', 40)])).toBe(40)
    expect(score('acme/thing-1:free', [aaRow('acme-thing-1', 'x', 8)])).toBe(8)
    expect(score('other/thing-1:free', [aaRow('acme-thing-1', 'x', 8)])).toBeNull()
  })

  test('a name that only starts the same way does not match', () => {
    expect(score(GEMMA31, [aaRow('gemma-4-3', 'Gemma 4 3', 5), aaRow('gemma-4', 'Gemma 4', 6)])).toBeNull()
    expect(score('acme/thing-10:free', [aaRow('thing-1', 'Thing 1', 7)])).toBeNull()
  })

  test('several rows match: the highest score wins', () => {
    const rows = [aaRow('gemma-4-31b', 'Gemma 4 31B (Reasoning)', 38.2), aaRow('gemma-4-31b-nr', 'Gemma 4 31B (Non-reasoning)', 30.1)]
    expect(score(GEMMA31, rows)).toBe(38.2)
    expect(score(GEMMA31, [...rows].reverse())).toBe(38.2)
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

  test("today's real OpenRouter ids against the real AA slugs and names (invented scores)", () => {
    expect(score(INKLING, AA)).toBe(44)
    expect(score(SUPER, AA)).toBe(41)
    expect(score(ULTRA, AA)).toBe(38)
    expect(score(LIGHTNING, AA)).toBe(35)
    expect(score(NORTH, AA)).toBe(32)
    // Reasoning and non-reasoning rows of Gemma 4 31B (and the AA coding index of 99 is not the score): the highest intelligence score counts.
    expect(score(GEMMA31, AA)).toBe(30)
  })

  test('these match a row that has no score, so they are unrated and never a look-alike with a score', () => {
    expect(AA.find((r) => r.slug === 'gemma-4-26b-a4b')?.score).toBeNull()
    expect(score(GEMMA26, AA)).toBeNull()
    expect(AA.find((r) => r.slug === 'nemotron-3-nano-omni-30b-a3b')?.score).toBeNull()
    expect(score(NANO_OMNI, AA)).toBeNull()
  })

  test('these have no AA row at all, even though look-alikes with a score exist', () => {
    for (const id of [ERNIE, DOTS, LING, LFM, PARTICLE, FLINT]) expect(score(id, AA), id).toBeNull()
    // The look-alikes the old matching rule took for them: ERNIE 5.0 Thinking Preview (29), Ling 3.1 Flash (27).
    expect(AA.find((r) => r.slug === 'ernie-5-0-thinking-preview')?.score).toBe(29)
    expect(AA.find((r) => r.slug === 'ling-3-1-flash')?.score).toBe(27)
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
    expect(rank({ openrouter: list, aa, minContext: 200_000 })).toEqual([])
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
    expect(rank()).toEqual([INKLING, SUPER, ULTRA, LIGHTNING])
    expect(rank({ top: 2 })).toEqual([INKLING, SUPER])
    expect(rank({ top: 20 })).toEqual([INKLING, SUPER, ULTRA, LIGHTNING, NORTH, GEMMA31])
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

  test("today's list for a text job, with the invented scores: the top 4 and gemma-4-31b is only added as a pinned id", () => {
    expect(rank({ top: 4 })).toEqual([INKLING, SUPER, ULTRA, LIGHTNING])
    expect(rank({ top: 4, pinned: [PAID, SUPER, ULTRA, GEMMA31] })).toEqual([PAID, INKLING, SUPER, ULTRA, LIGHTNING, GEMMA31])
  })

  test("today's list for a photo job, with the invented scores: only 3 rated models take images", () => {
    const out = rank({ kind: 'vision' })
    expect(out).toEqual([INKLING, SUPER, GEMMA31])
    for (const id of out) expect(hasImage(id), id).toBe(true)
  })

  test('a photo job never gets a text-only model, whatever the scores (every free text-only model of the fixture is rated high here)', () => {
    const textOnly = OR.filter((m) => m.id.endsWith(':free') && !m.architecture?.input_modalities?.includes('image'))
    expect(textOnly.length).toBeGreaterThan(3)
    const aa = [...OR.filter((m) => m.id.endsWith(':free')).map((m, i) => aaRow(m.id.split('/')[1]!.replace(':free', ''), m.name ?? m.id, textOnly.includes(m) ? 90 - i : 10 + i))]
    for (const top of [1, 4, 20]) for (const id of rank({ kind: 'vision', aa, top })) expect(hasImage(id), id).toBe(true)
  })

  test('with no AA data the newest models come first (by created, then context, then id)', () => {
    expect(rank({ aa: null })).toEqual([LING, ERNIE, INKLING, LFM])
    expect(rank({ aa: null, kind: 'vision' })).toEqual([LING, INKLING, PARTICLE, SUPER])
    const list = [orModel('b/x:free', { created: 5, context_length: 200_000 }), orModel('a/x:free', { created: 5, context_length: 200_000 }), orModel('c/x:free', { created: 5, context_length: 300_000 }), orModel('d/old:free', { created: 1 }), orModel('e/missing:free', { created: undefined })]
    expect(rank({ openrouter: list, aa: null })).toEqual(['c/x:free', 'a/x:free', 'b/x:free', 'd/old:free'])
  })

  test('an empty AA list counts as no AA data', () => {
    expect(rank({ aa: [] })).toEqual([LING, ERNIE, INKLING, LFM])
  })
})

describe('rankModels: the pinned ids (the env list)', () => {
  const rank = (over: Partial<Parameters<typeof rankModels>[0]> = {}) => rankModels({ kind: 'text', openrouter: OR, aa: AA, pinned: [], ...over })

  test('pinned free ids come after the ranked ones, in env order, with no repeats', () => {
    const out = rank({ pinned: [GEMMA26, SUPER, LFM, GEMMA26], top: 2 })
    expect(out).toEqual([INKLING, SUPER, GEMMA26, LFM])
  })

  test('a pinned id that the ranking already holds is not added again', () => {
    expect(rank({ pinned: [SUPER, ULTRA, GEMMA31] })).toEqual([INKLING, SUPER, ULTRA, LIGHTNING, GEMMA31])
    expect(rank({ pinned: [SUPER, ULTRA] })).toEqual([INKLING, SUPER, ULTRA, LIGHTNING])
  })

  test('a pinned free id that OpenRouter no longer lists (removed) is skipped when the list was read', () => {
    expect(rank({ pinned: ['gone/old-model:free', GEMMA26], top: 1 })).toEqual([INKLING, GEMMA26])
  })

  test('a pinned paid id goes first, before the ranked ones, and stays even when it is not in the list', () => {
    expect(rank({ pinned: [PAID, GEMMA26], top: 2 })).toEqual([PAID, INKLING, SUPER, GEMMA26])
    expect(rank({ pinned: ['unlisted/paid-only', SUPER], top: 1 })).toEqual(['unlisted/paid-only', INKLING, SUPER])
  })

  test('several pinned paid ids keep their env order, all before the ranked ones', () => {
    expect(rank({ pinned: ['p/two', 'p/one', GEMMA26], top: 1 })).toEqual(['p/two', 'p/one', INKLING, GEMMA26])
  })

  test('the pinned list is the env list: blanks and repeats are skipped', () => {
    expect(rank({ pinned: ['', ` ${PAID} `, PAID], top: 1 })).toEqual([PAID, INKLING])
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
    expect(out).toEqual([PAID, INKLING, SUPER, GEMMA31, GEMMA26])
    for (const id of out) expect(hasImage(id), id).toBe(true)
    // For a text job the same pinned text-only model stays.
    expect(rank({ kind: 'text', pinned: [ULTRA], top: 1 })).toEqual([INKLING, ULTRA])
    expect(rank({ kind: 'text', pinned: [LFM], top: 1 })).toEqual([INKLING, LFM])
  })

  test('a photo job drops a pinned paid id that OpenRouter lists as text-only, and keeps one it does not know', () => {
    expect(rank({ kind: 'vision', pinned: ['nvidia/nemotron-3-ultra-550b-a55b', 'unlisted/paid-vl'], top: 1 })).toEqual(['unlisted/paid-vl', INKLING])
  })
})

describe('loadCatalog', () => {
  const orBody = () => ({ data: OR })
  const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  const aaPage = (n: number) => respond(AA_PAGES[n - 1] ?? { data: [] }, AA_PAGES[n - 1] ? 200 : 404)

  type Handlers = { openrouter?: () => Response | Promise<Response>; aa?: (page: number) => Response | Promise<Response> }
  function fakeFetch(h: Handlers = {}) {
    const calls: { url: string; headers: Record<string, string>; signal?: AbortSignal | null }[] = []
    const fn = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input)
      calls.push({ url, headers: Object.fromEntries(new Headers(init?.headers).entries()), signal: init?.signal })
      if (url === OPENROUTER_MODELS_URL) return h.openrouter ? h.openrouter() : respond(orBody())
      const page = /^https:\/\/artificialanalysis\.ai\/api\/v2\/language\/models\/free\?page=(\d+)$/.exec(url)
      if (page) return h.aa ? h.aa(Number(page[1])) : aaPage(Number(page[1]))
      throw new Error(`unexpected url ${url}`)
    })
    return { fn, calls, aaCalls: () => calls.filter((c) => c.url.startsWith(AA_FREE_MODELS_URL)) }
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

  test('the addresses: the public OpenRouter list, and the AA free list page by page', () => {
    expect(OPENROUTER_MODELS_URL).toBe('https://openrouter.ai/api/v1/models')
    expect(AA_FREE_MODELS_URL).toBe('https://artificialanalysis.ai/api/v2/language/models/free')
    expect(aaPageUrl(1)).toBe('https://artificialanalysis.ai/api/v2/language/models/free?page=1')
    expect(aaPageUrl(3)).toBe('https://artificialanalysis.ai/api/v2/language/models/free?page=3')
    expect(AA_MAX_PAGES).toBe(10)
  })

  test('reads both lists; the AA pages are read from 1 while has_more says so, each with the key in x-api-key, and OpenRouter gets no key', async () => {
    const { fn, calls, aaCalls } = fakeFetch()
    const catalog = await loadCatalog(env, fn as never, now)
    expect(catalog.openrouter?.length).toBe(OR.length)
    expect(catalog.aa?.length).toBe(AA.length)
    expect(catalog.aa?.length).toBe(23)
    expect(catalog.aa?.find((m) => m.slug === 'gemma-4-31b')).toEqual({ slug: 'gemma-4-31b', name: 'Gemma 4 31B (Reasoning)', score: 30 })
    expect(catalog.aa?.find((m) => m.slug === 'gemma-4-26b-a4b')?.score).toBeNull()
    expect(aaCalls().map((c) => c.url)).toEqual([aaPageUrl(1), aaPageUrl(2)])
    for (const c of aaCalls()) expect(c.headers['x-api-key']).toBe('aa-test-key')
    expect(calls.find((c) => c.url === OPENROUTER_MODELS_URL)?.headers['x-api-key']).toBeUndefined()
    expect(calls.find((c) => c.url === OPENROUTER_MODELS_URL)?.headers.authorization).toBeUndefined()
  })

  test('an answer with no pagination block (or has_more false) is the only page: one request', async () => {
    for (const body of [{ data: [{ slug: 'a', name: 'A' }] }, { pagination: { has_more: false }, data: [{ slug: 'a', name: 'A' }] }, [{ slug: 'a', name: 'A' }]]) {
      resetCatalogMemo()
      const { fn, aaCalls } = fakeFetch({ aa: () => respond(body) })
      expect((await loadCatalog(env, fn as never, now)).aa).toEqual([{ slug: 'a', name: 'A', score: null }])
      expect(aaCalls()).toHaveLength(1)
    }
  })

  test('at most 10 pages are read, even if has_more never turns false', async () => {
    const { fn, aaCalls } = fakeFetch({ aa: (n) => respond({ pagination: { page: n, has_more: true }, data: [{ slug: `m-${n}`, name: `M ${n}`, evaluations: { artificial_analysis_intelligence_index: n } }] }) })
    const catalog = await loadCatalog(env, fn as never, now)
    expect(aaCalls()).toHaveLength(10)
    expect(aaCalls().map((c) => c.url)).toEqual(Array.from({ length: 10 }, (_, i) => aaPageUrl(i + 1)))
    expect(catalog.aa).toHaveLength(10)
    expect(catalog.aa?.at(-1)).toEqual({ slug: 'm-10', name: 'M 10', score: 10 })
  })

  test('if a page fails the whole AA list is unavailable, and it is asked for again after 5 minutes', async () => {
    let failing = true
    const { fn, aaCalls } = fakeFetch({ aa: (n) => (n === 2 && failing ? respond({ error: 'down' }, 503) : aaPage(n)) })
    const first = await loadCatalog(env, fn as never, now)
    expect(first.aa).toBeNull()
    expect(first.openrouter).not.toBeNull()
    expect(aaCalls()).toHaveLength(2)
    failing = false
    clock += CATALOG_FAILURE_TTL_MS - 1
    expect((await loadCatalog(env, fn as never, now)).aa).toBeNull()
    expect(aaCalls()).toHaveLength(2)
    clock += 1
    expect((await loadCatalog(env, fn as never, now)).aa).toHaveLength(23)
    expect(aaCalls()).toHaveLength(4)
  })

  test('a page that is not a list of models makes the AA list unavailable', async () => {
    const { fn } = fakeFetch({ aa: (n) => (n === 1 ? aaPage(1) : respond({ data: 'nope' })) })
    expect((await loadCatalog(env, fn as never, now)).aa).toBeNull()
  })

  test('no AA key: AA is null and AA is never called', async () => {
    const { fn, calls } = fakeFetch()
    for (const key of [undefined, '', '   ']) {
      resetCatalogMemo()
      const catalog = await loadCatalog({ AA_API_KEY: key }, fn as never, now)
      expect(catalog.aa).toBeNull()
      expect(catalog.openrouter).not.toBeNull()
    }
    expect(calls.some((c) => c.url.startsWith(AA_FREE_MODELS_URL))).toBe(false)
  })

  test('a second call within the hour makes no fetch at all', async () => {
    const { fn } = fakeFetch()
    const first = await loadCatalog(env, fn as never, now)
    expect(fn).toHaveBeenCalledTimes(3)
    clock += CATALOG_TTL_MS - 1
    const second = await loadCatalog(env, fn as never, now)
    expect(fn).toHaveBeenCalledTimes(3)
    expect(second).toEqual(first)
  })

  test('after the hour it reads again', async () => {
    const { fn } = fakeFetch()
    await loadCatalog(env, fn as never, now)
    clock += CATALOG_TTL_MS
    await loadCatalog(env, fn as never, now)
    expect(fn).toHaveBeenCalledTimes(6)
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
    expect(fn).toHaveBeenCalledTimes(3)
    failing = false
    clock += CATALOG_FAILURE_TTL_MS - 1
    expect((await loadCatalog(env, fn as never, now)).openrouter).toBeNull()
    expect(fn).toHaveBeenCalledTimes(3)
    clock += 1
    const later = await loadCatalog(env, fn as never, now)
    expect(later.openrouter?.length).toBe(OR.length)
    // The AA list was good and is kept for its hour: only OpenRouter was read again.
    expect(fn).toHaveBeenCalledTimes(4)
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

  test('the limit is for each page: two pages of 4 seconds each are fine, a second page that hangs ends the AA list at 5 seconds', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const slow = (n: number) => new Promise<Response>((resolve) => setTimeout(() => resolve(aaPage(n)), 4_000))
    const slowFetch = fakeFetch({ aa: slow })
    const call = loadCatalog(env, slowFetch.fn as never, now)
    await vi.advanceTimersByTimeAsync(4_000)
    // Page 2 is asked for when page 1 has been read (real time, for the response body), and then has its own 5 seconds.
    await waitFor(() => slowFetch.aaCalls().length === 2)
    await vi.advanceTimersByTimeAsync(4_000)
    expect((await call).aa).toHaveLength(23)

    resetCatalogMemo()
    const hangs = fakeFetch({ aa: (n) => (n === 1 ? aaPage(1) : new Promise<Response>(() => {})) })
    const second = loadCatalog(env, hangs.fn as never, now)
    await waitFor(() => hangs.aaCalls().length === 2)
    await vi.advanceTimersByTimeAsync(4_999)
    expect(vi.getTimerCount()).toBeGreaterThan(0)
    await vi.advanceTimersByTimeAsync(1)
    const out = await second
    expect(out.aa).toBeNull()
    expect(out.openrouter).not.toBeNull()
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

  test('the AA score is read from evaluations (not the other indexes), or from the other places it may sit, and a missing score is null', async () => {
    const body = {
      data: [
        { slug: 'a', name: 'A', evaluations: { artificial_analysis_intelligence_index: 11.5, artificial_analysis_coding_index: 77 } },
        { slug: 'b', name: 'B', evaluations: { intelligence_index: 12 } },
        { slug: 'c', name: 'C', artificial_analysis_intelligence_index: 13 },
        { slug: 'd', name: 'D', intelligence_index: 14 },
        { slug: 'e', name: 'E', evaluations: {} },
        { slug: 'f', name: 'F' },
        { slug: 'g', name: 'G', evaluations: { artificial_analysis_intelligence_index: 'high' } },
        { slug: 'h', name: 'H', evaluations: { artificial_analysis_intelligence_index: null, artificial_analysis_coding_index: 55 } },
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
    // OpenRouter once, then the two AA pages for each key.
    expect(fn).toHaveBeenCalledTimes(5)
  })
})
