import { TopicMapDraftSchema, type TopicMapDraft } from '@jemma/profiling/schemas'

/** What the teacher chose for each check: topic or left-out name to the option label. Stored beside the draft. */
export type Resolutions = Record<string, string>
export type ReadDraft = { draft: TopicMapDraft; resolutions: Resolutions }

/** The draft jsonb is `{}` until the draft_map job saves it. */
export function readDraft(raw: unknown): ReadDraft | null {
  const parsed = TopicMapDraftSchema.safeParse(raw)
  if (!parsed.success || parsed.data.terms.length === 0) return null
  const res = (raw as { resolutions?: Resolutions }).resolutions
  return { draft: parsed.data, resolutions: res && typeof res === 'object' ? res : {} }
}

/** The jsonb to store: the draft plus the teacher's choices. */
export const toRaw = (draft: TopicMapDraft, resolutions: Resolutions) => ({ ...draft, resolutions })

export const TERM_RANGE: Record<number, string> = { 1: 'January to March', 2: 'April to June', 3: 'July to September', 4: 'October to December' }
export const TERM_SHORT: Record<number, string> = { 1: 'Jan to Mar', 2: 'Apr to Jun', 3: 'Jul to Sep', 4: 'Oct to Dec' }

/** South African school terms follow the calendar quarters. */
export const currentTerm = (d = new Date()): 1 | 2 | 3 | 4 => (Math.floor(d.getUTCMonth() / 3) + 1) as 1 | 2 | 3 | 4

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

const TZ = 'Africa/Johannesburg'
export const timeHm = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: TZ })
/** `Mon 26 Oct` */
export function dayLabel(iso: string): string {
  const d = new Date(iso)
  const p = (o: Intl.DateTimeFormatOptions) => d.toLocaleDateString('en-GB', { timeZone: TZ, ...o })
  return `${p({ weekday: 'short' })} ${p({ day: 'numeric' })} ${p({ month: 'short' })}`
}

/** Grade-page range for the two sample documents; real uploads only show their page count. */
const DOC_NOTES: Record<string, string> = {
  'CAPS Intermediate Phase Mathematics': 'Grade 6 found on pages 104 to 151',
  'Grade 6 Annual Teaching Plan': '4 terms',
}
export const docNote = (title: string, pages: number) => [plural(pages, 'page'), DOC_NOTES[title]].filter(Boolean).join(' · ')

export const SAMPLE_DOCS = [
  { title: 'CAPS Intermediate Phase Mathematics', pages: 185 },
  { title: 'Grade 6 Annual Teaching Plan', pages: 24 },
]

export type Unresolved = { kind: 'check' | 'leftOut'; name: string; term: number }

/** The term a left-out topic would go in, read from its reason ("... in Term 3 ..."). */
export function leftOutTerm(reason: string, fallback: number): number {
  const m = /Term ([1-4])/.exec(reason)
  return m ? Number(m[1]) : fallback
}

export function termOf(draft: TopicMapDraft, name: string): number | null {
  return draft.terms.find((t) => t.topics.some((x) => x.name === name))?.term ?? null
}

export function unresolved({ draft, resolutions }: ReadDraft, fallbackTerm: number): Unresolved[] {
  const out: Unresolved[] = []
  for (const t of draft.terms) for (const x of t.topics) if (x.check && !resolutions[x.name]) out.push({ kind: 'check', name: x.name, term: t.term })
  const first = out[0]?.term ?? fallbackTerm
  for (const l of draft.leftOut) if (!resolutions[l.name]) out.push({ kind: 'leftOut', name: l.name, term: leftOutTerm(l.reason, first) })
  return out
}

export const topicCount = (d: TopicMapDraft) => d.terms.reduce((n, t) => n + t.topics.length, 0)

export function mapHeadline(r: ReadDraft, fallbackTerm: number): string {
  const total = `${topicCount(r.draft)} topics in ${r.draft.terms.length} terms.`
  const open = unresolved(r, fallbackTerm)
  if (open.length === 0) return `${total} Nothing left to check. Approve when the map looks right.`
  const terms = [...new Set(open.map((o) => o.term))]
  return terms.length === 1 ? `${total} Check ${open.length} in Term ${terms[0]}, then approve.` : `${total} Check ${open.length}, then approve.`
}

const joinAnd = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)

/** "Needs Equivalent fractions (T1) and ...", or "Needs topic 1" when it is in the same term. Null with no prerequisites. */
export function needsLabel(draft: TopicMapDraft, term: number, prerequisites: string[]): string | null {
  const inTerm = draft.terms.find((t) => t.term === term)?.topics ?? []
  const parts = prerequisites.map((p) => {
    const idx = inTerm.findIndex((x) => x.name === p)
    if (idx >= 0) return `topic ${idx + 1}`
    const t = termOf(draft, p)
    return t ? `${p} (T${t})` : p
  })
  return parts.length ? `Needs ${joinAnd(parts)}` : null
}

// ---- Edits: pure, each returns a new draft --------------------------------------------------

const clone = (d: TopicMapDraft): TopicMapDraft => structuredClone(d)

function termTopics(d: TopicMapDraft, term: number) {
  let t = d.terms.find((x) => x.term === term)
  if (!t) {
    t = { term: term as 1 | 2 | 3 | 4, topics: [] }
    d.terms.push(t)
    d.terms.sort((a, b) => a.term - b.term)
  }
  return t.topics
}

export function moveTopicIn(src: TopicMapDraft, name: string, term: number, position: number): TopicMapDraft {
  const d = clone(src)
  let moved: TopicMapDraft['terms'][number]['topics'][number] | undefined
  for (const t of d.terms) {
    const i = t.topics.findIndex((x) => x.name === name)
    if (i >= 0) moved = t.topics.splice(i, 1)[0]
  }
  if (!moved) return src
  const list = termTopics(d, term)
  list.splice(Math.max(0, Math.min(position, list.length)), 0, moved)
  return d
}

export function renameTopicIn(src: TopicMapDraft, from: string, to: string): TopicMapDraft {
  const d = clone(src)
  for (const t of d.terms)
    for (const x of t.topics) {
      if (x.name === from) x.name = to
      x.prerequisites = x.prerequisites.map((p) => (p === from ? to : p))
    }
  return d
}

export function addTopicIn(src: TopicMapDraft, term: number, name: string, family = 'other'): TopicMapDraft {
  const d = clone(src)
  termTopics(d, term).push({ name, family, prerequisites: [], misconceptions: [] })
  return d
}

/** Applies a choice on a check ("Move to Term 4") or on a left-out topic ("Add to Term 3"). */
export function resolveIn(r: ReadDraft, name: string, option: string): ReadDraft {
  let draft = r.draft
  const m = /Term ([1-4])/.exec(option)
  if (termOf(draft, name) !== null) {
    if (/^Move/.test(option) && m) draft = moveTopicIn(draft, name, Number(m[1]), Number.MAX_SAFE_INTEGER)
  } else if (/^Add/.test(option) && m) {
    draft = addTopicIn(draft, Number(m[1]), name)
  }
  return { draft, resolutions: { ...r.resolutions, [name]: option } }
}

/** "Percentages kept in Term 3" or "Rounding left out": the choices as the approved log words them. */
export function choicesSummary(r: ReadDraft): string[] {
  const out: string[] = []
  for (const t of r.draft.terms)
    for (const x of t.topics) {
      if (!x.check) continue
      const choice = r.resolutions[x.name]
      out.push(`${x.name} ${choice && /^Move/.test(choice) ? 'moved to' : 'kept in'} Term ${t.term}`)
    }
  for (const l of r.draft.leftOut) {
    const first = l.name.split(' ')[0]!
    const choice = r.resolutions[l.name]
    out.push(choice && /^Add/.test(choice) ? `${first} added to Term ${/Term ([1-4])/.exec(choice)?.[1]}` : `${first} left out`)
  }
  return out
}

/** "Adding is behind: decimals this term, fractions and mixed numbers from Term 3." */
export function behindHeadline(weak: { name: string; term: number }[], now: number): string | null {
  if (weak.length === 0) return null
  const firstWords = new Set(weak.map((w) => w.name.split(' ')[0]))
  if (firstWords.size !== 1) return `${plural(weak.length, 'topic')} behind: ${joinAnd(weak.map((w) => w.name.toLowerCase()))}.`
  const head = [...firstWords][0]!
  const rest = (n: string) => n.split(' ').slice(1).join(' ').split(' with ')[0]!
  const groups = new Map<number, string[]>()
  for (const w of weak) groups.set(w.term, [...(groups.get(w.term) ?? []), rest(w.name)])
  const clauses = [...groups.entries()]
    .sort((a, b) => (a[0] === now ? -1 : b[0] === now ? 1 : b[0] - a[0]))
    .map(([term, names]) => `${joinAnd(names)} ${term === now ? 'this term' : `from Term ${term}`}`)
  return `${head} is behind: ${clauses.join(', ')}.`
}
