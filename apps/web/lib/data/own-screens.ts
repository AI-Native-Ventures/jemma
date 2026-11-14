import { listOwnClasses } from '@/lib/own-workspace'
import { type GradeChip, pickClass } from '@/lib/own-grades'
import { myChild } from './p27'

// What the learner's "My own" screens need beyond what "My maths" and the home already read (P95): which workspace is on screen, the grades the
// learner added and the one shown. The learner is found the way every learner screen finds them (`myChild`: their own session, or a parent's
// device after hand-over), so the workspace is the one the cookie chose. No marks are read here: the counts come from `getMyMaths`.

/** "My school" as it always was, or "My own" with the grades the learner added and the one that is shown. */
export type ScreenShape = { workspace: 'school' } | { workspace: 'own'; /** The grade of the learner's school: a grade above it gets the line "Take your time". */ schoolGrade: number; grades: GradeChip[]; picked: GradeChip | null }

/**
 * The shape of "My maths" for this request. In My own: the classes of the private workspace, one chip each (a cheap read with no counts: lowest
 * grade first, the CAPS class of a grade before the learner's own curriculum of it), and the class the address names: `?class=<id>` when it is one
 * of the learner's, else `?grade=N` (the old form: the CAPS class of that grade), else the CAPS class of the learner's own grade, else the first.
 */
export async function getScreenShape(query: { class?: string | string[]; grade?: string | string[] } = {}): Promise<ScreenShape> {
  const { child } = await myChild()
  if (!child.private_of) return { workspace: 'school' }
  const grades = (await listOwnClasses(child.id)).map((c) => ({ classId: c.id, grade: c.grade, caps: c.caps, name: c.name }))
  return { workspace: 'own', schoolGrade: child.grade, grades, picked: pickClass(grades, query, child.grade) }
}

/**
 * What the grade sheet shows: the learner's first name, school grade and the grades already added (a grade is added when it has its CAPS class: an own
 * curriculum of a grade does not add it). Null when the workspace on screen is My school.
 */
export async function getGradeSheet(): Promise<{ firstName: string; schoolGrade: number; added: number[] } | null> {
  const { child } = await myChild()
  if (!child.private_of) return null
  const added = (await listOwnClasses(child.id)).filter((c) => c.caps).map((c) => c.grade)
  return { firstName: child.first_name, schoolGrade: child.grade, added }
}
