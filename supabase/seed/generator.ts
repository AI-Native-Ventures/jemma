// Made-up learners and their history, for the demo school and for "Add made-up learners". Code only, no model.
// Deterministic: the same input gives the same rows. The only randomness is a small seeded function in this file (never Math.random),
// and the only date is the `year` the caller passes (never the clock).
//
// The records are built to be realistically messy, on purpose, in every batch of six or more learners:
// two terms missing (was at another school), a result logged months late, a term with fewer than three marks in a strand,
// attendance gaps, one record that is hard to read, one exact duplicate, two teacher notes that disagree,
// and a different teacher name each year. About half the learners carry ONE planted pattern (a strength or a struggle that holds
// in one strand for three terms or more); the rest carry none, or noise that must not become a pattern.
// The planted patterns come back with the learners, so a test can compare them with what the pattern finder finds.
import { subjectProfile } from '../../packages/profiling/src/ai/subject-profile'
import { canonicalSubject, strandLabel, strandOrder } from '../../packages/profiling/src/logic/strands'

export type MessKind = 'missing_terms' | 'late_result' | 'thin_term' | 'attendance_gaps' | 'unclear' | 'duplicate' | 'notes_disagree'

/** A row of `learner_records` without its school and child. */
export type MadeRecord = {
  source: 'quiz' | 'assignment' | 'project' | 'note' | 'attendance'
  grade: number
  year: number
  term: number
  /** YYYY-MM-DD */
  happened_on: string
  /** ISO timestamp */
  logged_at: string
  teacher_name: string
  title: string
  subject: string | null
  family: string | null
  topic_name: string | null
  marks: number | null
  out_of: number | null
  quality: 'clear' | 'unclear'
  text: string | null
  present: number | null
  total: number | null
}

export type SlotRef = { grade: number; year: number; term: number }

/** A strength or struggle that holds in one strand, as planted. `run` is the terms it holds in, oldest first; `since` is how many newer terms did not continue it. */
export type PlantedPattern = { subject: string; family: string; kind: 'strength' | 'struggle'; run: SlotRef[]; since: number }

export type MadeLearner = {
  firstName: string
  /** The grade of the class the learner was made for. */
  grade: number
  records: MadeRecord[]
  planted: PlantedPattern | null
  mess: MessKind[]
}

export type MadeBatch = { learners: MadeLearner[]; planted: (PlantedPattern & { firstName: string })[] }

export type MakeLearnersInput = {
  /** The subject of the class. Its strands carry the planted patterns. */
  subject: string
  /** The class's grade, 1 to 12. */
  grade: number
  /** The class year (the current school year). Records go back up to two years from it. */
  year: number
  count: number
  seed: string | number
  /** The strand families of the class's subject. Empty means the neutral three. */
  families: readonly string[]
  /** Who taught them, oldest first; the last is the class teacher. Years further back than the list reuse its first name. */
  teacherNames: readonly string[]
  /** First names to leave out (learners already in the class). */
  avoidNames?: readonly string[]
  /** Exact first names to use, in order (the five learners of 6B). Without it the names come from the list. `count` is then the length of this list. */
  names?: readonly string[]
  /** The subjects to make records for. Without it: the class's subject and up to two others. */
  subjects?: readonly string[]
  /**
   * Marked work only: no notes, no attendance, none of the messy extras. For learners who already have those from somewhere else
   * (the five learners of 6B, whose notes and attendance are in their Mathematics history).
   */
  marksOnly?: boolean
  /** A planted pattern asked for by position (null: none). Without an entry the usual rule decides (about half the learners). */
  plant?: readonly (PlantRequest | null | undefined)[]
  /** Terms (positions in the list `slotsFor` gives) with nothing at all, by position: a learner who was at another school. */
  away?: readonly (readonly number[] | undefined)[]
}

export type PlantRequest = { subject?: string; family: string; kind: 'strength' | 'struggle'; since?: 0 | 1 }

/** The strands of a subject nothing else is known about. */
export const NEUTRAL_FAMILIES = ['knowledge', 'skills', 'application'] as const

/**
 * The strand families to make records for: the class's approved topic map if it has any, else the usual strands of the subject, else
 * the families the jobs suggest for it, else three neutral ones.
 */
export function familiesFor(subject: string, fromMap?: readonly string[] | null): string[] {
  const mapped = [...new Set((fromMap ?? []).filter(Boolean))]
  if (mapped.length > 0) return mapped
  const usual = strandOrder(subject)
  if (usual.length > 0) return usual
  const suggested = subjectProfile(subject).families
  if (suggested && suggested.length > 0) return [...suggested]
  return [...NEUTRAL_FAMILIES]
}

// ---------- a seeded random function ----------

function hashText(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

/** Mulberry32: a small, fast generator. Returns numbers in [0, 1). */
function rng(seed: string): () => number {
  let a = hashText(seed)
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Rand = () => number
const int = (r: Rand, min: number, max: number) => min + Math.floor(r() * (max - min + 1))
const pick = <T>(r: Rand, list: readonly T[]): T => list[Math.floor(r() * list.length)]!

// ---------- first names ----------

/** Made-up first names used across Africa. No surnames, and none of the five learners of 6B. */
export const FIRST_NAMES = [
  'Ayodele', 'Zanele', 'Kofi', 'Imani', 'Tendai', 'Nia', 'Sibusiso', 'Folake', 'Kwame', 'Lindiwe',
  'Chidi', 'Wanjiru', 'Themba', 'Ama', 'Oluwaseun', 'Nomvula', 'Kagiso', 'Adaeze', 'Baraka', 'Zodwa',
  'Tafara', 'Efua', 'Mandla', 'Halima', 'Jabari', 'Thandiwe', 'Kelechi', 'Rutendo', 'Sizwe', 'Makena',
  'Emeka', 'Palesa', 'Yaw', 'Busisiwe', 'Tunde', 'Naomi', 'Lwazi', 'Chipo', 'Kamau', 'Aisha',
  'Mpho', 'Ifeoma', 'Bongani', 'Nyokabi', 'Thabiso', 'Abena', 'Tapiwa', 'Amara', 'Sanele', 'Juma',
  'Fatuma', 'Kudzai', 'Obinna', 'Neo', 'Zuri', 'Khanyi', 'Kibet', 'Esi', 'Dumisani', 'Wangari',
] as const

// ---------- terms ----------

/** Three school years back at most: Grade g-2 and g-1 (terms 1 to 4) and Grade g (terms 1 and 2). A Grade 1 class has only its own year. */
export function slotsFor(grade: number, year: number): SlotRef[] {
  const out: SlotRef[] = []
  for (let back = Math.min(2, grade - 1); back >= 0; back--) {
    for (const term of back === 0 ? [1, 2] : [1, 2, 3, 4]) out.push({ grade: grade - back, year: year - back, term })
  }
  return out
}

const pad = (n: number) => String(n).padStart(2, '0')
const DAY_MS = 24 * 60 * 60 * 1000

function dayInTerm(r: Rand, year: number, term: number): string {
  const month = (term - 1) * 3 + 1 + int(r, 0, 2)
  return `${year}-${pad(month)}-${pad(int(r, 4, 23))}`
}

function loggedAfter(day: string, days: number): string {
  return new Date(Date.parse(`${day}T12:00:00Z`) + days * DAY_MS).toISOString()
}

// ---------- what is taught ----------

const TOPICS: Record<string, Record<string, string[]>> = {
  mathematics: {
    whole_numbers: ['Place value', 'Addition and subtraction', 'Multiplication facts', 'Long division'],
    fractions: ['Equivalent fractions', 'Adding fractions', 'Comparing fractions', 'Fractions of a quantity'],
    decimals: ['Reading decimals', 'Adding decimals', 'Decimals and money'],
    shapes: ['Naming shapes', 'Angles', 'Symmetry', 'Shapes around school'],
    measurement: ['Length and mass', 'Telling time', 'Capacity', 'Perimeter'],
    data: ['Tally charts', 'Bar graphs', 'Reading pictograms'],
  },
  english: {
    reading: ['A short story', 'Finding the main idea', 'Reading a poem', 'Facts and opinions'],
    writing: ['A paragraph about my week', 'A letter to a friend', 'Describing a place', 'Planning a story'],
    language: ['Verbs and tenses', 'Spelling rules', 'Punctuation', 'Word meanings'],
    speaking_listening: ['A short talk', 'Listening for details', 'Telling a story aloud'],
  },
  'natural sciences': {
    life_living: ['Plants and animals', 'The human body', 'Habitats', 'Food chains'],
    matter_materials: ['Solids, liquids and gases', 'Mixtures', 'Heating and cooling', 'Materials around us'],
    energy_change: ['Light and shadow', 'Sound', 'Electric circuits', 'Moving things'],
    earth_beyond: ['Day and night', 'The seasons', 'Rocks and soil', 'The solar system'],
  },
}

function topicsOf(subject: string, family: string): string[] {
  const table = TOPICS[subject.trim().toLowerCase()]?.[family]
  return table ?? [strandLabel(subject, family)]
}

type Kind = 'q' | 'a' | 'p'
const SOURCE = { q: 'quiz', a: 'assignment', p: 'project' } as const
const SOURCE_TITLE = { q: 'Quiz', a: 'Assignment', p: 'Project' } as const
/** Marks out of, by kind. Every percent used is a multiple of 5, so the marks are whole numbers. */
const OUT_OF = { q: 20, a: 20, p: 40 } as const

/** The subjects every learner may have records in, besides the class's own. */
const OTHER_SUBJECTS = ['Mathematics', 'English', 'Natural Sciences'] as const

const NEUTRAL = [55, 60, 65, 70, 75] as const
const DIPS = [30, 35, 40, 45] as const
const HIGHS = [80, 85, 90] as const
const STRUGGLES = [25, 30, 35, 40, 45] as const
const STRENGTHS = [80, 85, 90, 95] as const

type Extreme = 'low' | 'high' | null
const extremeOf = (percent: number): Extreme => (percent < 50 ? 'low' : percent >= 80 ? 'high' : null)

/**
 * The percents of a strand, term by term, for the terms it has data in. Mostly in the middle, with single weak or strong terms. Never
 * three of the same extreme in a row among the terms that have data, so noise cannot become a pattern.
 */
function noiseSequence(r: Rand, count: number): number[] {
  const out: number[] = []
  for (let i = 0; i < count; i++) {
    const a = extremeOf(out[i - 1] ?? 50)
    const b = extremeOf(out[i - 2] ?? 50)
    const chance = r()
    let wanted: number = pick(r, NEUTRAL)
    if (chance < 0.14) wanted = pick(r, DIPS)
    else if (chance < 0.24) wanted = pick(r, HIGHS)
    // A third extreme of the same kind in a row is never allowed.
    if (extremeOf(wanted) !== null && a === extremeOf(wanted) && b === a) wanted = pick(r, NEUTRAL)
    out.push(wanted)
  }
  return out
}

type Piece = { subject: string; family: string; slot: number; percent: number; kind: Kind; unclear?: boolean; tiny?: boolean }

const NOTES = [
  'Works well in a group and shares ideas.',
  'Finishes tasks on time and checks the work.',
  'Needs a reminder to start, then works steadily.',
  'Asks good questions when something is unclear.',
  'Takes care with presentation.',
  'Helps others at the table.',
] as const

/** One learner's records, from the slots and the mess this learner carries. */
function oneLearner(input: {
  index: number
  firstName: string
  subject: string
  subjects: readonly string[]
  families: readonly string[]
  slots: SlotRef[]
  classYear: number
  teacherNames: readonly string[]
  seed: string
  marksOnly: boolean
  plant: PlantRequest | null | undefined
  away: readonly number[]
}): MadeLearner {
  const { index, subject, subjects, families, slots, classYear, teacherNames, marksOnly } = input
  const r = rng(`${input.seed}|learner|${index}`)
  const mess: MessKind[] = []
  const kinds = ['missing_terms', 'late_result', 'thin_term', 'attendance_gaps', 'unclear', 'duplicate'] as const
  const carries: (typeof kinds)[number] | null = marksOnly ? null : kinds[index % kinds.length]!
  const familiesOf = (s: string) => (s === subject ? [...families] : familiesFor(s))
  const last = slots.length - 1

  // Terms with nothing at all: a learner who was at another school for two terms (or the terms the caller names).
  const gone = new Set<number>(input.away.filter((i) => i >= 0 && i <= last))
  if (carries === 'missing_terms' && slots.length >= 6) {
    gone.add(2)
    gone.add(3)
    mess.push('missing_terms')
  }
  const available = slots.map((_, i) => i).filter((i) => !gone.has(i))

  // The planted pattern: half the learners (or the ones the caller names), in one strand, in the newest terms that have records.
  let planted: PlantedPattern | null = null
  let plantSubject = subject
  let plantFamily = ''
  let runSlots = new Set<number>()
  let runEnd = last
  const wanted: PlantRequest | null =
    input.plant !== undefined
      ? input.plant
      : index % 2 === 0
        ? { family: families[(Math.floor(index / 2) + int(r, 0, 1)) % families.length]!, kind: Math.floor(index / 2) % 2 === 0 ? 'struggle' : 'strength' }
        : null
  if (wanted && available.length >= 3) {
    plantSubject = wanted.subject ? canonicalSubject(wanted.subject) : subject
    plantFamily = wanted.family
    const since = wanted.since ?? (available.length >= 8 && r() < 0.35 ? 1 : 0)
    const length = Math.min(int(r, 3, 4), available.length - since)
    const endAt = available.length - 1 - since
    const run = available.slice(endAt - length + 1, endAt + 1)
    runSlots = new Set(run)
    runEnd = endAt >= 0 ? available[endAt]! : last
    planted = { subject: plantSubject, family: plantFamily, kind: wanted.kind, run: run.map((i) => slots[i]!), since }
  }
  const inRun = (slot: number) => runSlots.has(slot)

  // Which strands have data in which terms, and their percents.
  const pieces: Piece[] = []
  for (const s of subjects) {
    for (const family of familiesOf(s)) {
      const isPlanted = planted !== null && s === plantSubject && family === plantFamily
      const chance = isPlanted ? 1 : s === subject ? 0.65 : 0.4
      const present = available.filter((i) => isPlanted || r() < chance)
      const noise = noiseSequence(r, present.length)
      present.forEach((slot, k) => {
        const percent = isPlanted && inRun(slot) ? pick(r, planted!.kind === 'struggle' ? STRUGGLES : STRENGTHS) : isPlanted ? pick(r, NEUTRAL) : noise[k]!
        const roll = r()
        pieces.push({ subject: s, family, slot, percent, kind: roll < 0.5 ? 'q' : roll < 0.85 ? 'a' : 'p' })
      })
    }
  }

  // Mess that adds a piece: it must not change what the counted marks say.
  const isPlantedStrand = (p: Pick<Piece, 'subject' | 'family'>) => planted !== null && p.subject === plantSubject && p.family === plantFamily
  const noisy = pieces.filter((p) => !isPlantedStrand(p))
  let lateIndex = -1
  let duplicate: Piece | null = null
  if (carries === 'late_result' && noisy.length > 0) {
    lateIndex = pieces.indexOf(noisy[Math.min(noisy.length - 1, Math.floor(noisy.length / 2))]!)
    mess.push('late_result')
  }
  if (carries === 'thin_term') {
    // A strand with a single two-mark check in a term where it has nothing else: fewer than three marks, so no data that term.
    const open: { subject: string; family: string; slot: number }[] = []
    for (const s of subjects) {
      for (const family of familiesOf(s)) {
        if (planted !== null && s === plantSubject && family === plantFamily) continue
        for (let slot = 0; slot < slots.length; slot++) {
          if (!gone.has(slot) && !pieces.some((p) => p.subject === s && p.family === family && p.slot === slot)) open.push({ subject: s, family, slot })
        }
      }
    }
    if (open.length > 0) {
      const at = open[Math.floor(open.length / 2)]!
      pieces.push({ ...at, percent: 50, kind: 'q', tiny: true })
      mess.push('thin_term')
    }
  }
  if (carries === 'unclear' && noisy.length > 0) {
    const host = noisy[Math.floor(noisy.length / 3)]!
    pieces.push({ subject: host.subject, family: host.family, slot: host.slot, percent: pick(r, [10, 15, 20, 25]), kind: 'a', unclear: true })
    mess.push('unclear')
  }
  if (carries === 'duplicate' && noisy.length > 0) {
    duplicate = noisy[Math.floor(noisy.length / 2)]!
    mess.push('duplicate')
  }

  // Rows.
  const teacherFor = (year: number) => teacherNames[Math.max(0, teacherNames.length - 1 - (classYear - year))] ?? teacherNames[0] ?? 'Teacher'
  const records: MadeRecord[] = []
  const used = new Set<string>()
  const rowOf = (p: Piece, seq: number): MadeRecord => {
    const slot = slots[p.slot]!
    const topics = topicsOf(p.subject, p.family)
    const topic = topics[(p.slot + seq) % topics.length]!
    const day = dayInTerm(r, slot.year, slot.term)
    const outOf = p.tiny ? 2 : OUT_OF[p.kind]
    const marks = p.tiny ? 1 : Math.round((p.percent * outOf) / 100)
    return {
      source: SOURCE[p.kind], grade: slot.grade, year: slot.year, term: slot.term, happened_on: day, logged_at: loggedAfter(day, int(r, 1, 7)),
      teacher_name: teacherFor(slot.year), title: `${SOURCE_TITLE[p.kind]}: ${topic}`, subject: p.subject, family: p.family, topic_name: topic,
      marks, out_of: outOf, quality: p.unclear ? 'unclear' : 'clear', text: p.unclear ? 'Marks hard to read on the page.' : null, present: null, total: null,
    }
  }
  pieces.forEach((p, i) => {
    const row = rowOf(p, i)
    // One term cannot hold the same title twice for the same strand, except for the duplicate this learner is meant to carry.
    const key = `${row.subject}|${row.family}|${row.year}|${row.term}|${row.title}`
    if (used.has(key) && p !== duplicate) row.title = `${row.title} (2)`
    used.add(key)
    if (i === lateIndex) row.logged_at = loggedAfter(row.happened_on, int(r, 100, 170))
    records.push(row)
    if (p === duplicate) records.push({ ...row })
  })

  // Attendance: a row for each term, but not for every learner and every term.
  const dropAttendance = new Set<number>()
  let lowTerm = -1
  if (carries === 'attendance_gaps') {
    dropAttendance.add(Math.max(0, last - 3))
    dropAttendance.add(Math.max(0, last - 5))
    lowTerm = Math.max(0, last - 1)
    mess.push('attendance_gaps')
  }
  slots.forEach((slot, i) => {
    if (marksOnly || gone.has(i) || dropAttendance.has(i)) return
    const total = int(r, 55, 60)
    const present = i === lowTerm ? int(r, 28, 36) : total - int(r, 0, 5)
    const day = `${slot.year}-${pad(slot.term * 3)}-${pad(int(r, 10, 19))}`
    records.push({
      source: 'attendance', grade: slot.grade, year: slot.year, term: slot.term, happened_on: day, logged_at: loggedAfter(day, int(r, 1, 7)),
      teacher_name: teacherFor(slot.year), title: `Attendance, term ${slot.term}`, subject: null, family: null, topic_name: null, marks: null, out_of: null,
      quality: 'clear', text: null, present, total,
    })
  })

  // Teacher notes: about one every third term, from the teacher of that year. Two that disagree for the learner who carries them.
  const note = (slotIndex: number, text: string): MadeRecord => {
    const slot = slots[slotIndex]!
    const day = dayInTerm(r, slot.year, slot.term)
    return {
      source: 'note', grade: slot.grade, year: slot.year, term: slot.term, happened_on: day, logged_at: loggedAfter(day, int(r, 1, 7)),
      teacher_name: teacherFor(slot.year), title: `Teacher note, term ${slot.term}`, subject: null, family: null, topic_name: null, marks: null, out_of: null,
      quality: 'clear', text, present: null, total: null,
    }
  }
  slots.forEach((_, i) => {
    if (marksOnly || gone.has(i) || (i + index) % 3 !== 0) return
    records.push(note(i, pick(r, NOTES)))
  })
  if (planted !== null && !marksOnly) {
    const at = runEnd
    const label = strandLabel(plantSubject, planted.family).toLowerCase()
    records.push(
      note(at, planted.kind === 'struggle' ? `Finds ${label} hard and asks to see a worked example first.` : `Does well in ${label} and likes to explain it to others.`),
    )
  }
  if (!marksOnly && index % kinds.length === 3) {
    const slotIndex = Math.max(0, last - 2)
    const family = noisy.length > 0 ? noisy[0]!.family : families[0]!
    const label = strandLabel(subject, family).toLowerCase()
    records.push(note(slotIndex, `Confident in ${label} and answers questions aloud.`), note(slotIndex, `Unsure in ${label} and avoids explaining it aloud.`))
    mess.push('notes_disagree')
  }

  return { firstName: input.firstName, grade: slots[last]!.grade, records, planted, mess }
}

/** The learners for one class: their first names, records in the class's subject and up to two others, and the patterns planted in them. */
export function makeLearners(input: MakeLearnersInput): MadeBatch {
  const subject = canonicalSubject(input.subject)
  const families = input.families.length > 0 ? [...input.families] : [...NEUTRAL_FAMILIES]
  const slots = slotsFor(input.grade, input.year)
  const seed = `${input.seed}|${subject}|${input.grade}|${input.year}`
  const teacherNames = input.teacherNames.length > 0 ? input.teacherNames : ['Teacher']
  const subjects = (input.subjects?.length ? input.subjects : [subject, ...OTHER_SUBJECTS.filter((s) => s !== subject).slice(0, 2)]).map(canonicalSubject)
  let names: string[]
  if (input.names) {
    names = [...input.names]
  } else {
    const taken = new Set((input.avoidNames ?? []).map((n) => n.trim().toLowerCase()))
    // The names, in an order that depends only on the seed.
    const order = [...FIRST_NAMES]
    const nameRand = rng(`${seed}|names`)
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(nameRand() * (i + 1))
      ;[order[i], order[j]] = [order[j]!, order[i]!]
    }
    names = order.filter((n) => !taken.has(n.toLowerCase()))
    if (names.length < input.count) throw new Error(`generator: only ${names.length} first names left for ${input.count} learners`)
  }
  const count = input.names ? input.names.length : input.count

  const learners = Array.from({ length: count }, (_, index) =>
    oneLearner({
      index, firstName: names[index]!, subject, subjects, families, slots, classYear: input.year, teacherNames, seed,
      marksOnly: input.marksOnly ?? false, plant: input.plant ? input.plant[index] : undefined, away: input.away?.[index] ?? [],
    }),
  )
  return { learners, planted: learners.flatMap((l) => (l.planted ? [{ ...l.planted, firstName: l.firstName }] : [])) }
}
