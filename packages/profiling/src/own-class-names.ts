// Which class of a grade in a learner's private workspace is the CAPS one, and the grades a learner can add. Pure: no database, no clock, nothing to
// import, so the demo seed, the screens and the tests share it without pulling in the rest of `own-workspace.ts`.

/** The grades a learner can add: the CAPS maps cover Grades 1 to 12. */
export const OWN_GRADES = { from: 1, to: 12 } as const

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
