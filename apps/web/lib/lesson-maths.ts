// What a teaching lesson hands the typesetter (P144b). Pure: no browser, no database.
//
// The shared typesetter (app/k/session/_parts/typeset.ts) reads two or three letters with no number or bracket before them as a WORD in every class ("ab",
// "and/or"): so "ax^2" and "mx" split a line of maths and show as raw text ("y = ax^2 + q" drew "y" and left "ax^2" in words). A lesson knows that its
// text is maths, so it writes such a product as separate letters ("a x^2": the same maths, drawn the same, which the typesetter does read) before the
// typesetter sees it. It also writes "x in R" as "x ∈ ℝ", the names of Greek letters (theta, alpha, beta, gamma, delta, as whole words) as the letters, and
// "sqrt[2](x)" and "sqrt[3](x)" as the square root and the cube root the typesetter draws. Nothing that typesets today is changed, and a word is never touched:
// only a lowercase run of two or three letters straight before a power, or standing next to a sign of maths, and not a word of the language or a function.
// The `speech` of a block never comes through here: the voice keeps saying "theta" and "square root of".

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
/** What may stand on the far side of a hyphen for it to be a minus: one letter, or a piece that holds a digit, a bracket or a power. A word does not. */
const MINUS_FAR = /^[A-Za-z]$|[0-9()^]/

const spaced = (letters: string) => letters.split('').join(' ')

/** The letters of a unit: "(cm)^2" is an area, never c times m. */
const UNITS = new Set(['cm', 'mm', 'km', 'ml', 'kg', 'mg', 'cl', 'dl', 'ha', 'ft', 'yd', 'mi', 'oz', 'lb', 'sec', 'min', 'hr'])

/** The little digits of a power, for the name of a side of a triangle: "OS^2" is "OS²" (words, as the typesetter reads "OS" as a word, with the power raised). */
const RAISED = '⁰¹²³⁴⁵⁶⁷⁸⁹'
const CAPITAL_POWER = /^([A-Z]{2,3})\^([0-9]{1,2})(.*)$/
/** A run of two or three letters inside a token, with what may stand round it: an opening bracket or a function name and a bracket before, a closing bracket and a mark after. */
const BRACKETED_RUN = /^((?:[a-z]*\(+)?)([a-z]{2,3})([)\]]*[.,;:?!]*)$/

/** The Greek letters a lesson writes by name. Whole words only, lowercase: "betaken" and "Alphabet" are words. */
const GREEK: Record<string, string> = { theta: 'θ', alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ' }
/** "tanx" for "tan x": a function and the letter x run together. Only x, so that "sine", "cosine" and "secant" are never cut. */
const RUN_ON = /\b(sin|cos|tan|cosec|sec|cot)x\b/g

/**
 * The text of a lesson as the typesetter should read it: "ax^2" as "a x^2", "mx + c" as "m x + c", "x in R" as "x ∈ ℝ", "sin theta" as "sin θ",
 * "sqrt[3](8)" as "cbrt(8)". Text with none of these is returned exactly as it came.
 */
export function readableMaths(text: string): string {
  const out = text
    .replace(/\b(theta|alpha|beta|gamma|delta)\b/g, (word) => GREEK[word]!)
    .replace(RUN_ON, '$1 x')
    .replace(/sqrt\[2\]/g, 'sqrt')
    .replace(/sqrt\[3\]/g, 'cbrt')
    .replace(/\b([A-Za-z])\s+in\s+R\b(?![A-Za-z0-9])/g, '$1 ∈ ℝ')
    .replace(/∈\s*R\b(?![A-Za-z0-9])/g, '∈ ℝ')
    // The power of a unit of length (cm^2, mm^3): the raised digit, in words. A unit is never maths, so the typesetter left "cm^2" as it was with its caret.
    .replace(/\b(cm|mm|km|dm)\^([23])(?![0-9])/g, (_all, unit: string, power: string) => `${unit}${power === '2' ? '²' : '³'}`)
    // A product of letters in an exponent ("a^(mn)"), a product of letters in a bracket with a power on it ("(xk)^2"), and a power with a letter straight
    // after it ("x^2k^2", "b^2q"): written with the letters apart, which the typesetter reads.
    .replace(/\^\(([a-z]{2,3})\)/g, (_all, letters: string) => `^(${spaced(letters)})`)
    .replace(/\(([a-z]{2,3})\)(?=\^)/g, (all, letters: string) => (UNITS.has(letters) || WORDS.has(letters) || FUNCTIONS.has(letters) ? all : `(${spaced(letters)})`))
    .replace(/(\^[0-9]+)(?=[a-z])/g, '$1 ')
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
    if (power && !FUNCTIONS.has(power[1]!) && !UNITS.has(power[1]!)) {
      const letters = power[1]!
      parts[i] = `${spaced(letters.slice(0, -1))} ${letters.slice(-1)}${power[2]!}`
      return
    }
    // The name of a side of a triangle with a power: "OS^2" is "OS²". A power of a pair of capitals is a length, never a product of letters.
    const side = CAPITAL_POWER.exec(token)
    if (side) {
      parts[i] = `${side[1]!}${[...side[2]!].map((d) => RAISED[Number(d)]).join('')}${side[3]!}`
      return
    }
    const run = BRACKETED_RUN.exec(token)
    if (!run) return
    const core = run[2]!
    if (FUNCTIONS.has(core) || WORDS.has(core) || UNITS.has(core)) return
    // In a bracket a word is as likely as a product ("P(red) + P(blue)", "(row) + (column)"): only a run with x, y or z in it, a variable, is a product there.
    if ((run[1]! !== '' || run[3]!.includes(')')) && !/[xyz]/.test(core)) return
    if (sign(k, -1) || sign(k, 1)) parts[i] = `${run[1]!}${spaced(core)}${run[3]!}`
  })
  return parts.join('')
}

// ---- The nth root (P144b) --------------------------------------------------------------------------------------------------------
//
// A lesson writes the nth root of a as "sqrt[n](a)". The typesetter has the square root and the cube root and no other, so it read "sqrt[n](a)" as a
// square root of n and drew it wrong. The reader draws it itself (LessonText): each `sqrt[n](...)` is handed to the typesetter as a letter that cannot be
// anything else, and the LaTeX of the root takes the letter's place in what the typesetter makes. This part is the pure half.

/** The letters that stand in for a root while the typesetter reads the line: Greek letters the typesetter accepts and a lesson never writes by name. */
export const ROOT_MARKS = ['ω', 'λ', 'φ'] as const

export type NthRoot = { mark: string; index: string; radicand: string }

/** The place of the bracket that closes the one opened at `open`, or -1. */
function closing(text: string, open: number): number {
  let depth = 0
  for (let i = open; i < text.length; i++) {
    if (text[i] === '(') depth++
    else if (text[i] === ')' && --depth === 0) return i
  }
  return -1
}

/**
 * The roots of a text written "sqrt[n](...)", each taken out and replaced by a mark, in order. `left` is true when a "sqrt[" is still in the text (more roots
 * than marks, a bracket that does not close, or a mark already in the text): the caller then writes the roots as signs instead (`rootSigns`).
 */
export function takeNthRoots(text: string): { text: string; roots: NthRoot[]; left: boolean } {
  const roots: NthRoot[] = []
  if (!text.includes('sqrt[') || ROOT_MARKS.some((m) => text.includes(m))) return { text, roots, left: text.includes('sqrt[') }
  let out = ''
  let at = 0
  for (const m of text.matchAll(/sqrt\[([A-Za-z0-9]{1,2})\]\(/g)) {
    const open = m.index! + m[0].length - 1
    const close = closing(text, open)
    if (m.index! < at || close < 0 || roots.length >= ROOT_MARKS.length) continue
    const mark = ROOT_MARKS[roots.length]!
    roots.push({ mark, index: m[1]!, radicand: text.slice(open + 1, close) })
    out += text.slice(at, m.index!) + mark
    at = close + 1
  }
  out += text.slice(at)
  return { text: out, roots, left: out.includes('sqrt[') }
}

const SUP: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', n: 'ⁿ', m: 'ᵐ', k: 'ᵏ' }

/** The root written as signs, for a line the reader cannot draw: "sqrt[n](a)" as "ⁿ√(a)" (the index raised, the root sign, the same brackets). */
export const rootSigns = (text: string): string =>
  text.replace(/sqrt\[([A-Za-z0-9]{1,2})\]/g, (_all, index: string) => ([...index].every((c) => SUP[c]) ? [...index].map((c) => SUP[c]).join('') : `[${index}]`) + '√')
