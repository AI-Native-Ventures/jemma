import type { ShadeSpec } from '../../schemas/lesson'

/**
 * P172: parts of a shape shaded by tapping, from the "Shade parts" board: a circle or a bar cut into equal parts, or a grid of squares (a hundred square). The
 * key is how many parts to shade, a whole number; which parts the learner shades does not matter. Pure.
 */

export const SHADE_MAX_PARTS = 12
export const SHADE_MAX_SIDE = 10

/** How many parts the shape has: its parts, or the squares of its grid. */
export const shadeTotal = (s: ShadeSpec): number => (s.shape === 'grid' ? (s.rows ?? 0) * (s.cols ?? 0) : (s.parts ?? 0))

/** Why a shape to shade cannot be shown, or null. */
export function shadeProblem(s: ShadeSpec): string | null {
  if (s.shape === 'grid') {
    const fine = [s.rows, s.cols].every((v) => v !== undefined && Number.isInteger(v) && v >= 1 && v <= SHADE_MAX_SIDE)
    return fine && shadeTotal(s) >= 2 ? null : `a grid to shade has 1 to ${SHADE_MAX_SIDE} rows and columns, and 2 squares or more`
  }
  return s.parts !== undefined && Number.isInteger(s.parts) && s.parts >= 2 && s.parts <= SHADE_MAX_PARTS
    ? null
    : `a circle or a bar to shade has 2 to ${SHADE_MAX_PARTS} equal parts`
}

/** Why the key of a shape to shade is not a number of its parts, or null: a whole number from 1 to all of them. */
export function shadeKeyProblem(q: { answer: string; answerKind: string; shade: ShadeSpec }): string | null {
  if (q.answerKind !== 'whole') return 'a shape to shade has a whole answer: how many parts to shade'
  const n = /^\d+$/.test(q.answer.trim()) ? Number(q.answer.trim()) : NaN
  const total = shadeTotal(q.shade)
  return Number.isInteger(n) && n >= 1 && n <= total ? null : `the answer is how many parts to shade, from 1 to ${total}`
}
