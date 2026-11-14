// The pure pieces of the learner's "My own" screens (P95): which grade "My maths" shows, the words the screens say, and what the grade sheet marks.
// No database, no clock, no cookies: the screens and the tests import the same file. The server pieces are in `./own-workspace` and `./data/own-screens`.

/** One grade the learner added: its private class and its grade, as the grade chips and the grade sheet need them. */
export type GradeChip = { classId: string; grade: number }

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

/**
 * The grade "My maths" shows in My own. The grade named in the address (`?grade=7`) when the learner has added it; else the learner's own grade;
 * else the lowest grade added. The same default as `defaultOwnClass`, so the home, the practice and "My maths" agree. Null when no grade is added.
 * `param` is what the address held: nothing, a word, or a list when the parameter was repeated (the first counts).
 */
export function pickGrade(grades: GradeChip[], param: string | string[] | undefined, schoolGrade: number): GradeChip | null {
  const sorted = [...grades].sort((a, b) => a.grade - b.grade)
  const raw = Array.isArray(param) ? param[0] : param
  const asked = raw !== undefined && /^\d{1,2}$/.test(raw) ? Number(raw) : null
  return (asked !== null ? sorted.find((g) => g.grade === asked) : undefined) ?? sorted.find((g) => g.grade === schoolGrade) ?? sorted[0] ?? null
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
