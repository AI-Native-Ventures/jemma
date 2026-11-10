import type { LongViewEvidence, LongViewKind, LongViewTerm, PatternCandidate } from '../schemas/long-view'

// The Long view: code finds the strengths and struggles that hold for 3 terms or more. A model only puts them in words.
// Pure functions, no database. Terms are calendar quarters: Jan to Mar is 1, Apr to Jun 2, Jul to Sep 3, Oct to Dec 4.

/** A family is a struggle in a term when its percent is below this. */
export const STRUGGLE_BELOW = 50
/** A family is a strength in a term when its percent is at or above this. */
export const STRENGTH_FROM = 80
/** A pattern needs this many terms with data, in a row, ending at the latest one. */
export const MIN_TERMS = 3
/** A family needs this many marks (or answers) in a term for that term to count. Fewer is "no data". */
export const MIN_POINTS = 3
/** Sources listed as evidence on one pattern. The rest are counted in `more`. */
export const MAX_EVIDENCE = 12

export type SlotRef = { year: number; term: number }
export type GradedSlot = SlotRef & { grade: number }

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** The UTC year, month (1 to 12) and day of an ISO date or timestamp. */
function dateParts(iso: string): { year: number; month: number; day: number } {
  const plain = DATE_ONLY.exec(iso)
  if (plain) {
    const [year, month, day] = [Number(plain[1]), Number(plain[2]), Number(plain[3])]
    if (month < 1 || month > 12 || day < 1 || day > 31) throw new Error(`not a date: ${iso}`)
    return { year, month, day }
  }
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) throw new Error(`not a date: ${iso}`)
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
}

/** The calendar term (1 to 4) of an ISO date or timestamp, read in UTC. */
export function termOf(isoDate: string): number {
  return Math.ceil(dateParts(isoDate).month / 3)
}

export function slotOf(isoDate: string): SlotRef {
  return { year: dateParts(isoDate).year, term: termOf(isoDate) }
}

/** `2025-3`. Keys sort the same way as slots: by year, then term. */
export function slotKey(s: SlotRef): string {
  return `${s.year}-${s.term}`
}

export function compareSlots(a: SlotRef, b: SlotRef): number {
  return a.year - b.year || a.term - b.term
}

function nextSlot(s: SlotRef): SlotRef {
  return s.term === 4 ? { year: s.year + 1, term: 1 } : { year: s.year, term: s.term + 1 }
}

/** `14 May 2025`. */
export function plainDate(isoDate: string): string {
  const { year, month, day } = dateParts(isoDate)
  return `${day} ${MONTHS[month - 1]} ${year}`
}

export const patternKey = (kind: LongViewKind, family: string) => `${kind}:${family}`

/** A row of `learner_records`, in the shape the logic reads. */
export type LongViewRecord = {
  id: string
  source: 'quiz' | 'assignment' | 'project' | 'note' | 'attendance'
  grade: number
  year: number
  term: number
  /** YYYY-MM-DD */
  happenedOn: string
  loggedAt: string
  teacherName: string
  title: string
  family: string | null
  topicName: string | null
  marks: number | null
  outOf: number | null
  quality: 'clear' | 'unclear'
  text: string | null
  present: number | null
  total: number | null
}

/** One marked answer of this year (from `question_results`). `grade` is the learner's grade now. */
export type LongViewResult = {
  id: string
  correct: boolean
  family: string
  isoDate: string
  label: string
  grade?: number
}

export type TableSource = { kind: 'record' | 'result'; id: string; label: string }
export type TableSlot = LongViewTerm & { sources: TableSource[] }
export type FamilyTable = { family: string; slots: TableSlot[] }

/** Marked pieces count. Notes and attendance never do. */
const MARKED = new Set<LongViewRecord['source']>(['quiz', 'assignment', 'project'])

export function recordLabel(r: Pick<LongViewRecord, 'title' | 'teacherName' | 'happenedOn'>): string {
  return `${r.title}, ${r.teacherName}, ${plainDate(r.happenedOn)}`
}

type Item = { family: string; slot: SlotRef; grade: number | null; got: number; of: number; date: string; source: TableSource }

/** Newest first. Ties are broken by label and id, so the order never depends on how rows came out of the database. */
const newestFirst = (a: { date: string; source: TableSource }, b: { date: string; source: TableSource }) =>
  b.date.localeCompare(a.date) || a.source.label.localeCompare(b.source.label) || a.source.id.localeCompare(b.source.id)

/** Highest grade seen in each slot, from records of any kind and from results that carry a grade. */
function gradesBySlot(records: LongViewRecord[], results: LongViewResult[]): Map<string, number> {
  const out = new Map<string, number>()
  const see = (slot: SlotRef, grade: number | undefined) => {
    if (grade === undefined) return
    const key = slotKey(slot)
    out.set(key, Math.max(out.get(key) ?? grade, grade))
  }
  for (const r of records) see(r, r.grade)
  for (const r of results) see(slotOf(r.isoDate), r.grade)
  return out
}

/** The grade of the latest slot that has one: what a result with no grade of its own falls back to. */
function latestGrade(grades: Map<string, number>): number {
  const latest = [...grades.keys()].sort().at(-1)
  return latest === undefined ? 0 : grades.get(latest)!
}

/**
 * Marks by family and term.
 * - From records: only quizzes, assignments and projects with a family, marks and out of, and a clear quality.
 *   Percent is summed marks over summed out of (rounded), points is summed out of.
 * - From current results: percent is the share of right answers, points is the number of answers.
 * - A record whose quality is 'unclear' never counts. It comes back in `notCounted` with its label.
 * - A term where a family has fewer than MIN_POINTS is left out for that family: "no data".
 * Families come back in alphabetical order and terms oldest first.
 */
export function buildTable(
  records: LongViewRecord[],
  results: LongViewResult[],
): { table: FamilyTable[]; notCounted: { id: string; label: string }[] } {
  const items: Item[] = []
  const notCounted: { id: string; label: string }[] = []
  for (const r of records) {
    if (!MARKED.has(r.source)) continue
    if (r.quality === 'unclear') {
      notCounted.push({ id: r.id, label: recordLabel(r) })
      continue
    }
    if (!r.family || r.marks === null || r.outOf === null || r.outOf <= 0 || r.marks < 0 || r.marks > r.outOf) continue
    items.push({ family: r.family, slot: r, grade: r.grade, got: r.marks, of: r.outOf, date: r.happenedOn, source: { kind: 'record', id: r.id, label: recordLabel(r) } })
  }
  for (const r of results) {
    items.push({ family: r.family, slot: slotOf(r.isoDate), grade: r.grade ?? null, got: r.correct ? 1 : 0, of: 1, date: r.isoDate, source: { kind: 'result', id: r.id, label: r.label } })
  }

  const grades = gradesBySlot(records, results)
  const fallback = latestGrade(grades)
  const byFamily = new Map<string, Map<string, { slot: SlotRef; got: number; of: number; items: Item[] }>>()
  for (const item of items) {
    const slots = byFamily.get(item.family) ?? new Map()
    const key = slotKey(item.slot)
    const cell = slots.get(key) ?? { slot: { year: item.slot.year, term: item.slot.term }, got: 0, of: 0, items: [] }
    cell.got += item.got
    cell.of += item.of
    cell.items.push(item)
    slots.set(key, cell)
    byFamily.set(item.family, slots)
  }

  const table: FamilyTable[] = [...byFamily]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([family, slots]) => ({
      family,
      slots: [...slots.values()]
        .filter((c) => c.of >= MIN_POINTS)
        .sort((a, b) => compareSlots(a.slot, b.slot))
        .map((c) => ({
          grade: grades.get(slotKey(c.slot)) ?? fallback,
          year: c.slot.year,
          term: c.slot.term,
          percent: Math.round((c.got * 100) / c.of),
          points: c.of,
          sources: [...c.items].sort(newestFirst).map((i) => i.source),
        })),
    }))
    .filter((f) => f.slots.length > 0)
  notCounted.sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id))
  return { table, notCounted }
}

/** Every term that has any record (of any kind) or any marked answer, oldest first. */
export function historySlots(records: LongViewRecord[], results: LongViewResult[], currentGrade?: number): GradedSlot[] {
  const grades = new Map<string, GradedSlot>()
  const see = (slot: SlotRef, grade: number) => {
    const key = slotKey(slot)
    const seen = grades.get(key)
    grades.set(key, { grade: Math.max(seen?.grade ?? grade, grade), year: slot.year, term: slot.term })
  }
  for (const r of records) see(r, r.grade)
  for (const r of results) see(slotOf(r.isoDate), r.grade ?? currentGrade ?? grades.get(slotKey(slotOf(r.isoDate)))?.grade ?? 0)
  return [...grades.values()].sort(compareSlots)
}

/**
 * Terms between the first and the last of `slots` that are not in it. Nothing is said about terms before the first or after the last.
 * When the slots carry a grade, a missing term gets one too: the grade of the term before it, moved on by the years in between.
 */
export function missingSlots(slots: (SlotRef & { grade?: number })[]): (SlotRef & { grade?: number })[] {
  if (slots.length < 2) return []
  const sorted = [...slots].sort(compareSlots)
  const have = new Map(sorted.map((x) => [slotKey(x), x]))
  const last = sorted[sorted.length - 1]!
  const out: (SlotRef & { grade?: number })[] = []
  let before = sorted[0]!
  for (let s = nextSlot(before); compareSlots(s, last) < 0; s = nextSlot(s)) {
    const known = have.get(slotKey(s))
    if (known) before = known
    else out.push(before.grade === undefined ? { year: s.year, term: s.term } : { grade: before.grade + (s.year - before.year), year: s.year, term: s.term })
  }
  return out
}

/** `strength` at or above STRENGTH_FROM, `struggle` below STRUGGLE_BELOW, else nothing. */
export function kindOfPercent(percent: number): LongViewKind | null {
  if (percent < STRUGGLE_BELOW) return 'struggle'
  if (percent >= STRENGTH_FROM) return 'strength'
  return null
}

/**
 * The strengths and struggles that hold across terms. Per family, from its terms with data in order, take the longest run that
 * ends at the family's most recent term with data and in which every term is below STRUGGLE_BELOW (a struggle) or at or above
 * STRENGTH_FROM (a strength). A run of MIN_TERMS or more is a candidate. Terms with no data inside the span are skipped, never
 * guessed, and are listed in `missingTerms`.
 */
export function findPatterns(table: FamilyTable[]): PatternCandidate[] {
  const out: PatternCandidate[] = []
  for (const { family, slots } of [...table].sort((a, b) => a.family.localeCompare(b.family))) {
    const ordered = [...slots].sort(compareSlots)
    const last = ordered[ordered.length - 1]
    if (!last) continue
    const kind = kindOfPercent(last.percent)
    if (!kind) continue
    let start = ordered.length - 1
    while (start > 0 && kindOfPercent(ordered[start - 1]!.percent) === kind) start--
    const run = ordered.slice(start)
    if (run.length < MIN_TERMS) continue

    const sources: LongViewEvidence[] = [...run].reverse().flatMap((s) => s.sources)
    const candidate: PatternCandidate = {
      key: patternKey(kind, family),
      kind,
      family,
      terms: run.map(({ grade, year, term, percent, points }) => ({ grade, year, term, percent, points })),
      evidence: sources.slice(0, MAX_EVIDENCE),
      missingTerms: missingSlots(run),
    }
    if (sources.length > MAX_EVIDENCE) candidate.more = sources.length - MAX_EVIDENCE
    out.push(candidate)
  }
  return out
}

/** Words and phrases a Long view never uses: labels, rankings, comparisons and career talk. Matched as whole words. */
export const BANNED_WORDS = [
  'gifted',
  'genius',
  'clever',
  'bright',
  'smart',
  'slow',
  'lazy',
  'weak learner',
  'stupid',
  'dull',
  'average learner',
  'top of',
  'best in',
  'bottom of',
  'ranked',
  'rank',
  'than the class',
  'than other learners',
  'than her classmates',
  'than his classmates',
  'career',
  'job one day',
  'engineer',
  'doctor',
  'scientist',
  'should study',
  'should take',
  'should choose',
  'stream',
  'track',
] as const

const BANNED_PATTERNS = BANNED_WORDS.map((w) => ({ word: w, re: new RegExp(`\\b${w.split(' ').join('\\s+')}\\b`, 'i') }))

/** The banned words found in `text`, each once, in the order they first appear. Case-insensitive. */
export function bannedWords(text: string): string[] {
  return BANNED_PATTERNS.flatMap(({ word, re }) => {
    const hit = re.exec(text)
    return hit ? [{ word, at: hit.index }] : []
  })
    .sort((a, b) => a.at - b.at)
    .map((h) => h.word)
}
