import type { JemmaDb } from '@jemma/profiling/db'
import { replaceChildLogin } from './child-login'
import { sameNameProblem, validateSchool, type SchoolInput } from './subjects'

export { sameNameProblem }

// What the teacher's forms write: a class (with new learners and learners copied from another class), a learner who is already
// at the school put into a class, a school that is not in the list, and a learner's sign-in code. Every function takes the service
// client and the ids it needs, and checks the school itself, so the server actions stay thin and a test can run them on real rows.
// Relative imports only: the database tests import this file without the app's path alias.

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** A class code for parents: 6 letters and numbers, no 0, 1, I or O. */
export function newJoinCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')
}

/** `%`, `_` and `\` mean something to `ilike`: a first name or a school name is matched as plain text. */
const literal = (text: string) => text.replace(/[\\%_]/g, (c) => `\\${c}`)

// ---------- a new class ----------

/** A learner who is new to the school. The surname is optional, and needed when it is what tells two learners apart. */
export type NewLearner = { firstName: string; lastName?: string | null }

const plain = (text: string | null | undefined) => (text ?? '').trim().replace(/\s+/g, ' ')

export type NewClass = {
  userId: string
  schoolId: string
  name: string
  grade: number
  subject: string
  /** The code the form showed. A bad or taken code is replaced. */
  code: string
  /** Learners who are new to the school (a plain string is a first name). */
  learners: (string | NewLearner)[]
  /** Every learner of this class is enrolled in the new one too. No child row is made for them. */
  copyFromClassId?: string | null
}

export type NewClassResult = { classId: string; added: number; copied: number }

export class ClassWriteError extends Error {}

/**
 * Makes the class, then its learners. New names become new children of the school; learners of `copyFromClassId` are
 * enrolled with an enrolment row only. The source class must be at the same school.
 */
export async function createClassRecord(admin: JemmaDb, input: NewClass): Promise<NewClassResult> {
  const { schoolId } = input
  let source: string[] = []
  let copied: NewLearner[] = []
  if (input.copyFromClassId) {
    const { data: from, error } = await admin.from('classes').select('school_id').eq('id', input.copyFromClassId).maybeSingle()
    if (error) throw new Error(`could not read the class to copy: ${error.message}`)
    if (!from || from.school_id !== schoolId) throw new ClassWriteError('That class is not at your school')
    const { data: enrolled, error: enrolError } = await admin.from('enrolments').select('child_id').eq('class_id', input.copyFromClassId)
    if (enrolError) throw new Error(`could not read the learners to copy: ${enrolError.message}`)
    source = (enrolled ?? []).map((e) => e.child_id)
    if (source.length) {
      const { data: kids } = await admin.from('children').select('first_name, last_name').in('id', source)
      copied = (kids ?? []).map((k) => ({ firstName: k.first_name, lastName: k.last_name }))
    }
  }

  // The same person typed twice is one learner. Learners with the same first name need a surname to tell them apart.
  const seen = new Set<string>()
  const fresh = input.learners
    .map((l) => (typeof l === 'string' ? { firstName: l } : l))
    .map((l) => ({ firstName: plain(l.firstName), lastName: plain(l.lastName) || null }))
    .filter((l) => {
      const key = `${l.firstName.toLowerCase()}|${(l.lastName ?? '').toLowerCase()}`
      if (!l.firstName || seen.has(key)) return false
      seen.add(key)
      return true
    })
  const problem = fresh.length > 0 ? sameNameProblem([...copied, ...fresh]) : null
  if (problem && !sameNameProblem(copied)) throw new ClassWriteError(problem)

  let code = /^[A-Z0-9]{6}$/.test(input.code) ? input.code : newJoinCode()
  let classId: string | null = null
  for (let attempt = 0; attempt < 5 && !classId; attempt++) {
    const { data, error } = await admin
      .from('classes')
      .insert({ school_id: schoolId, teacher_id: input.userId, name: input.name, grade: input.grade, year: new Date().getUTCFullYear(), subject: input.subject, join_code: code })
      .select('id')
      .single()
    if (data) classId = data.id
    else if (error?.code === '23505') code = newJoinCode()
    else throw new Error(`could not create class: ${error?.message}`)
  }
  if (!classId) throw new Error('could not create class: no free code')

  if (source.length) {
    const { error } = await admin.from('enrolments').insert(source.map((child_id) => ({ class_id: classId!, child_id })))
    if (error) throw new Error(`could not copy the learners: ${error.message}`)
  }

  const names = fresh
  if (names.length) {
    const { data: kids, error } = await admin
      .from('children')
      .insert(names.map((l) => ({ school_id: schoolId, first_name: l.firstName, last_name: l.lastName, grade: input.grade })))
      .select('id')
    if (error) throw new Error(`could not add learners: ${error.message}`)
    const { error: enrolError } = await admin.from('enrolments').insert(kids.map((k) => ({ class_id: classId!, child_id: k.id })))
    if (enrolError) throw new Error(`could not add learners: ${enrolError.message}`)
  }
  return { classId, added: names.length, copied: source.length }
}

/** True when the signed-in teacher (their own client, so row level security decides) can see the class and it is at `schoolId`. */
export async function canCopyFrom(teacher: JemmaDb, schoolId: string, classId: string): Promise<boolean> {
  const { data } = await teacher.from('classes').select('id').eq('id', classId).eq('school_id', schoolId).maybeSingle()
  return Boolean(data)
}

export type AddLearnerResult = { ok: true; childId: string } | { ok: false; error: string }

/** A learner who is new to the school, added to the class. The same first name as someone in the class needs a surname for one of the two. */
export async function addNewLearner(admin: JemmaDb, input: { classId: string; firstName: string; lastName?: string | null }): Promise<AddLearnerResult> {
  const firstName = plain(input.firstName)
  if (!firstName) return { ok: false, error: "Type the learner's first name" }
  const { data: cls } = await admin.from('classes').select('school_id, grade').eq('id', input.classId).maybeSingle()
  if (!cls) return { ok: false, error: 'That class was not found' }
  const { data: enrolled } = await admin.from('enrolments').select('children(first_name, last_name)').eq('class_id', input.classId)
  const people = (enrolled ?? []).flatMap((e) => (e.children ? [{ firstName: e.children.first_name, lastName: e.children.last_name }] : []))
  const lastName = plain(input.lastName) || null
  const problem = sameNameProblem([...people, { firstName, lastName }])
  if (problem && !sameNameProblem(people)) return { ok: false, error: problem }
  const { data: kid, error } = await admin.from('children').insert({ school_id: cls.school_id, first_name: firstName, last_name: lastName, grade: cls.grade }).select('id').single()
  if (error || !kid) return { ok: false, error: 'Could not add the learner. Try again.' }
  const { error: enrolError } = await admin.from('enrolments').insert({ class_id: input.classId, child_id: kid.id })
  if (enrolError) return { ok: false, error: 'Could not add the learner. Try again.' }
  return { ok: true, childId: kid.id }
}

// ---------- a learner who is already at the school ----------

export type SchoolLearner = { childId: string; firstName: string; lastName: string | null; grade: number; classes: string[] }

/**
 * Children of the same school with this first name (any case) who are not in the class yet, each with the classes they are in.
 * Only the school of the class is searched.
 */
export async function findLearnersAtSchool(admin: JemmaDb, input: { classId: string; firstName: string }): Promise<SchoolLearner[]> {
  const name = input.firstName.trim()
  if (name.length < 1) return []
  const { data: cls } = await admin.from('classes').select('school_id').eq('id', input.classId).maybeSingle()
  if (!cls) return []
  const { data: kids } = await admin.from('children').select('id, first_name, last_name, grade').eq('school_id', cls.school_id).ilike('first_name', literal(name)).order('created_at').limit(12)
  if (!kids?.length) return []
  const { data: enrolments } = await admin.from('enrolments').select('child_id, class_id, classes(name)').in('child_id', kids.map((k) => k.id))
  const inThisClass = new Set((enrolments ?? []).filter((e) => e.class_id === input.classId).map((e) => e.child_id))
  return kids
    .filter((k) => !inThisClass.has(k.id))
    .slice(0, 8)
    .map((k) => ({
      childId: k.id,
      firstName: k.first_name,
      lastName: k.last_name,
      grade: k.grade,
      classes: (enrolments ?? []).filter((e) => e.child_id === k.id && e.classes).map((e) => e.classes!.name),
    }))
}

export type EnrolResult = { ok: true; alreadyIn: boolean } | { ok: false; error: string }

/** Puts a child who is already at the school into the class: an enrolment row only, never a second child row. Another school is refused. */
export async function enrolExistingLearner(admin: JemmaDb, input: { classId: string; childId: string }): Promise<EnrolResult> {
  const [{ data: cls }, { data: kid }] = await Promise.all([
    admin.from('classes').select('school_id').eq('id', input.classId).maybeSingle(),
    admin.from('children').select('school_id').eq('id', input.childId).maybeSingle(),
  ])
  if (!cls || !kid) return { ok: false, error: 'That learner was not found' }
  if (cls.school_id !== kid.school_id) return { ok: false, error: 'That learner is at another school' }
  const { data: there } = await admin.from('enrolments').select('child_id').eq('class_id', input.classId).eq('child_id', input.childId).maybeSingle()
  if (there) return { ok: true, alreadyIn: true }
  const { error } = await admin.from('enrolments').insert({ class_id: input.classId, child_id: input.childId })
  if (error) return { ok: false, error: 'Could not add the learner. Try again.' }
  return { ok: true, alreadyIn: false }
}

// ---------- a school that is not in the list ----------

export type SchoolOffer = { id: string; name: string; region: string | null; country: string }

export type NewSchoolResult =
  | { ok: true; schoolId: string }
  | { ok: false; error: string; existing?: SchoolOffer }

/**
 * Makes a school with no sandbox and links the teacher's profile to it. A teacher who already has a school gets no second one.
 * A school with the same name (any case) and country that is not a demo is offered instead of making a copy.
 */
export async function createSchoolForTeacher(admin: JemmaDb, input: { userId: string } & SchoolInput): Promise<NewSchoolResult> {
  const checked = validateSchool(input)
  if (!checked.ok) return { ok: false, error: checked.error }
  const school = checked.value

  const { data: profile } = await admin.from('profiles').select('role, school_id').eq('user_id', input.userId).maybeSingle()
  if (!profile || profile.role !== 'teacher') return { ok: false, error: 'Only a teacher can start a school' }
  if (profile.school_id) return { ok: false, error: 'You already have a school. Pick it from the list.' }

  const { data: same } = await admin
    .from('schools')
    .select('id, name, region, country')
    .ilike('name', literal(school.name))
    .eq('country', school.country)
    .is('sandbox_id', null)
    .limit(1)
    .maybeSingle()
  if (same) return { ok: false, error: `${same.name} is already on Jemma.`, existing: { id: same.id, name: same.name, region: same.region, country: same.country } }

  const { data: made, error } = await admin
    .from('schools')
    .insert({ name: school.name, country: school.country, region: school.region, sandbox_id: null })
    .select('id')
    .single()
  if (error || !made) return { ok: false, error: 'Could not make the school. Try again.' }
  const { data: linked, error: linkError } = await admin.from('profiles').update({ school_id: made.id }).eq('user_id', input.userId).is('school_id', null).select('user_id')
  if (linkError || !linked?.length) {
    await admin.from('schools').delete().eq('id', made.id)
    return { ok: false, error: linkError ? 'Could not save your school. Try again.' : 'You already have a school. Pick it from the list.' }
  }
  return { ok: true, schoolId: made.id }
}

// ---------- a learner's sign-in code ----------

export type SignInCodeResult = { ok: true; code: string } | { ok: false; error: string }

/**
 * The teacher of the class makes (or makes again) the sign-in code for a learner of the class. `pin_set_by` is the teacher. The
 * learner must be enrolled in the class. An earlier code stops working.
 */
export async function makeSignInCode(admin: JemmaDb, input: { teacherId: string; classId: string; childId: string; pin: string }): Promise<SignInCodeResult> {
  if (!/^\d{4}$/.test(input.pin)) return { ok: false, error: 'Use 4 digits.' }
  const { data: cls } = await admin.from('classes').select('teacher_id').eq('id', input.classId).maybeSingle()
  if (!cls || cls.teacher_id !== input.teacherId) return { ok: false, error: 'You do not teach this class.' }
  const { data: there } = await admin.from('enrolments').select('child_id').eq('class_id', input.classId).eq('child_id', input.childId).maybeSingle()
  if (!there) return { ok: false, error: 'That learner is not in this class.' }
  return replaceChildLogin(admin, { childId: input.childId, pin: input.pin, setBy: input.teacherId })
}
