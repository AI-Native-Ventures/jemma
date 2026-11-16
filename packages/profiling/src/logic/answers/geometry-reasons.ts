/**
 * The reasons a learner may give for a step of a geometry proof (CAPS Euclidean geometry, Grades 10 to 12). A `reason` question (P149) is answered by
 * picking one of these, so the list is fixed: the senior lesson prompt tells the writer to use these words and no others, the question screen lists them
 * (a learner types to find one), and code marks a reason by finding it in this list. One list, three readers.
 *
 * Rules the list keeps (a test holds them): no two the same, none with a `;` (the answer of a question with a value is `value; reason`), none longer than
 * 44 characters (an answer is at most 60, and the value beside the reason may have 12), no em dash.
 *
 * The three reasons about parallel lines name the lines AB and CD: a `reason` question that uses one of them draws and names its parallel lines AB and CD.
 */
export const GEOMETRY_REASONS = [
  'angles on a straight line',
  'angles round a point',
  'vertically opposite angles',
  'alternate angles, AB ∥ CD',
  'corresponding angles, AB ∥ CD',
  'co-interior angles, AB ∥ CD',
  'sum of angles in a triangle',
  'exterior angle of a triangle',
  'isosceles triangle',
  'Pythagoras',
  'angles in the same segment',
  'angle at centre = 2 × angle at circumference',
  'angle in a semicircle',
  'opposite angles of a cyclic quadrilateral',
  'exterior angle of a cyclic quadrilateral',
  'tan-chord theorem',
  'radius ⊥ tangent',
  'tangents from a common point are equal',
  'line from centre ⊥ chord',
  'equal chords subtend equal angles',
  'midpoint theorem',
  'proportionality theorem',
  'similar triangles (AAA)',
  'congruent triangles (SAS/SSS/AAS/RHS)',
] as const

export type GeometryReason = (typeof GEOMETRY_REASONS)[number]

/** The text of a reason as it is compared: lower case, one space between words, `||` as the sign for parallel, no full stop at the end. */
export const normaliseReason = (text: string): string =>
  text
    .toLowerCase()
    .replace(/\|\|/g, '∥')
    .replace(/\s+/g, ' ')
    .replace(/[.\s]+$/, '')
    .trim()

/** The reason of the list that `text` is, word for word and in any case, or null. */
export function findReason(text: string): GeometryReason | null {
  const wanted = normaliseReason(text)
  if (!wanted) return null
  return GEOMETRY_REASONS.find((reason) => normaliseReason(reason) === wanted) ?? null
}

/** The reasons whose words contain every word of `typed` (what a learner has typed so far), in list order. An empty search lists them all. */
export function filterReasons(typed: string): GeometryReason[] {
  const words = normaliseReason(typed).split(' ').filter(Boolean)
  return GEOMETRY_REASONS.filter((reason) => {
    const text = normaliseReason(reason)
    return words.every((word) => text.includes(word))
  })
}
