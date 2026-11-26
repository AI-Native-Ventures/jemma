import type { ShadeSpec } from '../../schemas/lesson'

/**
 * P172: parts of a shape shaded by tapping, from the "Shade parts" board: a circle or a bar cut into equal parts, or a grid of squares (a hundred square). The
 * key is how many parts to shade, a whole number; which parts the learner shades does not matter. P194: and a shape to finish so a mirror line is a line of
 * symmetry, its key the squares that finish it. Pure.
 */

export const SHADE_MAX_PARTS = 12
export const SHADE_MAX_SIDE = 10

/** How many parts the shape has: its parts, or the squares of its grid. */
export const shadeTotal = (s: ShadeSpec): number => (s.shape === 'grid' ? (s.rows ?? 0) * (s.cols ?? 0) : (s.parts ?? 0))

/** P194: the square a square is the mirror image of, both numbered from 1 along each row from the top left. */
export function mirrorSquare(s: ShadeSpec, n: number): number {
  const cols = s.cols ?? 1
  const rows = s.rows ?? 1
  const r = Math.floor((n - 1) / cols)
  const c = (n - 1) % cols
  return s.mirror === 'horizontal' ? (rows - 1 - r) * cols + c + 1 : r * cols + (cols - 1 - c) + 1
}

/** P194: the squares that finish a shape: the mirror images of the shaded ones that are not shaded yet, smallest first. */
export function mirrorKey(s: ShadeSpec): number[] {
  const given = new Set(s.given ?? [])
  return [...new Set([...given].map((n) => mirrorSquare(s, n)))].filter((n) => !given.has(n)).sort((a, b) => a - b)
}

/** Why a shape to shade cannot be shown, or null. */
export function shadeProblem(s: ShadeSpec): string | null {
  // P194: a shape to finish is a grid with an even number of squares across its mirror, some of them shaded, and at least one square to shade.
  if (s.mirror) {
    if (s.shape !== 'grid') return 'a shape to finish is a grid'
    const fine = [s.rows, s.cols].every((v) => v !== undefined && Number.isInteger(v) && v >= 2 && v <= SHADE_MAX_SIDE)
    if (!fine) return `a grid to finish has 2 to ${SHADE_MAX_SIDE} rows and columns`
    if ((s.mirror === 'vertical' ? s.cols! : s.rows!) % 2 !== 0) return `a ${s.mirror} mirror runs between two middle ${s.mirror === 'vertical' ? 'columns' : 'rows'}, so there is an even number of them`
    const given = s.given ?? []
    if (given.length < 1 || given.some((n) => !Number.isInteger(n) || n < 1 || n > shadeTotal(s)) || new Set(given).size !== given.length) return 'the shaded squares are squares of the grid, each named once'
    return mirrorKey(s).length > 0 ? null : 'a shape to finish has at least one square left to shade'
  }
  if (s.given !== undefined) return 'only a shape to finish, with a mirror, has squares shaded already'
  if (s.shape === 'grid') {
    const fine = [s.rows, s.cols].every((v) => v !== undefined && Number.isInteger(v) && v >= 1 && v <= SHADE_MAX_SIDE)
    return fine && shadeTotal(s) >= 2 ? null : `a grid to shade has 1 to ${SHADE_MAX_SIDE} rows and columns, and 2 squares or more`
  }
  return s.parts !== undefined && Number.isInteger(s.parts) && s.parts >= 2 && s.parts <= SHADE_MAX_PARTS
    ? null
    : `a circle or a bar to shade has 2 to ${SHADE_MAX_PARTS} equal parts`
}

/** Why the key of a shape to shade is not a number of its parts, or null: a whole number from 1 to all of them. */
export function shadeKeyProblem(q: { answer: string; answerKind: string; shade: ShadeSpec; ordered?: boolean; labels?: string[] }): string | null {
  // P194: the key of a shape to finish is every square that finishes it, in any order.
  if (q.shade.mirror) {
    if (q.answerKind !== 'list') return 'a shape to finish has a list answer: the squares to shade'
    if (q.ordered === true || (q.labels?.length ?? 0) > 0) return 'the squares of a shape to finish go in any order: no ordered and no labels'
    const want = mirrorKey(q.shade)
    const got = q.answer.split(';').map((t) => t.trim())
    const nums = got.map((t) => (/^\d+$/.test(t) ? Number(t) : NaN))
    const same = nums.length === want.length && [...nums].sort((a, b) => a - b).every((n, i) => n === want[i])
    return same ? null : `the answer is the squares that finish the shape: ${want.join('; ')}`
  }
  if (q.answerKind !== 'whole') return 'a shape to shade has a whole answer: how many parts to shade'
  const n = /^\d+$/.test(q.answer.trim()) ? Number(q.answer.trim()) : NaN
  const total = shadeTotal(q.shade)
  return Number.isInteger(n) && n >= 1 && n <= total ? null : `the answer is how many parts to shade, from 1 to ${total}`
}
