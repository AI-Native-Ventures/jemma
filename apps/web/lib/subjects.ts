// What a teacher may pick when they make a class or a school, and the one validator every form and server action uses.
// Plain functions, no server code: the forms (client) and the actions (server) import the same file.

export const SUBJECTS = ['Mathematics', 'English', 'Natural Sciences', 'Social Sciences', 'Technology', 'Life Skills'] as const
/** The last choice of the subject select. The teacher types the name. */
export const OTHER_SUBJECT = 'Other'
export const GRADES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const

/** The ISO 3166 code is what `schools.country` holds (the seeded school is `ZA`). `ZZ` is the standard "unknown" code. */
export const COUNTRIES: readonly { code: string; name: string }[] = [
  { code: 'ZA', name: 'South Africa' },
  { code: 'KE', name: 'Kenya' },
  { code: 'NG', name: 'Nigeria' },
  { code: 'GH', name: 'Ghana' },
  { code: 'UG', name: 'Uganda' },
  { code: 'TZ', name: 'Tanzania' },
  { code: 'RW', name: 'Rwanda' },
  { code: 'ZM', name: 'Zambia' },
  { code: 'ZW', name: 'Zimbabwe' },
  { code: 'BW', name: 'Botswana' },
  { code: 'NA', name: 'Namibia' },
  { code: 'ET', name: 'Ethiopia' },
  { code: 'ZZ', name: 'Other' },
]

export type Checked<T> = ({ ok: true } & T) | { ok: false; error: string }

const squash = (text: string) => text.trim().replace(/\s+/g, ' ')

export function validateGrade(grade: unknown): Checked<{ grade: number }> {
  if (typeof grade === 'number' && Number.isInteger(grade) && grade >= 1 && grade <= 12) return { ok: true, grade }
  return { ok: false, error: 'Pick a grade from 1 to 12' }
}

/** Letters (any language), digits, spaces, `&` and `-`. */
const SUBJECT_NAME = /^[\p{L}\p{N} &-]+$/u
const SUBJECT_HINT = 'Name the subject in 2 to 40 letters, numbers, spaces, & or -'

/**
 * `subject` is the select's value: a subject from the list, or `Other` with the typed name in `other`.
 * A typed name that is on the list (any case) becomes the list's own spelling. A name typed beside a subject from the list is ignored.
 */
export function validateSubject(subject: unknown, other?: string): Checked<{ subject: string }> {
  if (typeof subject === 'string' && (SUBJECTS as readonly string[]).includes(subject)) return { ok: true, subject }
  if (subject !== OTHER_SUBJECT) return { ok: false, error: 'Pick a subject' }
  const typed = squash(other ?? '')
  if (typed.length < 2 || typed.length > 40 || !SUBJECT_NAME.test(typed)) return { ok: false, error: SUBJECT_HINT }
  const listed = SUBJECTS.find((s) => s.toLowerCase() === typed.toLowerCase())
  return { ok: true, subject: listed ?? typed }
}

export type ClassInput = { name: string; grade: unknown; subject: unknown; otherSubject?: string }
export type ClassValue = { name: string; grade: number; subject: string }

/** The class form and its action: name, grade, subject, one thing at a time in the order the form shows them. */
export function validateClass(input: ClassInput): Checked<{ value: ClassValue }> {
  const name = squash(input.name ?? '')
  if (!name) return { ok: false, error: 'Give the class a name' }
  if (name.length > 60) return { ok: false, error: 'Keep the class name under 60 letters' }
  const grade = validateGrade(input.grade)
  if (!grade.ok) return grade
  const subject = validateSubject(input.subject, input.otherSubject)
  if (!subject.ok) return subject
  return { ok: true, value: { name, grade: grade.grade, subject: subject.subject } }
}

export type SchoolInput = { name: string; country: string; region?: string | null }
export type SchoolValue = { name: string; country: string; region: string | null }

/** The "My school isn't listed" form: name (2 to 80), a country from the list (its ISO code), region optional (up to 60). */
export function validateSchool(input: SchoolInput): Checked<{ value: SchoolValue }> {
  const name = squash(input.name ?? '')
  if (name.length < 2 || name.length > 80) return { ok: false, error: 'Type the name of the school (2 to 80 letters)' }
  if (!COUNTRIES.some((c) => c.code === input.country)) return { ok: false, error: 'Pick the country' }
  const region = squash(input.region ?? '')
  if (region.length > 60) return { ok: false, error: 'Keep the region under 60 letters' }
  return { ok: true, value: { name, country: input.country, region: region || null } }
}

/** How a subject is written in short lines: "Mathematics" is "Maths". Every other subject keeps its name. */
export const shortSubject = (subject: string): string => (subject === 'Mathematics' ? 'Maths' : subject)

// ---------- two learners with the same first name ----------

export type Person = { firstName: string; lastName?: string | null }

const plain = (text: string | null | undefined) => (text ?? '').trim().replace(/\s+/g, ' ')

/**
 * The rule that lets a parent say which child they mean: of the learners of a class who share a first name, at most one has no
 * surname, and no two have the same surname. Returns what to tell the teacher when the rule is broken, else null.
 */
export function sameNameProblem(people: Person[]): string | null {
  const groups = new Map<string, Person[]>()
  for (const p of people) {
    const key = plain(p.firstName).toLowerCase()
    if (key) groups.set(key, [...(groups.get(key) ?? []), p])
  }
  for (const members of groups.values()) {
    if (members.length < 2) continue
    const first = plain(members[0]!.firstName)
    if (members.filter((m) => !plain(m.lastName)).length > 1) return `Two learners are called ${first}. Add a surname to one of them so parents can tell them apart.`
    const seen = new Map<string, string>()
    for (const m of members) {
      const last = plain(m.lastName)
      if (!last) continue
      const earlier = seen.get(last.toLowerCase())
      if (earlier) return `Two learners are called ${first} ${earlier}. Change one of the names so parents can tell them apart.`
      seen.set(last.toLowerCase(), last)
    }
  }
  return null
}
