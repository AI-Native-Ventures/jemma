// The pure pieces of the learner's "My own" screens (P95): which grade "My maths" shows, the words the screens say, and what the grade sheet marks.
// No database, no clock, no cookies: the screens and the tests import the same file. The server pieces are in `./own-workspace` and `./data/own-screens`.

/**
 * One class of the learner's private workspace, as the chips and the grade sheet need it. `caps` is true for the CAPS class of a grade ("Grade 6"),
 * false for a curriculum of the learner's own (P97), which has the learner's name for it. A grade can have both.
 */
export type GradeChip = { classId: string; grade: number; caps: boolean; name: string }

/** The line under the switch while "My own" is on screen. */
export const OWN_NOTE = 'Your own practice. Nothing here goes to your school.'

/** The grades of the grade sheet: 1 to 12, in order. */
export const GRADES_TO_PICK: number[] = Array.from({ length: 12 }, (_, i) => i + 1)

/** One line above the topics of a grade above the learner's own. Only words: no warning. Null for the learner's own grade and the ones below it. */
export const higherGradeLine = (grade: number, schoolGrade: number): string | null => (grade > schoolGrade ? `This is Grade ${grade} work. Take your time.` : null)

/** What "My maths" says in My own before the learner has any grade (a school with no grade of its own, such as Grade R). */
export const ADD_A_GRADE = 'Add a grade to start.'

/** What "My maths" says for a grade that has no topics (a school outside South Africa has no CAPS map to load). */
export const noTopicsLine = (grade: number): string => `No topics yet for Grade ${grade}.`

/** The longest part of a learner's own name for a curriculum that a chip shows; a longer one is cut with an ellipsis. */
export const CHIP_NAME_MAX = 24

/** What a chip says: "Grade 6" for the CAPS class, "Grade 6 \u00b7 {name}" for an own curriculum (a long name is cut with an ellipsis). */
export function chipLabel(chip: GradeChip): string {
  if (chip.caps) return `Grade ${chip.grade}`
  const name = chip.name.length <= CHIP_NAME_MAX ? chip.name : `${chip.name.slice(0, CHIP_NAME_MAX - 1).trimEnd()}\u2026`
  return `Grade ${chip.grade} \u00b7 ${name}`
}

/** What a screen reader hears for a chip: the same, with the whole name. */
export const chipAria = (chip: GradeChip): string => (chip.caps ? `Grade ${chip.grade}` : `Grade ${chip.grade} \u00b7 ${chip.name}`)

type Param = string | string[] | undefined
const first = (p: Param): string | undefined => (Array.isArray(p) ? p[0] : p)

/**
 * The class "My maths" shows in My own. The class named in the address (`?class=<id>`) when it is one of the learner's; else `?grade=N`, the old form
 * of the address, which means the CAPS class of that grade (never an own curriculum of it); else the CAPS class of the learner's own grade, else
 * another class of that grade, else the first class. The same default as `defaultOwnClass`, so the home, the practice and "My maths" agree.
 * Null when the learner has no class. A parameter that was repeated counts by its first value.
 */
export function pickClass(chips: GradeChip[], query: { class?: Param; grade?: Param }, schoolGrade: number): GradeChip | null {
  const wantedClass = first(query.class)
  const byClass = wantedClass ? chips.find((c) => c.classId === wantedClass) : undefined
  if (byClass) return byClass
  const raw = first(query.grade)
  const asked = raw !== undefined && /^\d{1,2}$/.test(raw) ? Number(raw) : null
  const byGrade = asked !== null ? chips.find((c) => c.caps && c.grade === asked) : undefined
  return byGrade ?? chips.find((c) => c.caps && c.grade === schoolGrade) ?? chips.find((c) => c.grade === schoolGrade) ?? chips[0] ?? null
}

export type SheetMark = 'your grade' | 'added'
export type SheetGrade = { grade: number; marks: SheetMark[] }

/** The 12 grades of the grade sheet, each with its marks: "your grade" for the learner's school grade, "added" for a grade already in My own. */
export function sheetMarks(added: number[], schoolGrade: number): SheetGrade[] {
  return GRADES_TO_PICK.map((grade) => ({
    grade,
    marks: [...(grade === schoolGrade ? (['your grade'] as const) : []), ...(added.includes(grade) ? (['added'] as const) : [])],
  }))
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Fri 13 Nov" from a timestamp or a date, in UTC so the day never shifts with the server's time zone. An empty or unreadable value gives an empty text. */
export function shortDay(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso)
  return Number.isNaN(d.getTime()) ? '' : `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}
