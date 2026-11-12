// The Long view fixture: three school years of made-up records for the five learners of Hillview Primary.
// Grade 4 is the class year minus 2, Grade 5 the class year minus 1 (terms 1 to 4 each), Grade 6 the class year (terms 1 and 2).
// Nothing here depends on today's date, only on the class year, so the same text reaches the model in every sandbox.
//
// What the data is built to show (supabase/test/long-view.seed.test.ts asserts it through findPatterns):
// - Amina: a struggle in fractions that holds from Grade 5 Term 3 to Grade 6 Term 2 (the term before it was fine),
//   a strength in shapes (one term has no shapes work), and a Grade 5 note about guessing when the bottom numbers differ.
// - Thabo: no records at all for Grade 5 Terms 2 and 3 (he was at another school) and a strength in data that holds across the terms that exist.
// - Lerato: a strength in whole numbers, and a Grade 5 Term 3 quiz that was written into the records five months late. It still counts.
// - Sipho: low fractions marks, but two of the three are unclear handwriting, so Jemma counts only one and finds no pattern.
// - Naledi: a struggle in measurement over three terms, and two terms of poor attendance.

export const LONG_HISTORY_CHILDREN = ['amina', 'thabo', 'lerato', 'sipho', 'naledi'] as const
export type LongHistoryChild = (typeof LONG_HISTORY_CHILDREN)[number]

export type LongHistoryRow = {
  child: LongHistoryChild
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
  /** Mathematics on every marked piece. Notes and attendance belong to the learner, not to a subject, so they have none. */
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

export const FAMILIES = ['whole_numbers', 'fractions', 'decimals', 'shapes', 'measurement', 'data'] as const
type Family = (typeof FAMILIES)[number]

const TOPICS: Record<Family, string[]> = {
  whole_numbers: ['Place value', 'Addition and subtraction', 'Multiplication facts', 'Long division'],
  fractions: ['Equivalent fractions', 'Adding fractions', 'Comparing fractions', 'Fractions of a quantity'],
  decimals: ['Reading decimals', 'Adding decimals', 'Decimals and money'],
  shapes: ['Naming shapes', 'Angles', 'Symmetry', 'Shapes around school'],
  measurement: ['Length and mass', 'Telling time', 'Capacity', 'Perimeter'],
  data: ['Tally charts', 'Bar graphs', 'Reading pictograms'],
}

type Kind = 'q' | 'a' | 'p'
const SOURCE = { q: 'quiz', a: 'assignment', p: 'project' } as const
const SOURCE_TITLE = { q: 'Quiz', a: 'Assignment', p: 'Project' } as const
/** Marks out of, by kind. Every percent below is a multiple of 5, so the marks are whole numbers. */
const OUT_OF = { q: 20, a: 20, p: 40 } as const

/** One marked piece: family, kind, percent. `'unclear'` marks handwriting nobody could read clearly. `'late'` is written into the records five months late. */
type Piece = readonly [Family, Kind, number, ('unclear' | 'late')?]

/** The ten terms: Grade 4 terms 1 to 4, Grade 5 terms 1 to 4, Grade 6 terms 1 and 2. */
const SLOTS = [
  { grade: 4, back: 2, term: 1 }, { grade: 4, back: 2, term: 2 }, { grade: 4, back: 2, term: 3 }, { grade: 4, back: 2, term: 4 },
  { grade: 5, back: 1, term: 1 }, { grade: 5, back: 1, term: 2 }, { grade: 5, back: 1, term: 3 }, { grade: 5, back: 1, term: 4 },
  { grade: 6, back: 0, term: 1 }, { grade: 6, back: 0, term: 2 },
] as const

type Plan = {
  /** Marked pieces for each of the ten terms. `null` means nothing at all was recorded that term. */
  pieces: (Piece[] | null)[]
  /** Days present and school days, for each term. `null` where there is nothing. */
  attendance: ([number, number] | null)[]
  notes: { slot: number; text: string }[]
}

const PLANS: Record<LongHistoryChild, Plan> = {
  amina: {
    pieces: [
      [['whole_numbers', 'q', 70], ['measurement', 'a', 65]],
      [['whole_numbers', 'q', 75], ['shapes', 'q', 70]],
      [['fractions', 'q', 70], ['whole_numbers', 'a', 75]],
      [['fractions', 'q', 60], ['shapes', 'a', 85], ['data', 'q', 70]],
      [['shapes', 'q', 90], ['fractions', 'a', 65], ['decimals', 'q', 60]],
      [['shapes', 'a', 90], ['fractions', 'q', 55]],
      [['fractions', 'a', 40], ['whole_numbers', 'q', 75]],
      [['fractions', 'q', 35], ['shapes', 'p', 85], ['decimals', 'a', 60]],
      [['fractions', 'a', 30], ['shapes', 'q', 90], ['whole_numbers', 'p', 70]],
      [['fractions', 'q', 40], ['shapes', 'a', 95], ['measurement', 'q', 65]],
    ],
    attendance: [[55, 58], [54, 58], [56, 60], [53, 57], [55, 58], [56, 59], [54, 58], [55, 58], [56, 59], [52, 56]],
    notes: [
      { slot: 2, text: 'Enjoys drawing and naming shapes. Likes to talk her ideas through with a partner.' },
      { slot: 4, text: 'Draws shapes carefully and explains angles to others.' },
      { slot: 6, text: 'Adds fractions well when the bottom numbers are the same. When they differ she guesses instead of finding a common bottom number.' },
      { slot: 8, text: 'Keeps trying when she is stuck. Asks to see a worked example first.' },
    ],
  },
  thabo: {
    pieces: [
      [['whole_numbers', 'q', 60], ['measurement', 'q', 55]],
      [['whole_numbers', 'a', 65], ['fractions', 'q', 60]],
      [['data', 'q', 85], ['whole_numbers', 'q', 60]],
      [['data', 'a', 90], ['decimals', 'q', 55]],
      [['data', 'q', 85], ['fractions', 'a', 65], ['measurement', 'p', 55]],
      null,
      null,
      [['data', 'q', 90], ['whole_numbers', 'a', 65]],
      [['data', 'a', 95], ['fractions', 'q', 60], ['whole_numbers', 'q', 65]],
      [['data', 'q', 85], ['measurement', 'a', 55]],
    ],
    attendance: [[54, 58], [55, 58], [53, 60], [54, 57], [52, 58], null, null, [50, 58], [53, 59], [51, 56]],
    notes: [
      { slot: 2, text: 'Reads graphs and tables quickly and likes to explain what they show.' },
      { slot: 7, text: 'Back with us after two terms at another school. Needs a little time to settle in.' },
      { slot: 8, text: 'Has settled well. Often helps others read their graphs.' },
    ],
  },
  lerato: {
    pieces: [
      [['whole_numbers', 'q', 75], ['shapes', 'q', 65]],
      [['whole_numbers', 'a', 85], ['decimals', 'q', 60]],
      [['whole_numbers', 'q', 85], ['fractions', 'a', 65]],
      [['whole_numbers', 'q', 90], ['measurement', 'a', 60], ['data', 'q', 70]],
      [['whole_numbers', 'a', 90], ['shapes', 'q', 70]],
      [['whole_numbers', 'q', 85], ['decimals', 'a', 55]],
      [['whole_numbers', 'q', 85, 'late'], ['measurement', 'q', 60]],
      [['whole_numbers', 'a', 95], ['fractions', 'q', 60], ['decimals', 'p', 60]],
      [['whole_numbers', 'q', 90], ['shapes', 'a', 70]],
      [['whole_numbers', 'a', 90], ['measurement', 'q', 65]],
    ],
    attendance: [[56, 58], [55, 58], [57, 60], [55, 57], [56, 58], [57, 59], [55, 58], [56, 58], [57, 59], [54, 56]],
    notes: [
      { slot: 1, text: 'Confident with number work and likes to check her answers twice.' },
      { slot: 5, text: 'Finishes number work early and helps the table next to her.' },
      { slot: 8, text: 'Asks for harder number puzzles.' },
    ],
  },
  sipho: {
    pieces: [
      [['whole_numbers', 'q', 65], ['decimals', 'q', 55]],
      [['whole_numbers', 'a', 60], ['shapes', 'q', 65]],
      [['whole_numbers', 'q', 70], ['measurement', 'q', 60]],
      [['whole_numbers', 'a', 65], ['decimals', 'q', 60], ['data', 'q', 55]],
      [['shapes', 'a', 70], ['whole_numbers', 'q', 60]],
      [['whole_numbers', 'p', 65], ['measurement', 'a', 55]],
      [['decimals', 'q', 60], ['data', 'q', 65]],
      [['fractions', 'q', 30], ['whole_numbers', 'a', 65]],
      [['fractions', 'q', 10, 'unclear'], ['decimals', 'a', 60], ['shapes', 'q', 65]],
      [['fractions', 'a', 15, 'unclear'], ['whole_numbers', 'q', 65]],
    ],
    attendance: [[53, 58], [54, 58], [52, 60], [53, 57], [54, 58], [52, 59], [53, 58], [54, 58], [52, 59], [50, 56]],
    notes: [
      { slot: 3, text: 'Works carefully, but his writing is small and hard to read.' },
      { slot: 7, text: 'Understands more than his written working shows. His handwriting is hard to read.' },
      { slot: 8, text: 'Writes his working in pencil and rubs it out a lot.' },
    ],
  },
  naledi: {
    pieces: [
      [['measurement', 'q', 65], ['whole_numbers', 'q', 70]],
      [['measurement', 'a', 60], ['shapes', 'q', 65]],
      [['measurement', 'q', 65], ['decimals', 'a', 60]],
      [['measurement', 'p', 60], ['whole_numbers', 'q', 70], ['data', 'q', 65]],
      [['measurement', 'q', 65], ['fractions', 'q', 60]],
      [['measurement', 'a', 60], ['whole_numbers', 'q', 75]],
      [['measurement', 'q', 60], ['data', 'a', 65]],
      [['measurement', 'q', 40], ['decimals', 'a', 60]],
      [['measurement', 'a', 35], ['fractions', 'q', 65]],
      [['measurement', 'q', 45], ['shapes', 'a', 65]],
    ],
    attendance: [[55, 58], [54, 58], [56, 60], [53, 57], [55, 58], [56, 59], [54, 58], [40, 58], [38, 59], [52, 56]],
    notes: [
      { slot: 1, text: 'Quiet and careful. Likes to measure things with a ruler.' },
      { slot: 6, text: 'Hesitant when asked to read scales. Needs more practice with rulers and measuring jugs.' },
      { slot: 8, text: 'Was away often this term and is catching up.' },
    ],
  },
}

/** Small stable hash, so the dates are spread out but are the same every time. */
function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

const DAY_MS = 24 * 60 * 60 * 1000
const pad = (n: number) => String(n).padStart(2, '0')

/** A day inside the term: the month is the `n`th of the term's three, the day is spread between the 4th and the 23rd. */
function dayInTerm(year: number, term: number, n: number, seed: string): string {
  const month = (term - 1) * 3 + 1 + (n % 3)
  return `${year}-${pad(month)}-${pad(4 + (hash(seed) % 20))}`
}

/** When it was written into the records: normally 1 to 7 days after. */
function loggedAfter(day: string, seed: string, extraDays?: number): string {
  const days = extraDays ?? 1 + (hash(`${seed}|log`) % 7)
  return new Date(Date.parse(`${day}T12:00:00Z`) + days * DAY_MS).toISOString()
}

const teacherOf = (grade: number, currentTeacher: string) => (grade === 4 ? 'Mr Dube' : grade === 5 ? 'Mrs Naidoo' : currentTeacher)

/** Days after it happened that a late piece is written into the records (about five months). */
const LATE_DAYS = 150

/**
 * All the records for the five learners. `classYear` is the class year of the sandbox (the current UTC year),
 * `currentTeacher` is the class teacher's name (Grade 6).
 */
export function longHistory(classYear: number, currentTeacher: string): LongHistoryRow[] {
  const rows: LongHistoryRow[] = []
  for (const child of LONG_HISTORY_CHILDREN) {
    const plan = PLANS[child]
    SLOTS.forEach((slot, s) => {
      const year = classYear - slot.back
      const teacher_name = teacherOf(slot.grade, currentTeacher)
      const base = { child, grade: slot.grade, year, term: slot.term, teacher_name }
      const pieces = plan.pieces[s]
      if (!pieces) return // nothing at all that term
      pieces.forEach((piece, i) => {
        const [family, kind, percent, flag] = piece
        const topic = TOPICS[family][(s + i) % TOPICS[family].length]!
        const seed = `${child}|${s}|${i}`
        const day = dayInTerm(year, slot.term, i, seed)
        const outOf = OUT_OF[kind]
        rows.push({
          ...base, source: SOURCE[kind], happened_on: day, logged_at: loggedAfter(day, seed, flag === 'late' ? LATE_DAYS : undefined),
          title: `${SOURCE_TITLE[kind]}: ${topic}`, subject: 'Mathematics', family, topic_name: topic,
          marks: Math.round((percent * outOf) / 100), out_of: outOf, quality: flag === 'unclear' ? 'unclear' : 'clear',
          text: flag === 'unclear' ? 'Marks hard to read on the page.' : null, present: null, total: null,
        })
      })
      const attendance = plan.attendance[s]
      if (attendance) {
        const day = `${year}-${pad(slot.term * 3)}-${pad(10 + (hash(`${child}|${s}|att`) % 10))}`
        rows.push({
          ...base, source: 'attendance', happened_on: day, logged_at: loggedAfter(day, `${child}|${s}|att`), title: `Attendance, term ${slot.term}`,
          subject: null, family: null, topic_name: null, marks: null, out_of: null, quality: 'clear', text: null, present: attendance[0], total: attendance[1],
        })
      }
      for (const [n, note] of plan.notes.filter((x) => x.slot === s).entries()) {
        const seed = `${child}|${s}|note${n}`
        const day = dayInTerm(year, slot.term, n + 1, seed)
        rows.push({
          ...base, source: 'note', happened_on: day, logged_at: loggedAfter(day, seed), title: `Teacher note, term ${slot.term}`,
          subject: null, family: null, topic_name: null, marks: null, out_of: null, quality: 'clear', text: note.text, present: null, total: null,
        })
      }
    })
  }
  return rows
}
