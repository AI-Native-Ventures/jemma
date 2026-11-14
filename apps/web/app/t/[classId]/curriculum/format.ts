import { sameSubject, sameTopicName } from '@jemma/profiling/logic'
import { TopicMapDraftSchema, type TopicMapDraft } from '@jemma/profiling/schemas'

/** What the teacher chose for each check: topic or left-out name to the option label. Stored beside the draft. */
export type Resolutions = Record<string, string>
/** Where a draft came from when it did not come from the teacher's own documents: the official curriculum (CAPS). Stored beside the draft. */
export type DraftSource = { kind: 'caps'; title: string; publisher: string; address: string }
export type ReadDraft = { draft: TopicMapDraft; resolutions: Resolutions; source?: DraftSource }

const readSource = (raw: unknown): DraftSource | undefined => {
  const s = (raw as { source?: Partial<DraftSource> | null } | null)?.source
  return s && typeof s === 'object' && s.kind === 'caps' && typeof s.title === 'string' && typeof s.publisher === 'string' && typeof s.address === 'string'
    ? { kind: 'caps', title: s.title, publisher: s.publisher, address: s.address }
    : undefined
}

/** The draft jsonb is `{}` until the draft_map job saves it. */
export function readDraft(raw: unknown): ReadDraft | null {
  const parsed = TopicMapDraftSchema.safeParse(raw)
  if (!parsed.success || parsed.data.terms.length === 0) return null
  const res = (raw as { resolutions?: Resolutions }).resolutions
  const source = readSource(raw)
  return { draft: parsed.data, resolutions: res && typeof res === 'object' ? res : {}, ...(source ? { source } : {}) }
}

/** The jsonb to store: the draft plus the teacher's choices, and the source when the draft came from the official curriculum. */
export const toRaw = (draft: TopicMapDraft, resolutions: Resolutions, source?: DraftSource) => ({ ...draft, resolutions, ...(source ? { source } : {}) })

/** What the curriculum screen shows for a class: nothing yet, Jemma reading documents, a draft ready to check, or the approved map. */
export type CurriculumStage = 'empty' | 'reading' | 'draft' | 'approved'

/**
 * Which screen a class's curriculum is at. A map that can be read is ready (to check, or approved) with or without a document: the
 * official CAPS map has none. Documents with no readable map yet mean Jemma is reading. No map, or a map with no document and nothing
 * to read, is the empty screen.
 */
export function curriculumStage(map: { status: 'draft' | 'approved'; docs: number; read: boolean } | null): CurriculumStage {
  if (!map) return 'empty'
  if (map.read) return map.status === 'approved' ? 'approved' : 'draft'
  return map.docs === 0 ? 'empty' : 'reading'
}

/** What a teacher reads when the CAPS map is not for their class. */
export const CAPS_NOT_MATHS = 'The CAPS map is for a Mathematics class.'
export const CAPS_NOT_SA = 'The CAPS map is for a school in South Africa.'
export const CAPS_NOT_GRADE = 'The CAPS map covers Grades 1 to 12.'
export const CAPS_HAS_MAP = 'This class already has an approved topic map.'

/** Why a class cannot start from the CAPS map, in plain words, or null when it can: Mathematics, a school in South Africa, Grades 1 to 12. */
export function capsRefusal(subject: string, country: string, grade: number): string | null {
  if (!sameSubject(subject, 'Mathematics')) return CAPS_NOT_MATHS
  if (!/^(za|south africa)$/i.test(country.trim())) return CAPS_NOT_SA
  if (!Number.isInteger(grade) || grade < 1 || grade > 12) return CAPS_NOT_GRADE
  return null
}

/** True when the class is offered "Start from the CAPS map". A school stores its country as a code (`ZA`). */
export const capsFits = (subject: string, country: string, grade: number): boolean => capsRefusal(subject, country, grade) === null

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

/** What the teacher reads when the sample curriculum is not for their class. */
export const SAMPLE_ONLY_FOR = 'The sample curriculum is for a Grade 6 Mathematics class.'

/**
 * The sample documents are Grade 6 Mathematics pages. In any other class they would draft a map for the wrong grade or the wrong subject,
 * so the button shows (and the action works) only for a Grade 6 Mathematics class. `Maths` and `mathematics ` are Mathematics.
 * (`isBaselineClass` is not this: it also asks for the school's country, and it says yes to a class it could not read.)
 */
export const sampleCurriculumFits = (subject: string, grade: number): boolean => grade === 6 && sameSubject(subject, 'Mathematics')

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

/** The terms of a draft that have topics, in order: three for a Kenyan scheme, four for most others. All four when there are none. */
export function termNumbers(draft: TopicMapDraft): (1 | 2 | 3 | 4)[] {
  const shown = [...new Set(draft.terms.filter((t) => t.topics.length > 0).map((t) => t.term))].sort((a, b) => a - b)
  return shown.length > 0 ? shown : [1, 2, 3, 4]
}

/** A term number that is not one of the terms shown (the calendar says term 4 in a three term year) is read as the next one shown, or the last. */
export function termInView(shown: readonly number[], term: number): number {
  return shown.includes(term) ? term : (shown.find((n) => n > term) ?? shown[shown.length - 1]!)
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

export type TopicEdit = { name: string; term: number; /** 0-based place in the term */ position: number; prerequisites: string[] }

/** Saves the laptop panel: rename, prerequisites, then the term and place. */
export function saveTopicIn(r: ReadDraft, from: string, edit: TopicEdit): ReadDraft {
  const name = edit.name.trim() || from
  const resolutions = { ...r.resolutions }
  if (name !== from && from in resolutions) {
    resolutions[name] = resolutions[from]!
    delete resolutions[from]
  }
  let draft = name === from ? r.draft : renameTopicIn(r.draft, from, name)
  draft = clone(draft)
  for (const t of draft.terms) for (const x of t.topics) if (x.name === name) x.prerequisites = edit.prerequisites.filter((p) => p !== name)
  return { draft: moveTopicIn(draft, name, edit.term, edit.position), resolutions }
}

/** Drops a topic and every "needs" link that pointed at it. */
export function removeTopicIn(src: TopicMapDraft, name: string): TopicMapDraft {
  const d = clone(src)
  for (const t of d.terms) {
    t.topics = t.topics.filter((x) => x.name !== name)
    for (const x of t.topics) x.prerequisites = x.prerequisites.filter((p) => p !== name)
  }
  return d
}

/**
 * A topic listed in more than one term, kept in one of them: the entries in the other terms go. Nothing else changes.
 * "The same topic" is the rule the question uses (`sameTopicName`: without case and extra spaces), so "Keep in Term 2" on "Perimeter and Area"
 * also removes "perimeter and area" in Term 3. The entry that stays keeps its own spelling.
 */
function keepInTermIn(src: TopicMapDraft, name: string, term: number): TopicMapDraft {
  const inTerms = src.terms.filter((t) => t.topics.some((x) => sameTopicName(x.name, name)))
  if (inTerms.length < 2 || !inTerms.some((t) => t.term === term)) return src
  const d = clone(src)
  for (const t of d.terms) if (t.term !== term) t.topics = t.topics.filter((x) => !sameTopicName(x.name, name))
  return d
}

/** Applies a choice on a check ("Move to Term 4") or on a left-out topic ("Add to Term 3"). */
export function resolveIn(r: ReadDraft, name: string, option: string): ReadDraft {
  let draft = r.draft
  const m = /Term ([1-4])/.exec(option)
  if (termOf(draft, name) !== null) {
    if (/^Move/.test(option) && m) draft = moveTopicIn(draft, name, Number(m[1]), Number.MAX_SAFE_INTEGER)
    else if (/^Keep/.test(option) && m) draft = keepInTermIn(draft, name, Number(m[1]))
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
