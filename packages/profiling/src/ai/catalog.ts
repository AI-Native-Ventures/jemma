import type { ModelKind } from './models'

/**
 * P121: which free models the hosted app calls, picked each hour from two lists. OpenRouter's public list says what exists and what each
 * model can do (tools, images, context). Artificial Analysis (artificialanalysis.ai, free API, used with attribution) says how good each
 * one is, as a single Intelligence Index score. `loadCatalog` reads both, `rankModels` turns them into an ordered list of ids.
 */

export const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models'
export const AA_FREE_MODELS_URL = 'https://artificialanalysis.ai/api/v2/language/models/free'

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
  const models = rows.filter((r): r is OpenRouterModel => isRecord(r) && typeof r.id === 'string' && r.id.trim() !== '')
  return models.length > 0 ? models : null
}

/** Where the score may sit. The free endpoint returns fewer fields than the paid one, so the places are tried in turn and a missing score is unrated. */
function aaScoreOf(row: Record<string, unknown>): number | null {
  const evaluations = isRecord(row.evaluations) ? row.evaluations : {}
  for (const v of [evaluations.artificial_analysis_intelligence_index, evaluations.intelligence_index, row.artificial_analysis_intelligence_index, row.intelligence_index]) {
    if (typeof v === 'number' && Number.isFinite(v)) return v
  }
  return null
}

function parseAa(body: unknown): AaModel[] | null {
  const rows = Array.isArray(body) ? body : isRecord(body) ? body.data : null
  if (!Array.isArray(rows)) return null
  const models = rows.flatMap((r): AaModel[] => {
    if (!isRecord(r)) return []
    const slug = text(r.slug) ?? text(r.name)
    const name = text(r.name) ?? text(r.slug)
    return slug && name ? [{ slug, name, score: aaScoreOf(r) }] : []
  })
  return models.length > 0 ? models : null
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

/** Forgets both lists. For tests. */
export function resetCatalogMemo(): void {
  openrouterSlot = null
  aaSlot = null
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
  const body = await readJson(fetchFn, AA_FREE_MODELS_URL, { accept: 'application/json', 'x-api-key': key }, 'artificial analysis')
  const value = body === null ? null : parseAa(body)
  if (body !== null && value === null) console.error('model list not read (artificial analysis): the answer has no models')
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

/** The one word that may follow a name without making it another model: `-it`, `-vl`, `-a4b`, `-31b`. */
const VARIANT = /^(?:it|instruct|chat|preview|vl|a\d+b|\d+b|free)$/

const plusVariant = (long: string, short: string) => long.startsWith(`${short}-`) && VARIANT.test(long.slice(short.length + 1))

const sameModel = (a: string, b: string) => a !== '' && b !== '' && (a === b || plusVariant(a, b) || plusVariant(b, a))

/**
 * The Intelligence Index of an OpenRouter model, or null when it is unrated. A row matches when its slug or its name, once normalised, is
 * the model's normalised id, or that id with one variant word added or taken off. With several matching rows (a reasoning and a
 * non-reasoning run of one model) the highest score counts. A matching row with no score does not count.
 */
export function aaScore(model: { id: string }, aa: AaModel[]): number | null {
  const id = normaliseOpenRouterId(model.id)
  let best: number | null = null
  for (const row of aa) {
    if (row.score === null) continue
    if (sameModel(id, normaliseAaName(row.slug)) || sameModel(id, normaliseAaName(row.name))) best = best === null ? row.score : Math.max(best, row.score)
  }
  return best
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
 * 2. With Artificial Analysis data: only rated candidates, best score first, a tie to the larger context and then the id. Without it: the
 *    newest first. The first `top` are kept.
 * 3. The pinned ids follow, in their order, with no repeats. A pinned paid id (no `:free`) goes before the ranked ones. A pinned free id that
 *    OpenRouter no longer lists is dropped. A pinned id that OpenRouter lists as text-only is dropped from a photo job.
 * 4. With no OpenRouter list the pinned list is returned as it is, and so it is when nothing is left: the result is never empty unless
 *    there is nothing pinned.
 */
export function rankModels({ kind, openrouter, aa, pinned, top = RANKED_TOP, minContext = MIN_CONTEXT }: RankInput): string[] {
  const asGiven = [...pinned]
  if (!openrouter) return asGiven
  const listed = new Map(openrouter.map((m) => [m.id.toLowerCase(), m]))
  const candidates = openrouter.filter(
    (m) => isFreeModelId(m.id) && m.supported_parameters?.includes('tools') === true && bigger(m) >= minContext && (kind !== 'vision' || takesImages(m)),
  )
  const order = (a: OpenRouterModel, b: OpenRouterModel) => bigger(b) - bigger(a) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  const withScore = aa && aa.length > 0 ? aa : null
  const ranked = (
    withScore
      ? candidates
          .flatMap((m) => {
            const score = aaScore(m, withScore)
            return score === null ? [] : [{ m, score }]
          })
          .sort((a, b) => b.score - a.score || order(a.m, b.m))
      : candidates.map((m) => ({ m, score: m.created ?? 0 })).sort((a, b) => b.score - a.score || order(a.m, b.m))
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
