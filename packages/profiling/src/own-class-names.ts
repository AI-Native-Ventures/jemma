// Which class of a grade in a learner's private workspace is the CAPS one, and the grades a learner can add. Pure: no database, no clock, nothing to
// import, so the demo seed, the screens and the tests share it without pulling in the rest of `own-workspace.ts`.

/** The grades a learner can add: the CAPS maps cover Grades 1 to 12. */
export const OWN_GRADES = { from: 1, to: 12 } as const

/**
 * The part of a `children` row that says whether the row is an own workspace: `private_of` (a twin of a school child) and the kind of the school it
 * is in (`schools(kind)` embedded, or read apart). A child whose school cannot be read has no `schools` and is taken for a school child.
 */
export type OwnRecordChild = { private_of?: string | null; schools?: { kind?: string | null } | null }

/**
 * The ONE rule that says "this child's record is an own workspace" (P99): it is the twin of a school child (`private_of` is set), or it is a child of
 * a personal school (`schools.kind` is 'private': a child whose school does not use Jemma, added by a parent). Every screen and action that works
 * only in "My own" asks this, so a twin and an independent child get the same screens.
 */
export const isOwnRecord = (child: OwnRecordChild): boolean => (child.private_of ?? null) !== null || child.schools?.kind === 'private'

/** An own record that is not a twin: a child whose school does not use Jemma. Its own record IS its "My own", it has no school workspace and no switch. */
export const isIndependent = (child: OwnRecordChild): boolean => (child.private_of ?? null) === null && child.schools?.kind === 'private'

/**
 * The name of the CAPS class of a grade in a private workspace: "Grade {N} (my own)". It is the ONE rule that says which class of a grade is the
 * CAPS one (the class `addOwnGrade` makes, with the CAPS map of the grade); every other class of a grade is a learner's own curriculum (P97), named
 * by the learner. The seed, the screens and the tests use this helper and no string of their own.
 */
export const capsClassName = (grade: number): string => `Grade ${grade} (my own)`

/**
 * True when `name` is the name of a CAPS class: of this `grade`, or (with no grade) of any grade 1 to 12, ignoring capitals and the space round it.
 * An own curriculum may not take such a name, or it would be taken for the CAPS class.
 */
export function isCapsClassName(name: string, grade?: number): boolean {
  const wanted = (g: number) => capsClassName(g).toLowerCase()
  const given = name.trim().replace(/\s+/g, ' ').toLowerCase()
  if (grade !== undefined) return given === wanted(grade)
  return Array.from({ length: OWN_GRADES.to - OWN_GRADES.from + 1 }, (_, i) => OWN_GRADES.from + i).some((g) => given === wanted(g))
}
