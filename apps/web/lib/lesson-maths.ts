// What a teaching lesson hands the typesetter (P144b). Pure: no browser, no database.
//
// The shared typesetter (app/k/session/_parts/typeset.ts) reads two or three letters with no number or bracket before them as a WORD in every class ("ab",
// "and/or"): so "ax^2" and "mx" split a line of maths and show as raw text ("y = ax^2 + q" drew "y" and left "ax^2" in words). A lesson knows that its
// text is maths, so it writes such a product as separate letters ("a x^2": the same maths, drawn the same, which the typesetter does read) before the
// typesetter sees it. It also writes "x in R" as "x ∈ ℝ". Nothing that typesets today is changed, and a word is never touched: only a lowercase run of two
// or three letters straight before a power, or standing next to a sign of maths, and not a word of the language or a function.

/** Letters that are a function, not a product: sin^2 x is not s i n squared. */
const FUNCTIONS = new Set(['sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'sqrt', 'cbrt', 'ln', 'log', 'exp', 'abs', 'asin', 'acos', 'atan'])

/** Short words of the language that can stand next to a sign in a line of a lesson ("one + two", "the + rest"): never a product of letters. */
const WORDS = new Set([
  'a', 'an', 'and', 'any', 'are', 'as', 'at', 'be', 'big', 'but', 'by', 'can', 'did', 'do', 'few', 'for', 'get', 'has', 'how', 'if', 'in', 'is', 'it', 'its', 'let', 'may', 'me', 'my',
  'new', 'no', 'not', 'now', 'of', 'old', 'on', 'one', 'or', 'our', 'out', 'own', 'per', 'say', 'see', 'set', 'six', 'so', 'sum', 'ten', 'the', 'to', 'too', 'two', 'up', 'us', 'use', 'was', 'we',
  'who', 'why', 'yes', 'you', 'add', 'all', 'ask', 'end', 'got', 'put', 'run', 'try', 'way', 'win', 'zero',
])

const SUPERSCRIPT = '⁰¹²³⁴⁵⁶⁷⁸⁹⁻'
/** Two or three lowercase letters straight before a power: "ax^2", "ab^(x", "ax²". */
const BEFORE_POWER = new RegExp(`^([a-z]{2,3})([\\^${SUPERSCRIPT}].*)$`)
/** A sign of maths standing alone between spaces. The hyphen is handled apart (it is also the dash of a sentence). */
const SIGN = /^[=+*/<>≤≥≠±×÷−]$/
/** What may stand on the far side of a hyphen for it to be a minus: a number, one letter (with a power), or an opening bracket. */
const MINUS_FAR = /^(?:\d+(?:[.,]\d+)?|[A-Za-z](?:\^\S*)?|\(\S*)$/

const spaced = (letters: string) => letters.split('').join(' ')

/**
 * The text of a lesson as the typesetter should read it: "ax^2" as "a x^2", "mx + c" as "m x + c", "x in R" as "x ∈ ℝ". Text with none of these is returned
 * exactly as it came.
 */
export function readableMaths(text: string): string {
  const out = text.replace(/\b([A-Za-z])\s+in\s+R\b(?![A-Za-z0-9])/g, '$1 ∈ ℝ').replace(/∈\s*R\b(?![A-Za-z0-9])/g, '∈ ℝ')
  const parts = out.split(/(\s+)/)
  const at: number[] = []
  parts.forEach((p, i) => {
    if (i % 2 === 0 && p !== '') at.push(i)
  })

  /** Is the token at `k + step` a sign of maths next to the token at `k`? */
  const sign = (k: number, step: -1 | 1): boolean => {
    const next = at[k + step]
    if (next === undefined) return false
    const tok = parts[next]!
    if (SIGN.test(tok)) return true
    if (tok !== '-') return false
    const far = at[k + 2 * step]
    return far !== undefined && MINUS_FAR.test(parts[far]!)
  }

  at.forEach((i, k) => {
    const token = parts[i]!
    const power = BEFORE_POWER.exec(token)
    if (power && !FUNCTIONS.has(power[1]!)) {
      const letters = power[1]!
      parts[i] = `${spaced(letters.slice(0, -1))} ${letters.slice(-1)}${power[2]!}`
      return
    }
    const core = token.replace(/[.,;:?!]+$/, '')
    if (!/^[a-z]{2,3}$/.test(core) || FUNCTIONS.has(core) || WORDS.has(core)) return
    if (sign(k, -1) || sign(k, 1)) parts[i] = spaced(core) + token.slice(core.length)
  })
  return parts.join('')
}
