import type { TapSpec } from '../../schemas/lesson'
import { splitValues } from './lists'

/**
 * P173: shapes picked by tapping, from the "Tap on the picture" board ("Tap all the triangles."). The key is the numbers of the shapes to pick, from 1, in any
 * order, so the list marking (in any order) marks the picks: a shape missed or a shape too many is wrong. Pure.
 */

export const TAP_MIN = 4
export const TAP_MAX = 9

/** Why a picture of shapes to tap cannot be shown, or null. */
export function tapProblem(t: TapSpec): string | null {
  if (t.shapes.length < TAP_MIN || t.shapes.length > TAP_MAX) return `a picture to tap has ${TAP_MIN} to ${TAP_MAX} shapes`
  if (t.shapes.some((s) => s.turn !== undefined && ![0, 90, 180, 270].includes(s.turn))) return 'a shape is turned by 0, 90, 180 or 270'
  return null
}

/** The numbers of the shapes in a key or an answer (from 1), or null when one is not the number of a shape or one is there twice. */
export function tapPicks(answer: string, t: TapSpec): number[] | null {
  const values = splitValues(answer).map((v) => (/^\d+$/.test(v) ? Number(v) : NaN))
  if (!values.every((v) => Number.isInteger(v) && v >= 1 && v <= t.shapes.length)) return null
  return new Set(values).size === values.length ? values : null
}

/** Why the key of a picture to tap is not 2 or more of its shapes (and not all of them), or null. */
export function tapKeyProblem(q: { answer: string; answerKind: string; tap: TapSpec }): string | null {
  if (q.answerKind !== 'list') return 'shapes to tap have a list answer: the numbers of the shapes to pick'
  const picks = tapPicks(q.answer, q.tap)
  if (!picks) return `each value of the answer is the number of a shape, from 1 to ${q.tap.shapes.length}, once`
  if (picks.length < 2) return 'at least 2 shapes are picked'
  if (picks.length >= q.tap.shapes.length) return 'at least one shape is not picked'
  return null
}

/** A question with shapes to tap as it is saved: its picks are in any order. */
export function tidyTap<Q extends { answerKind: string; tap?: TapSpec; ordered?: boolean; labels?: string[] }>(q: Q): Q {
  if (!q.tap || q.answerKind !== 'list') return q
  const { labels: _labels, ...rest } = q
  return { ...rest, ordered: false } as Q
}

/** The answer the picks make (the numbers of the picked shapes, in order), or '' while fewer than 2 are picked. */
export const tapAnswer = (picked: boolean[]): string => {
  const numbers = picked.flatMap((p, i) => (p ? [i + 1] : []))
  return numbers.length >= 2 ? numbers.join('; ') : ''
}
