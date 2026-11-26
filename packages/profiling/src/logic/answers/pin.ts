import type { PinSpec } from '../../schemas/lesson'

/**
 * P175: a pin put on a number line, from the "Mark a number line" board: the learner drags the pin along the line and it stops on the marks; the line shows no
 * number but its two ends. The key is the number the pin goes on, marked as its kind always was (a fraction, a mixed number, a decimal or a whole number); the
 * pin is sent as that kind, worked exactly on whole numbers. Pure.
 */

export const PIN_MAX_MARKS = 20
export const PIN_KINDS = ['fraction', 'mixed', 'decimal', 'whole'] as const

/** The number of jumps between two marks in one, and how many jumps the line has. */
export const pinParts = (p: PinSpec): number => (p.parts !== undefined ? p.parts : 1)
const pinStep = (p: PinSpec): number => (p.parts !== undefined ? 1 : (p.step ?? 1))
export const pinMarks = (p: PinSpec): number => Math.round(((p.max - p.min) * pinParts(p)) / pinStep(p))

/** The value of mark `k` (0 is `min`), as a whole number of parts over `pinParts`: a fraction worked on whole numbers. */
export const pinMark = (p: PinSpec, k: number): { n: number; d: number } => ({ n: p.min * pinParts(p) + k * pinStep(p), d: pinParts(p) })

/** Why a number line to put a pin on cannot be shown, or null. */
export function pinProblem(p: PinSpec): string | null {
  if (!Number.isInteger(p.min) || !Number.isInteger(p.max) || p.min >= p.max) return 'a number line goes from a whole number min to a bigger whole number max'
  if (p.parts !== undefined && !(Number.isInteger(p.parts) && p.parts >= 1 && p.parts <= 12)) return 'parts is a whole number from 1 to 12'
  if (p.step !== undefined && !(Number.isInteger(p.step) && p.step >= 1)) return 'step is a whole number, 1 or more'
  if (p.parts === undefined && (p.max - p.min) % pinStep(p) !== 0) return 'the line from min to max is a whole number of steps'
  if (pinMarks(p) > PIN_MAX_MARKS) return `a number line has at most ${PIN_MAX_MARKS} jumps`
  return null
}

/** Why the key is not a mark of the line after its start, or not a kind a pin can be, or null. */
export function pinKeyProblem(q: { answer: string; answerKind: string; pin: PinSpec }, read: (t: string) => number | null): string | null {
  if (!(PIN_KINDS as readonly string[]).includes(q.answerKind)) return 'a pin on a number line has a fraction, mixed, decimal or whole answer'
  const v = read(q.answer.replace(/^(\d+)\s+(\d+\/\d+)$/, (_m, w: string, f: string) => `${w}+${f}`))
  if (v === null || !Number.isFinite(v)) return 'the answer is a number'
  const k = ((v - q.pin.min) * pinParts(q.pin)) / pinStep(q.pin)
  if (Math.abs(k - Math.round(k)) > 1e-9 || Math.round(k) < 1 || Math.round(k) > pinMarks(q.pin)) return 'the answer is on a mark of the line, after min'
  return null
}

const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b))

/** The pin at mark `k`, written as the key's kind: `3/4`, `1 1/2`, `0,75` or `7`. */
export function pinAnswer(p: PinSpec, k: number, kind: string): string {
  const { n, d } = pinMark(p, k)
  const g = gcd(n, d) || 1
  const [rn, rd] = [n / g, d / g]
  if (kind === 'whole' || rd === 1) return String(rn)
  if (kind === 'decimal') return String(Math.round((n / d) * 1e6) / 1e6).replace('.', ',')
  if (kind === 'mixed' && Math.abs(rn) > rd) return `${Math.trunc(rn / rd)} ${Math.abs(rn % rd)}/${rd}`
  return `${rn}/${rd}`
}

/** The mark of a key or an answer (0 is `min`), or null when it is not on a mark. */
export function pinMarkOf(p: PinSpec, text: string, read: (t: string) => number | null): number | null {
  const v = read(text.replace(/^(\d+)\s+(\d+\/\d+)$/, (_m, w: string, f: string) => `${w}+${f}`))
  if (v === null || !Number.isFinite(v)) return null
  const k = ((v - p.min) * pinParts(p)) / pinStep(p)
  return Math.abs(k - Math.round(k)) < 1e-9 && Math.round(k) >= 0 && Math.round(k) <= pinMarks(p) ? Math.round(k) : null
}
