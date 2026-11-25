import type { BlocksSpec } from '../../schemas/lesson'

/**
 * P169: a number built with place value blocks, from the "Build with pieces" board: flats of a hundred, rods of ten and single ones on a mat. At most 9 of each
 * block go on the mat, so a number has one way to be built, and the number the blocks make is marked as a whole number always was. Pure: no database, no model,
 * no browser.
 */

export const BLOCK_PLACES = ['hundreds', 'tens', 'ones'] as const
export type BlockPlace = (typeof BLOCK_PLACES)[number]
/** The most blocks of one kind on the mat. */
export const BLOCKS_MAX = 9
export const BLOCK_VALUE: Record<BlockPlace, number> = { hundreds: 100, tens: 10, ones: 1 }

/** The places of a question in the order of the mat (hundreds, tens, ones), each once. */
export const blockPlaces = (b: BlocksSpec): BlockPlace[] => BLOCK_PLACES.filter((p) => b.places.includes(p))

/** The number the blocks on the mat make: the count of each place times its value. */
export const blocksNumber = (counts: Partial<Record<BlockPlace, number>>): number =>
  BLOCK_PLACES.reduce((sum, p) => sum + (counts[p] ?? 0) * BLOCK_VALUE[p], 0)

/** The blocks of a number, one count for each place (its digits), or null when it is not a whole number from 0 to 999. */
export function blocksOf(n: number): Record<BlockPlace, number> | null {
  if (!Number.isInteger(n) || n < 0 || n > 999) return null
  return { hundreds: Math.floor(n / 100), tens: Math.floor((n % 100) / 10), ones: n % 10 }
}

/** Why the blocks of a question cannot be used, or null. */
export function blocksProblem(b: BlocksSpec): string | null {
  if (b.places.length === 0) return 'blocks has the places the learner may use: hundreds, tens or ones'
  if (new Set(b.places).size !== b.places.length) return 'each place of the blocks is named once'
  return null
}

/** Why the key of a question with blocks cannot be built with them, or null: a whole number from 1 to 999 that needs only the blocks the learner has. */
export function blocksKeyProblem(q: { answer: string; answerKind: string; blocks: BlocksSpec }): string | null {
  if (q.answerKind !== 'whole') return 'a number built with blocks has a whole answer'
  const n = /^\d+$/.test(q.answer.trim()) ? Number(q.answer.trim()) : NaN
  const counts = blocksOf(n)
  if (!counts || n < 1) return 'a number built with blocks is from 1 to 999'
  const places = blockPlaces(q.blocks)
  const missing = BLOCK_PLACES.filter((p) => counts[p] > 0 && !places.includes(p))
  return missing.length ? `${n} needs ${missing.join(' and ')}, and the blocks have none` : null
}
