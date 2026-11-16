import type { ModelKind } from './models'

/**
 * P121: which free models the hosted app calls, picked each hour from two lists. OpenRouter's public list says what exists and what each
 * model can do (tools, images, context). Artificial Analysis (artificialanalysis.ai, free API, used with attribution) says how good each
 * one is, as a single Intelligence Index score. `loadCatalog` reads both, `rankModels` turns them into an ordered list of ids.
 */

export const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models'
export const AA_FREE_MODELS_URL = 'https://artificialanalysis.ai/api/v2/language/models/free'
/** The Artificial Analysis free list comes in pages of up to 200 models (about 750 models in 4 pages on 16 November 2026). At most this many pages are read. */
export const AA_MAX_PAGES = 10
/** The address of one page (1, 2, ...) of the Artificial Analysis free list. */
export const aaPageUrl = (page: number) => `${AA_FREE_MODELS_URL}?page=${page}`

/** A list that was read is kept for this long (per isolate). */
export const CATALOG_TTL_MS = 60 * 60_000
/** A list that could not be read is remembered for this long, so a broken service is not asked on every call. */
export const CATALOG_FAILURE_TTL_MS = 5 * 60_000
/** One read of one list has this long to answer. */
export const CATALOG_READ_TIMEOUT_MS = 5000
/** The ranked part of the list holds this many models. */
export const RANKED_TOP = 4
/** A model needs room for the long prompts of the jobs. */
export const MIN_CONTEXT = 131_072

export type OpenRouterModel = {
  id: string
  name?: string
  created?: number
  context_length?: number
  architecture?: { input_modalities?: string[] }
  supported_parameters?: string[]
  pricing?: { prompt?: string; completion?: string }
  /**
   * OpenRouter's own copy of the Artificial Analysis Intelligence Index (`benchmarks.artificial_analysis.intelligence_index` in its public list),
   * or null when the model has none. Set by `loadCatalog`. It is the backup ranking when the Artificial Analysis list cannot be read.
   */
  aaIndex?: number | null
}

/** One row of the Artificial Analysis list. `score` is the Intelligence Index, or null when the row has none (unrated). */
export type AaModel = { slug: string; name: string; score: number | null }

export type Catalog = { openrouter: OpenRouterModel[] | null; aa: AaModel[] | null }

export type CatalogEnv = { AA_API_KEY?: string }

export type CatalogFetch = (url: string, init?: RequestInit) => PromiseLike<Response>

/** On OpenRouter the free listing of a model has an id that ends with `:free`. */
export const isFreeModelId = (id: string) => /:free$/i.test(id)

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const text = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined)

// ---- reading the two lists ----

function parseOpenRouter(body: unknown): OpenRouterModel[] | null {
  const rows = isRecord(body) ? body.data : null
  if (!Array.isArray(rows)) return null
  const models = rows
    .filter((r): r is OpenRouterModel & Record<string, unknown> => isRecord(r) && typeof r.id === 'string' && r.id.trim() !== '')
    .map((r): OpenRouterModel => ({ ...r, aaIndex: openRouterIndexOf(r) }))
  return models.length > 0 ? models : null
}

/** `benchmarks.artificial_analysis.intelligence_index` of an OpenRouter row, if it is a number. */
function openRouterIndexOf(row: Record<string, unknown>): number | null {
  const benchmarks = isRecord(row.benchmarks) ? row.benchmarks : {}
  const aa = isRecord(benchmarks.artificial_analysis) ? benchmarks.artificial_analysis : {}
  const v = aa.intelligence_index
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/** Where the score may sit. The free endpoint returns fewer fields than the paid one, so the places are tried in turn and a missing score is unrated. */
function aaScoreOf(row: Record<string, unknown>): number | null {
  const evaluations = isRecord(row.evaluations) ? row.evaluations : {}
  for (const v of [evaluations.artificial_analysis_intelligence_index, evaluations.intelligence_index, row.artificial_analysis_intelligence_index, row.intelligence_index]) {
    if (typeof v === 'number' && Number.isFinite(v)) return v
  }
  return null
}

/**
 * One page of the Artificial Analysis list: its rows, and whether `pagination.has_more` says another page follows. A page with no
 * pagination block (or a bare list of rows) is the only page. A page that is not a list of rows at all is `null`.
 */
function parseAaPage(body: unknown): { rows: AaModel[]; hasMore: boolean } | null {
  const rows = Array.isArray(body) ? body : isRecord(body) ? body.data : null
  if (!Array.isArray(rows)) return null
  const models = rows.flatMap((r): AaModel[] => {
    if (!isRecord(r)) return []
    const slug = text(r.slug) ?? text(r.name)
    const name = text(r.name) ?? text(r.slug)
    return slug && name ? [{ slug, name, score: aaScoreOf(r) }] : []
  })
  const hasMore = isRecord(body) && isRecord(body.pagination) && body.pagination.has_more === true
  return { rows: models, hasMore }
}

/** One read with a time limit. Any failure is `null` and one line in the log (never a header, never the key). */
async function readJson(fetchFn: CatalogFetch, url: string, headers: Record<string, string>, label: string): Promise<unknown | null> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`no answer after ${CATALOG_READ_TIMEOUT_MS / 1000} seconds`))
      controller.abort()
    }, CATALOG_READ_TIMEOUT_MS)
  })
  try {
    const read = (async () => {
      const res = await fetchFn(url, { headers, signal: controller.signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return (await res.json()) as unknown
    })()
    // When the time limit wins, the read is cancelled and fails later: that failure is expected.
    read.catch(() => {})
    return await Promise.race([read, late])
  } catch (err) {
    console.error(`model list not read (${label}): ${err instanceof Error ? err.message : String(err)}`)
    return null
  } finally {
    clearTimeout(timer)
  }
}

// What a read gave, kept per isolate. Only the answer is kept, never a request in flight (a Worker may not share one between requests).
type Slot<T> = { value: T | null; until: number; key: string }
let openrouterSlot: Slot<OpenRouterModel[]> | null = null
let aaSlot: Slot<AaModel[]> | null = null

// Models that refused a call (P121b), by lower-case id, with the time the memo of each ends. Kept per isolate, like the lists.
const refusedUntil = new Map<string, number>()

type Clock = number | (() => number)
const clockNow = (now: Clock) => (typeof now === 'function' ? now() : now)

/**
 * Notes that a model refused a call (OpenRouter refuses some free listings to API callers, with a 403 and "is only available on agentic
 * harnesses"). The dynamic list leaves it out of the ranked part for an hour (`refusedIds`). Marking an id again starts its hour again.
 */
export function markRefused(id: string, now: Clock = Date.now): void {
  const key = id.trim().toLowerCase()
  if (key) refusedUntil.set(key, clockNow(now) + CATALOG_TTL_MS)
}

/** The ids (lower case) that refused a call within the last hour. Ids whose hour has passed are forgotten. */
export function refusedIds(now: Clock = Date.now): Set<string> {
  const t = clockNow(now)
  for (const [id, until] of refusedUntil) if (t >= until) refusedUntil.delete(id)
  return new Set(refusedUntil.keys())
}

/** Forgets both lists and every refusal. For tests. */
export function resetCatalogMemo(): void {
  openrouterSlot = null
  aaSlot = null
  refusedUntil.clear()
}

async function openrouterList(fetchFn: CatalogFetch, now: () => number): Promise<OpenRouterModel[] | null> {
  if (openrouterSlot && now() < openrouterSlot.until) return openrouterSlot.value
  const body = await readJson(fetchFn, OPENROUTER_MODELS_URL, { accept: 'application/json' }, 'openrouter')
  const value = body === null ? null : parseOpenRouter(body)
  if (body !== null && value === null) console.error('model list not read (openrouter): the answer has no models')
  openrouterSlot = { value, until: now() + (value ? CATALOG_TTL_MS : CATALOG_FAILURE_TTL_MS), key: '' }
  return value
}

async function aaList(key: string, fetchFn: CatalogFetch, now: () => number): Promise<AaModel[] | null> {
  if (aaSlot && aaSlot.key === key && now() < aaSlot.until) return aaSlot.value
  // The pages are read one after the other (each says whether another follows), each with its own 5 second limit. If one page fails the
  // whole list counts as unread: half a ranking would favour whatever happens to be on the first pages.
  const rows: AaModel[] = []
  let ok = true
  for (let page = 1; page <= AA_MAX_PAGES; page++) {
    const body = await readJson(fetchFn, aaPageUrl(page), { accept: 'application/json', 'x-api-key': key }, 'artificial analysis')
    const parsed = body === null ? null : parseAaPage(body)
    if (!parsed) {
      if (body !== null) console.error(`model list not read (artificial analysis): page ${page} is not a list of models`)
      ok = false
      break
    }
    rows.push(...parsed.rows)
    if (!parsed.hasMore) break
  }
  const value = ok && rows.length > 0 ? rows : null
  if (ok && value === null) console.error('model list not read (artificial analysis): the answer has no models')
  aaSlot = { value, until: now() + (value ? CATALOG_TTL_MS : CATALOG_FAILURE_TTL_MS), key }
  return value
}

/**
 * Reads OpenRouter's list and the Artificial Analysis free list (each with a 5 second limit), and keeps each for an hour, or for 5 minutes
 * when it could not be read. Never throws: a list that is not there is `null`. With no `AA_API_KEY` the AA list is `null` and is not asked for.
 */
export async function loadCatalog(env: CatalogEnv, fetchFn: CatalogFetch, now: () => number = Date.now): Promise<Catalog> {
  try {
    const key = (env.AA_API_KEY ?? '').trim()
    const [openrouter, aa] = await Promise.all([openrouterList(fetchFn, now), key ? aaList(key, fetchFn, now) : Promise.resolve(null)])
    return { openrouter, aa }
  } catch (err) {
    console.error(`model lists not read: ${err instanceof Error ? err.message : String(err)}`)
    return { openrouter: null, aa: null }
  }
}

// ---- matching an OpenRouter model to an Artificial Analysis row ----

const squash = (s: string) =>
  s
    .replace(/[._\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

/** An OpenRouter id without its creator (`nvidia/`) and its `:free` suffix: lowercase, with `.`, `_` and spaces written as `-`. */
export function normaliseOpenRouterId(id: string): string {
  return squash(id.slice(id.indexOf('/') + 1).toLowerCase().replace(/:free$/, ''))
}

/** An Artificial Analysis slug or name without parenthesised effort words (`(max)`, `(reasoning)`), written the same way. */
export function normaliseAaName(value: string): string {
  return squash(value.toLowerCase().replace(/\([^)]*\)/g, ' '))
}

/**
 * Words that may end a name without making it another model. Size words (`31b`, `a4b`, `e4b`) and `vl` are NOT here: they tell models apart
 * (`gemma-4-26b-a4b` is not `gemma-4-31b`, and a `-vl` model is not its text-only sibling).
 */
const TRAILING_WORDS = new Set(['it', 'instruct', 'chat', 'preview', 'free', 'reasoning'])

/** Takes the words of `TRAILING_WORDS` off the end of a normalised name, again and again (`x-instruct-chat` becomes `x`). A name is never emptied. */
export function stripVariantWords(name: string): string {
  const parts = name.split('-')
  while (parts.length > 1 && TRAILING_WORDS.has(parts[parts.length - 1]!)) parts.pop()
  return parts.join('-')
}

/**
 * The names an OpenRouter id may go by in Artificial Analysis: its base name, and the creator plus the base name (AA slugs sometimes start
 * with the creator: `nvidia-nemotron-3-ultra-550b-a55b` for `nvidia/nemotron-3-ultra-550b-a55b:free`).
 */
export function openRouterKeys(id: string): string[] {
  const base = stripVariantWords(normaliseOpenRouterId(id))
  if (!base) return []
  const creator = id.indexOf('/') > 0 ? squash(id.slice(0, id.indexOf('/')).toLowerCase()) : ''
  return creator ? [base, `${creator}-${base}`] : [base]
}

/** The names of an Artificial Analysis row: its slug and its name, normalised and stripped the same way. */
export function aaKeys(row: { slug: string; name: string }): string[] {
  return [...new Set([stripVariantWords(normaliseAaName(row.slug)), stripVariantWords(normaliseAaName(row.name))].filter(Boolean))]
}

/** Each name of the rated rows, with the highest score among the rows that share it (a reasoning and a non-reasoning run of one model). */
function aaIndex(aa: AaModel[]): Map<string, number> {
  const index = new Map<string, number>()
  for (const row of aa) {
    if (row.score === null) continue
    for (const key of aaKeys(row)) index.set(key, Math.max(index.get(key) ?? row.score, row.score))
  }
  return index
}

function scoreIn(index: Map<string, number>, id: string): number | null {
  let best: number | null = null
  for (const key of openRouterKeys(id)) {
    const score = index.get(key)
    if (score !== undefined && (best === null || score > best)) best = score
  }
  return best
}

/**
 * The Intelligence Index of an OpenRouter model, or null when it is unrated. The names are compared after the trailing words `it`,
 * `instruct`, `chat`, `preview`, `free` and `reasoning` are taken off both sides: the model's base name and its creator plus base name
 * against the row's slug and its name (without parenthesised words). With several matching rows the highest score counts. A matching row with no
 * score does not count.
 */
export function aaScore(model: { id: string }, aa: AaModel[]): number | null {
  return scoreIn(aaIndex(aa), model.id)
}

// ---- the ordered list ----

export type RankInput = {
  kind: ModelKind
  openrouter: OpenRouterModel[] | null
  aa: AaModel[] | null
  /** The ids of the env (LLM_MODEL then LLM_MODEL_FALLBACKS, or the vision pair), in order. */
  pinned: string[]
  top?: number
  minContext?: number
  /** Ids (lower case) that refused a call lately (`refusedIds`). They are left out of the ranked part. A pinned id is never left out by this. */
  refused?: ReadonlySet<string>
}

const takesImages = (m: OpenRouterModel) => m.architecture?.input_modalities?.includes('image') === true
const bigger = (m: OpenRouterModel) => m.context_length ?? 0
const unique = (ids: string[]) => {
  const seen = new Set<string>()
  return ids.filter((id) => !seen.has(id.toLowerCase()) && !!seen.add(id.toLowerCase()))
}

/**
 * The ids to try, in order.
 * 1. Candidates: free listings (`:free`) that take tools and have room (`minContext`), and for a photo job (`vision`) that take images. Closed
 *    and open models alike.
 *    An id in `refused` is not a candidate (it is still added below when it is pinned).
 * 2. With Artificial Analysis data: only rated candidates, best score first, a tie to the larger context and then the id. Without it (no key,
 *    or the read failed): the same with OpenRouter's own copy of the index (`aaIndex`), and only if no candidate has one, the newest first.
 *    The first `top` are kept.
 * 3. The pinned ids follow, in their order, with no repeats. A pinned paid id (no `:free`) goes before the ranked ones. A pinned free id that
 *    OpenRouter no longer lists is dropped. A pinned id that OpenRouter lists as text-only is dropped from a photo job.
 * 4. With no OpenRouter list the pinned list is returned as it is, and so it is when nothing is left: the result is never empty unless
 *    there is nothing pinned.
 */
export function rankModels({ kind, openrouter, aa, pinned, top = RANKED_TOP, minContext = MIN_CONTEXT, refused }: RankInput): string[] {
  const asGiven = [...pinned]
  if (!openrouter) return asGiven
  const listed = new Map(openrouter.map((m) => [m.id.toLowerCase(), m]))
  const candidates = openrouter.filter(
    (m) =>
      isFreeModelId(m.id) &&
      m.supported_parameters?.includes('tools') === true &&
      bigger(m) >= minContext &&
      (kind !== 'vision' || takesImages(m)) &&
      !refused?.has(m.id.toLowerCase()),
  )
  const order = (a: OpenRouterModel, b: OpenRouterModel) => bigger(b) - bigger(a) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  const index = aa && aa.length > 0 ? aaIndex(aa) : null
  const byScore = (rows: { m: OpenRouterModel; score: number }[]) => rows.sort((a, b) => b.score - a.score || order(a.m, b.m))
  // The backup: OpenRouter's own copy of the index, for the candidates that have one (the others are unrated and dropped).
  const backup = candidates.flatMap((m) => (typeof m.aaIndex === 'number' ? [{ m, score: m.aaIndex }] : []))
  const ranked = byScore(
    index
      ? candidates.flatMap((m) => {
          const score = scoreIn(index, m.id)
          return score === null ? [] : [{ m, score }]
        })
      : backup.length > 0
        ? backup
        : candidates.map((m) => ({ m, score: m.created ?? 0 })),
  )
    .slice(0, Math.max(0, top))
    .map((x) => x.m.id)

  const paid: string[] = []
  const free: string[] = []
  for (const id of unique(pinned.map((p) => p.trim()).filter(Boolean))) {
    const known = listed.get(id.toLowerCase())
    if (kind === 'vision' && known && !takesImages(known)) continue
    if (!isFreeModelId(id)) paid.push(id)
    else if (known) free.push(id)
  }
  const list = unique([...paid, ...ranked, ...free])
  return list.length > 0 ? list : asGiven
}
