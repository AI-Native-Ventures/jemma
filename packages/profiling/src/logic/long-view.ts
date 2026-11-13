import type { LongViewEvidence, LongViewKind, LongViewTerm, PatternCandidate } from '../schemas/long-view'
import { DEFAULT_SUBJECT, canonicalFamily, canonicalSubject, compareSubjects } from './strands'

// The Long view: code finds the strengths and struggles that hold for 3 terms or more. A model only puts them in words.
// Pure functions, no database. Terms are calendar quarters: Jan to Mar is 1, Apr to Jun 2, Jul to Sep 3, Oct to Dec 4.

/** A family is a struggle in a term when its percent is below this. */
export const STRUGGLE_BELOW = 50
/** A family is a strength in a term when its percent is at or above this. */
export const STRENGTH_FROM = 80
/** A pattern needs this many terms with data, in a row. */
export const MIN_TERMS = 3
/** A pattern may be followed by this many newer terms with data (listed in `since`). With more, it is not a candidate. */
export const MAX_SINCE = 2
/** Sources kept on each newer term in `since`. */
export const MAX_SINCE_SOURCES = 6
/** A family needs this many marks (or answers) in a term for that term to count. Fewer is "no data". */
export const MIN_POINTS = 3
/** Sources listed as evidence on one pattern. The rest are counted in `more`. */
export const MAX_EVIDENCE = 12
/** Places in the evidence list the run itself keeps (when it has that many sources), so newer results never crowd it out. */
export const MIN_RUN_EVIDENCE = 6

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

/** `struggle:fractions`. The key does not name the subject: a pattern is (subject, key), because the same family can exist in two subjects. */
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
  /**
   * The subject. Null or missing for notes and attendance (they belong to the learner, not to a subject), and for a marked piece an older
   * seed wrote, which counts as Mathematics.
   */
  subject?: string | null
  /** The file of past records the record came from (`learner_records.import_id`). Null or missing: not from a file. */
  importId?: string | null
  /** The row of that file. */
  sourceRow?: number | null
  /** The user who added the record (`learner_records.added_by`): a file, or one result typed by hand. Null or missing for the demo seed. */
  addedBy?: string | null
  /** The teacher who added the record (a file, or one result typed by hand). Missing for the demo seed. */
  addedByName?: string | null
}

/** A piece written into the records more than this many days after it happened is "logged late". */
export const LATE_AFTER_DAYS = 60
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * A record a teacher brought in through "Add past records": it came from a file (`import_id`) or was typed in by hand (`added_by`).
 * Such a record is written long after it happened by nature. The demo seed and the records of the term have neither.
 */
export const isBroughtIn = (r: Pick<LongViewRecord, 'importId' | 'addedBy' | 'addedByName'>): boolean => !!r.importId || !!r.addedBy || !!r.addedByName

/**
 * "Logged late": written into the records more than LATE_AFTER_DAYS after it happened, and NOT brought in (a record that was brought in
 * says where it came from instead). The screen and `get_learner_history` both ask here, so they keep one rule.
 */
export const isLoggedLate = (r: Pick<LongViewRecord, 'happenedOn' | 'loggedAt'> & Partial<Pick<LongViewRecord, 'importId' | 'addedBy' | 'addedByName'>>): boolean =>
  !isBroughtIn(r) && Date.parse(r.loggedAt) - Date.parse(r.happenedOn) > LATE_AFTER_DAYS * DAY_MS

/**
 * One marked answer of this year (from `question_results`). It takes its subject and grade from the class of the test it was written in
 * (not from the learner's current grade). Without a `subject` an answer counts as Mathematics. Its term is the calendar quarter of its date.
 */
export type LongViewResult = {
  id: string
  correct: boolean
  family: string
  isoDate: string
  label: string
  grade?: number
  subject?: string
  /** The class the test belongs to, so a link to the paper opens under the right class. */
  classId?: string | null
  /** Names that come from the data, kept so the word check can leave them alone: the test's title and the topic. */
  testTitle?: string | null
  topicName?: string | null
}

/** The rows `answersToResults` reads: this learner's marked answers, and what they hang from. */
export type AnswerSources = {
  answers: { id: string; paper_id: string; n: number; correct: boolean; topic_id: string | null }[]
  topics: { id: string; family: string; name: string }[]
  papers: { id: string; test_id: string | null; created_at: string }[]
  tests: { id: string; title: string; written_on: string | null; class_id: string }[]
  classes: { id: string; subject: string; grade: number }[]
  /** Homework has no test and so no class. It counts as Mathematics (the only subject a homework scan can be today) in this grade. */
  homeworkGrade: number
}
export type AnswerResult = LongViewResult & { paperId: string; n: number }

/**
 * This year's marked answers as results. An answer takes its strand from its topic and its date from its test (or its paper), and its
 * subject and grade from the CLASS of the test, not from the learner's current grade: a learner in two classes has answers in two subjects.
 * The tool and the screen both build their results here, so the two can never read an answer differently.
 */
export function answersToResults(src: AnswerSources): AnswerResult[] {
  const topic = new Map(src.topics.map((t) => [t.id, t]))
  const paper = new Map(src.papers.map((p) => [p.id, p]))
  const test = new Map(src.tests.map((t) => [t.id, t]))
  const klass = new Map(src.classes.map((c) => [c.id, c]))
  return src.answers.flatMap((a) => {
    const t = a.topic_id ? topic.get(a.topic_id) : undefined
    const p = paper.get(a.paper_id)
    if (!t?.family || !p) return []
    const made = p.test_id ? test.get(p.test_id) : undefined
    // A paper of a test the reader cannot see (another teacher's class) is left out: calling it homework would give it the wrong subject.
    if (p.test_id && !made) return []
    const c = made ? klass.get(made.class_id) : undefined
    const subject = c?.subject?.trim() ? canonicalSubject(c.subject) : DEFAULT_SUBJECT
    return [
      {
        id: a.id,
        correct: a.correct,
        // Read in its plain form: a map the model drafted says `numbers`, a record says `whole_numbers`, and they are one strand. The topic keeps its own word.
        family: canonicalFamily(subject, t.family),
        isoDate: made?.written_on ?? p.created_at,
        label: `${made?.title ?? 'Homework'}, question ${a.n}`,
        grade: c?.grade ?? src.homeworkGrade,
        subject,
        classId: c?.id ?? null,
        testTitle: made?.title ?? null,
        topicName: t.name,
        paperId: a.paper_id,
        n: a.n,
      },
    ]
  })
}

export type TableSource = { kind: 'record' | 'result'; id: string; label: string }
export type TableSlot = LongViewTerm & { sources: TableSource[] }
/** One strand of one subject. */
export type FamilyTable = { subject: string; family: string; slots: TableSlot[] }
export type NotCounted = { id: string; label: string; subject: string }

/** Marked pieces count. Notes and attendance never do. */
const MARKED = new Set<LongViewRecord['source']>(['quiz', 'assignment', 'project'])

/**
 * The subject of a record. A marked piece with no subject counts as Mathematics. A note or a term of attendance with none has no subject at all (null),
 * and belongs to every subject the learner has.
 */
export function recordSubject(r: Pick<LongViewRecord, 'source' | 'subject'>): string | null {
  const named = r.subject?.trim()
  return named ? canonicalSubject(named) : MARKED.has(r.source) ? DEFAULT_SUBJECT : null
}

/** The subject of an answer: its class's, or Mathematics when it has none. */
export const resultSubject = (r: Pick<LongViewResult, 'subject'>): string => (r.subject?.trim() ? canonicalSubject(r.subject) : DEFAULT_SUBJECT)

/** The subjects a learner has: every subject with marked work or answers, or a record that names one. Mathematics first, then the usual order. */
export function subjectsOf(records: LongViewRecord[], results: LongViewResult[]): string[] {
  const found = new Set<string>()
  for (const r of records) {
    const subject = recordSubject(r)
    if (subject) found.add(subject)
  }
  for (const r of results) found.add(resultSubject(r))
  return [...found].sort(compareSubjects)
}

/** The records that count for one subject: its own, and the notes and attendance, which have no subject and so belong to all of them. */
export function recordsForSubject(records: LongViewRecord[], subject: string): LongViewRecord[] {
  return records.filter((r) => {
    const own = recordSubject(r)
    return own === null || own === subject
  })
}

export function resultsForSubject(results: LongViewResult[], subject: string): LongViewResult[] {
  return results.filter((r) => resultSubject(r) === subject)
}

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
 * Marks by subject, family and term: the table of each subject (see `buildSubjectTable`), subjects in the usual order.
 * Two subjects never mix, even when they use the same strand name. A record with a family and no subject counts as Mathematics.
 */
export function buildTable(records: LongViewRecord[], results: LongViewResult[]): { table: FamilyTable[]; notCounted: NotCounted[] } {
  const table: FamilyTable[] = []
  const notCounted: NotCounted[] = []
  for (const subject of subjectsOf(records, results)) {
    const one = buildSubjectTable(recordsForSubject(records, subject), resultsForSubject(results, subject), subject)
    table.push(...one.table.map((f) => ({ subject, ...f })))
    notCounted.push(...one.notCounted.map((n) => ({ ...n, subject })))
  }
  return { table, notCounted }
}

/**
 * Marks by family and term, for the records and answers of ONE subject.
 * - From records: only quizzes, assignments and projects with a family, marks and out of, and a clear quality.
 *   Percent is summed marks over summed out of (rounded), points is summed out of.
 * - From current results: percent is the share of right answers, points is the number of answers.
 * - A record whose quality is 'unclear' never counts. It comes back in `notCounted` with its label.
 * - A term where a family has fewer than MIN_POINTS is left out for that family: "no data".
 * A record's family is read in its plain form (`canonicalFamily`), so `numbers` and `whole_numbers` are one row. The record itself is not changed.
 * Families come back in alphabetical order and terms oldest first.
 */
export function buildSubjectTable(
  records: LongViewRecord[],
  results: LongViewResult[],
  subject: string = DEFAULT_SUBJECT,
): { table: Omit<FamilyTable, 'subject'>[]; notCounted: { id: string; label: string }[] } {
  const items: Item[] = []
  const notCounted: { id: string; label: string }[] = []
  for (const r of records) {
    if (!MARKED.has(r.source)) continue
    if (r.quality === 'unclear') {
      notCounted.push({ id: r.id, label: recordLabel(r) })
      continue
    }
    if (!r.family || r.marks === null || r.outOf === null || r.outOf <= 0 || r.marks < 0 || r.marks > r.outOf) continue
    items.push({ family: canonicalFamily(subject, r.family), slot: r, grade: r.grade, got: r.marks, of: r.outOf, date: r.happenedOn, source: { kind: 'record', id: r.id, label: recordLabel(r) } })
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

  const table = [...byFamily]
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

/** The run of terms that all meet the same kind, ending at `slots[end]`, longest first extended backwards. */
function runEndingAt(slots: TableSlot[], end: number, kind: LongViewKind): TableSlot[] {
  let start = end
  while (start > 0 && kindOfPercent(slots[start - 1]!.percent) === kind) start--
  return slots.slice(start, end + 1)
}

/**
 * The strengths and struggles that hold across terms. Per family, from its terms with data in order, a candidate is a run of
 * MIN_TERMS or more terms in a row in which every term is below STRUGGLE_BELOW (a struggle) or at or above STRENGTH_FROM (a strength).
 * The run may be followed by 0, 1 or MAX_SINCE (2) newer terms with data. Those newer terms did not continue it (a struggle was
 * followed by something better, a strength by something weaker, or a better term was followed by another weak one): they come back
 * oldest first as `since`, so the pattern is still shown with the newer results beside it. The run that ends nearest the latest
 * term wins. With 3 or more newer terms with data, the pattern is not a candidate.
 * A pattern belongs to one subject. The strands of two subjects are never put together, so the same family name in two subjects gives two patterns.
 * Terms with no data inside the run's span are skipped, never guessed, and are listed in `missingTerms`.
 */
export function findPatterns(table: FamilyTable[]): PatternCandidate[] {
  const out: PatternCandidate[] = []
  for (const { subject, family, slots } of [...table].sort((a, b) => compareSubjects(a.subject, b.subject) || a.family.localeCompare(b.family))) {
    const ordered = [...slots].sort(compareSlots)
    const latest = ordered.length - 1

    let run: TableSlot[] = []
    let kind: LongViewKind | null = null
    let newer: TableSlot[] = []
    for (let skipped = 0; skipped <= MAX_SINCE && !kind && latest - skipped >= 0; skipped++) {
      const end = latest - skipped
      const endsWith = kindOfPercent(ordered[end]!.percent)
      if (!endsWith) continue
      const candidateRun = runEndingAt(ordered, end, endsWith)
      if (candidateRun.length < MIN_TERMS) continue
      run = candidateRun
      kind = endsWith
      newer = ordered.slice(end + 1)
    }
    if (!kind) continue

    // Newest first: the newer results (newest term first), then the run. The run keeps at least MIN_RUN_EVIDENCE places when it has that many sources.
    const runSources: LongViewEvidence[] = [...run].reverse().flatMap((s) => s.sources)
    const newerSources: LongViewEvidence[] = [...newer].reverse().flatMap((s) => s.sources.slice(0, MAX_SINCE_SOURCES))
    const evidence = [...newerSources.slice(0, MAX_EVIDENCE - Math.min(runSources.length, MIN_RUN_EVIDENCE)), ...runSources].slice(0, MAX_EVIDENCE)
    const total = newer.reduce((n, s) => n + s.sources.length, 0) + runSources.length
    const candidate: PatternCandidate = {
      key: patternKey(kind, family),
      kind,
      subject,
      family,
      terms: run.map(({ grade, year, term, percent, points }) => ({ grade, year, term, percent, points })),
      evidence,
      missingTerms: missingSlots(run),
      since: newer.map(({ grade, year, term, percent, points, sources }) => ({ grade, year, term, percent, points, sources: sources.slice(0, MAX_SINCE_SOURCES) })),
    }
    if (total > evidence.length) candidate.more = total - evidence.length
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

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * The banned words found in `text`, each once, in the order they first appear. Case-insensitive.
 * `exempt` are names that come from the data (the subject, a strand, a topic, the title of a piece of work). Each is taken out of the
 * text, whole and in any case, before the check, so a topic called "Rank and file" or a quiz called "Track and field" never drops a pattern.
 * A name that is itself a banned word is not exempt: "Track" as a topic would otherwise hide "on track".
 */
export function bannedWords(text: string, exempt: readonly string[] = []): string[] {
  const names = [...new Set(exempt.map((n) => n.trim()).filter((n) => n && !BANNED_WORDS.some((w) => w === n.toLowerCase())))].sort((a, b) => b.length - a.length)
  const clean = names.reduce((out, name) => out.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(name)}(?![\\p{L}\\p{N}])`, 'giu'), ' '), text)
  return BANNED_PATTERNS.flatMap(({ word, re }) => {
    const hit = re.exec(clean)
    return hit ? [{ word, at: hit.index }] : []
  })
    .sort((a, b) => a.at - b.at)
    .map((h) => h.word)
}
