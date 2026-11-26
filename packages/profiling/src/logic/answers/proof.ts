import type { ProofSpec } from '../../schemas/lesson'

/**
 * P179: an identity proved line by line, from the "Write steps line by line" board ("Prove that sin²x/(1 − cos x) = 1 + cos x."). The learner writes the left
 * side and changes it one line at a time into the right side. Each line is checked at the end: it must have the same value as the line before it at the same
 * points (the first line as the left side), and the last line must be the right side. The answer is the lines with a semicolon between them, as a `list`.
 * The checking of two lines is passed in (`same`, meaning.ts), so this file has no cycle with it. Pure.
 */

export const PROOF_MIN_LINES = 3
export const PROOF_MAX_LINES = 6

/** Two lines of maths: true when they have the same value at the same points, null when one cannot be read. */
export type SameCheck = (a: string, b: string) => boolean | null

/** The lines of a proof, with the words a learner may write around them taken off ("LHS =" in front, "=" in front, "= RHS" after), and no empty line. */
export function proofLines(text: string): string[] {
  return text
    .split(/[;\r\n]+/)
    .map((line) =>
      line
        .trim()
        .replace(/^(?:l\.?\s*h\.?\s*s\.?\s*)?=\s*/i, '')
        .replace(/\s*=\s*r\.?\s*h\.?\s*s\.?\s*$/i, '')
        .trim(),
    )
    .filter((line) => line.length > 0)
}

/** How a proof stands: the first line that does not follow (from 0: the first line is checked against the left side), one that cannot be read, and whether it ends on the right side. */
export type ProofCheck = { lines: string[]; wrong: number | null; unread: number | null; reached: boolean; enough: boolean; ok: boolean }

/** Checks a proof line by line: each line the same as the one before it (the first as the left side), the last the right side, and at least 3 different lines. */
export function checkProof(spec: ProofSpec, text: string, same: SameCheck): ProofCheck {
  const lines = proofLines(text)
  let wrong: number | null = null
  let unread: number | null = null
  for (let i = 0; i < lines.length; i++) {
    const verdict = same(i === 0 ? spec.left : lines[i - 1]!, lines[i]!)
    if (verdict === null) {
      unread = i
      break
    }
    if (!verdict) {
      wrong = i
      break
    }
  }
  const flat = (t: string) => t.replace(/\s+/g, '').toLowerCase()
  const different = lines.every((line, i) => i === 0 || flat(line) !== flat(lines[i - 1]!))
  const enough = lines.length >= PROOF_MIN_LINES && lines.length <= PROOF_MAX_LINES && different
  // Every line of a good proof has the value of the right side, so the last one must also be written as it is: the same pieces, in any order.
  const last = lines[lines.length - 1]
  const reached = last !== undefined && same(last, spec.right) === true && sameForm(last, spec.right)
  return { lines, wrong, unread, reached, enough, ok: wrong === null && unread === null && reached && enough }
}

/**
 * True when two lines are written with the same pieces, in any order and with any brackets: `cos x + 1` and `1 + cos(x)` are, `((1 - cos x)(1 + cos x))/(1 - cos x)`
 * and `1 + cos x` are not. The values are checked apart from this.
 */
export function sameForm(a: string, b: string): boolean {
  const pieces = (t: string) =>
    (
      t
        .toLowerCase()
        .replace(/[\u2212\u2013]/g, '-')
        .replace(/\u00b2/g, '^2')
        .replace(/\u00b3/g, '^3')
        .replace(/[\u00d7\u00b7]/g, '*')
        .replace(/\s+/g, '')
        .replace(/[()[\]{}]/g, '')
        .match(/[a-z\u03b8]+(?:\^\d+)?|\d+(?:[.,]\d+)?|[+\-*/^\u221a]/g) ?? []
    )
      .sort()
      .join(' ')
  return pieces(a) === pieces(b)
}

/** Marks a proof: right when every line follows and it ends on the right side. `comparable` is false when a line cannot be read or there are none. */
export function markProof(spec: ProofSpec, answer: string, same: SameCheck): { correct: boolean; comparable: boolean } {
  const c = checkProof(spec, answer, same)
  return { correct: c.ok, comparable: c.lines.length > 0 && c.unread === null }
}

/** Why an identity to prove cannot be used, or null: both sides are maths that can be read, they are not written the same, and they are equal (it is an identity). */
export function proofProblem(spec: ProofSpec, same: SameCheck): string | null {
  const verdict = same(spec.left, spec.right)
  if (verdict === null) return 'the left and the right side are maths Jemma can read, like sin^2 x/(1 - cos x)'
  if (spec.left.replace(/\s+/g, '') === spec.right.replace(/\s+/g, '')) return 'the two sides are written differently'
  if (!verdict) return 'the two sides are not equal, so there is no identity to prove'
  return null
}

/** Why the key of an identity to prove is not a proof of it, or null: 3 to 6 different lines, each following from the one before, ending on the right side. */
export function proofKeyProblem(q: { answer: string; answerKind: string; proof: ProofSpec }, same: SameCheck): string | null {
  if (q.answerKind !== 'list') return 'a proof has a list answer: its lines, with a semicolon between them'
  const c = checkProof(q.proof, q.answer, same)
  if (c.lines.length < PROOF_MIN_LINES || c.lines.length > PROOF_MAX_LINES) return `the answer is a proof of ${PROOF_MIN_LINES} to ${PROOF_MAX_LINES} lines`
  if (c.unread !== null) return `line ${c.unread + 1} of the answer cannot be read: write it as plain maths, like (1 - cos^2 x)/(1 - cos x)`
  if (c.wrong !== null) return c.wrong === 0 ? 'the first line of the answer is not equal to the left side' : `line ${c.wrong + 1} of the answer is not equal to line ${c.wrong}`
  if (!c.reached) return 'the last line of the answer is the right side'
  if (!c.enough) return 'each line of the answer is written differently from the line before it'
  return null
}

/** A proof question as it is saved: its list is ordered. */
export function tidyProof<Q extends { answerKind: string; proof?: ProofSpec; ordered?: boolean }>(q: Q): Q {
  if (!q.proof || q.answerKind !== 'list') return q
  return { ...q, ordered: true }
}

/** The answer the lines make (`a; b; c`), or '' while fewer than 3 lines hold something. */
export function proofAnswer(lines: string[]): string {
  const written = lines.map((l) => l.trim()).filter(Boolean)
  return written.length >= PROOF_MIN_LINES ? written.join('; ') : ''
}
