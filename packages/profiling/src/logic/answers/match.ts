import { TAP_SHAPES, type MatchSpec } from '../../schemas/lesson'
import { splitValues } from './lists'

/**
 * P178: things matched in pairs, from the "Match pairs" board ("Match each number to its name."): the learner taps one on the left, then the one it goes with
 * on the right, and a line joins them. The key is an ordered list of the place in `right` of the partner of each left one, from 1 (`3; 1; 2`), so the list
 * marking marks each pair right or wrong. Pure.
 */

export const MATCH_MIN = 2
export const MATCH_MAX = 5
/** The longest thing to match. */
export const MATCH_TEXT_MAX = 20

/** Why things to match cannot be shown, or null. */
export function matchProblem(m: MatchSpec): string | null {
  if (m.left.length < MATCH_MIN || m.left.length > MATCH_MAX) return `there are ${MATCH_MIN} to ${MATCH_MAX} pairs`
  if (m.right.length !== m.left.length) return 'there are as many things on the right as on the left'
  const all = [...m.left, ...m.right].map((t) => t.trim())
  if (all.some((t) => !t || t.length > MATCH_TEXT_MAX)) return `each thing to match is 1 to ${MATCH_TEXT_MAX} characters`
  const once = (xs: string[]) => new Set(xs.map((t) => t.trim().toLowerCase())).size === xs.length
  if (!once(m.left) || !once(m.right)) return 'each thing to match is there once'
  if (m.pictures && m.left.some((t) => !(TAP_SHAPES as readonly string[]).includes(t.trim()))) return `with pictures, each thing on the left is a shape: ${TAP_SHAPES.join(', ')}`
  return null
}

/** The partner of each left one in a key or an answer (1 is the first on the right), or null when one is not a place on the right. */
export function matchOf(answer: string, m: MatchSpec): number[] | null {
  const values = splitValues(answer).map((t) => (/^\d+$/.test(t) ? Number(t) : NaN))
  return values.every((v) => Number.isInteger(v) && v >= 1 && v <= m.right.length) ? values : null
}

/** Why the key of things to match is not one partner for each, or null. Each one on the right is used once, and not every pair is straight across. */
export function matchKeyProblem(q: { answer: string; answerKind: string; match: MatchSpec }): string | null {
  if (q.answerKind !== 'list') return 'things matched in pairs have a list answer: the place on the right of the partner of each one on the left, from 1'
  const values = matchOf(q.answer, q.match)
  if (!values) return `each value of the answer is a place on the right, from 1 to ${q.match.right.length}`
  if (values.length !== q.match.left.length) return `the answer has ${values.length} partners for ${q.match.left.length} things on the left`
  if (new Set(values).size !== values.length) return 'each one on the right is the partner of one on the left'
  if (values.every((v, i) => v === i + 1)) return 'mix up the right ones: not every partner is straight across'
  return null
}

/** A question with things to match as it is saved: its list is ordered, with each left one over its box (a picture is "Shape 1"). */
export function tidyMatch<Q extends { answerKind: string; match?: MatchSpec; ordered?: boolean; labels?: string[] }>(q: Q): Q {
  if (!q.match || q.answerKind !== 'list') return q
  return { ...q, ordered: true, labels: q.match.left.map((t, i) => (q.match!.pictures ? `Shape ${i + 1}` : t.trim())) }
}

/** The answer the lines make, as one text (the partner of each left one, from 1, in order), or '' while one is not joined. */
export const matchAnswer = (joined: (number | null)[]): string =>
  joined.length > 0 && joined.every((p) => p !== null) ? joined.map((p) => String(p! + 1)).join('; ') : ''

/** The pairs as words, for the results: "7 with seven, 12 with twelve and 20 with twenty". A left one with no partner (null) is left out. */
export function matchText(m: MatchSpec, partners: (number | null)[]): string {
  const name = (i: number) => (m.pictures ? (m.left[i] ?? '').trim().replace(/_/g, ' ') : (m.left[i] ?? '').trim())
  const pairs = m.left.flatMap((_, i) => (partners[i] ? [`${name(i)} with ${(m.right[partners[i]! - 1] ?? '').trim()}`] : []))
  return pairs.length <= 1 ? (pairs[0] ?? 'no pairs') : `${pairs.slice(0, -1).join(', ')} and ${pairs[pairs.length - 1]}`
}
