import type { Form } from '@jemma/profiling/schemas'

// P125: the keys under the answer box of a senior class. A phone's keyboard has the digits and the letters; these keys type the maths signs it does not
// have. Which keys a question gets depends on what it is about (its strand) and on what kind of answer it takes. Pure functions: no screen, no database.

export const MINUS = '−'
const PI = 'π'
const THETA = 'θ'
const DEGREE = '°'
const PRIME = '′'

/**
 * One key. `insert` is the text it puts into the box at the cursor. `back` moves the cursor that many characters back from the end of what was
 * put in (a root puts in √() and leaves the cursor between the brackets). `closes` is the close bracket: when the next character is the close bracket a
 * root or a function put there, it steps over it instead of adding a second one.
 */
export type MathKey = { text: string; insert: string; label: string; back?: number; closes?: boolean }

const key = (text: string, label: string, insert = text, extra: Partial<MathKey> = {}): MathKey => ({ text, insert, label, ...extra })

export const KEYS = {
  x: key('x', 'x'),
  y: key('y', 'y'),
  squared: key('²', 'squared'),
  power: key('^', 'to the power of'),
  fraction: key('a/b', 'fraction', '/'),
  open: key('(', 'open bracket'),
  close: key(')', 'close bracket', ')', { closes: true }),
  minus: key(MINUS, 'minus'),
  subtract: key(MINUS, 'subtract'),
  plus: key('+', 'plus'),
  times: key('×', 'times'),
  divide: key('÷', 'divided by'),
  root: key('√', 'square root', '√()', { back: 1 }),
  pi: key(PI, 'pi'),
  theta: key(THETA, 'theta'),
  degree: key(DEGREE, 'degrees'),
  sin: key('sin', 'sine', 'sin()', { back: 1 }),
  cos: key('cos', 'cosine', 'cos()', { back: 1 }),
  tan: key('tan', 'tangent', 'tan()', { back: 1 }),
  comma: key(',', 'decimal comma'),
  equals: key('=', 'equals', ' = '),
  or: key('or', 'or', ' or '),
  plusMinus: key('±', 'plus or minus'),
  semicolon: key(';', 'semicolon', '; '),
  fx: key('f(x)', 'f of x', 'f(x) = '),
  fPrime: key(`f${PRIME}(x)`, 'f prime of x', `f${PRIME}(x) = `),
  dydx: key('d/dx', 'd by dx', 'd/dx = '),
  percent: key('%', 'percent'),
  rand: key('R', 'rand'),
} as const satisfies Record<string, MathKey>

export type Strand = 'algebra' | 'trigonometry' | 'functions' | 'calculus' | 'finance' | 'data'
export type TypedKind = 'number' | 'expression' | 'equation'
export type KeySet = { keys: MathKey[]; more: MathKey[] }

const wordsOf = (s: string | undefined) => (s ?? '').toLowerCase()

/** True when the question asks for a derivative. A calculus topic alone does not: only a question that asks for one gets the derivative keys. */
const asksDerivative = (text: string) => /\b(derivative|differentiate|differentiating|differentiation)\b|d\/dx|dy\/dx|f\s*['′’]\s*\(|rate of change|gradient function/.test(text)
const isTrigonometry = (text: string) => /\b(sin|cos|tan|sine|cosine|tangent|trigonometry|trigonometric|trig|radians?|degrees?)\b|°|θ|\b(sin|cos|tan)\s*[\d(²^]/.test(text)
const isFunctions = (text: string) =>
  /\b(function|functions|graph|graphs|gradient|intercepts?|parabola|hyperbola|asymptote|turning point|analytical|coordinates?|axis|axes|slope|midpoint|f\(x\)|straight line)\b|f\(x\)/.test(text)
const isFinance = (text: string) =>
  /\b(interest|rands?|profit|loss|discount|vat|tax|budget|salary|wages?|invest\w*|loans?|deposit|inflation|exchange rate|commission|price|cost|percent|percentage|percentages)\b|%|\br\s?\d/.test(text)
const isData = (text: string) => /\b(mean|median|mode|probability|data|frequency|quartiles?|average|histogram|chance|standard deviation|statistics|statistical)\b/.test(text)

/**
 * What a question is about, from the name of its topic and the words of the question. The first that fits wins, in this order: a derivative,
 * trigonometry, functions and graphs, finance, data. Anything else is algebra.
 */
export function strandOf(topic: string | undefined, prompt: string | undefined): Strand {
  const text = `${wordsOf(topic)} ${wordsOf(prompt)}`
  if (asksDerivative(text)) return 'calculus'
  if (isTrigonometry(text)) return 'trigonometry'
  if (isFunctions(text)) return 'functions'
  if (isFinance(text)) return 'finance'
  if (isData(text)) return 'data'
  return 'algebra'
}

const k = KEYS

/** Ten keys to see (two rows of five on a phone) and up to ten more behind the More key. */
const SETS: Record<TypedKind, Partial<Record<Strand, { keys: MathKey[]; more: MathKey[] }>> & { algebra: { keys: MathKey[]; more: MathKey[] } }> = {
  expression: {
    algebra: { keys: [k.x, k.y, k.squared, k.power, k.fraction, k.open, k.close, k.minus, k.plus, k.root], more: [k.times, k.divide, k.pi, k.comma] },
    trigonometry: {
      keys: [k.sin, k.cos, k.tan, k.theta, k.degree, k.pi, k.x, k.minus, k.open, k.close],
      more: [k.y, k.squared, k.power, k.fraction, k.root, k.plus, k.times, k.divide, k.comma],
    },
    functions: { keys: [k.x, k.y, k.squared, k.power, k.fraction, k.open, k.close, k.minus, k.plus, k.fx], more: [k.root, k.times, k.divide, k.comma, k.semicolon] },
    calculus: { keys: [k.x, k.y, k.squared, k.power, k.fraction, k.open, k.close, k.minus, k.dydx, k.fPrime], more: [k.plus, k.root, k.times, k.divide, k.pi, k.comma] },
    finance: { keys: [k.x, k.y, k.squared, k.power, k.fraction, k.open, k.close, k.minus, k.plus, k.percent], more: [k.times, k.divide, k.rand, k.root, k.comma] },
    data: { keys: [k.x, k.y, k.squared, k.power, k.fraction, k.open, k.close, k.minus, k.plus, k.root], more: [k.times, k.divide, k.percent, k.comma] },
  },
  equation: {
    algebra: { keys: [k.x, k.equals, k.minus, k.or, k.plusMinus, k.fraction, k.root, k.squared, k.open, k.close], more: [k.power, k.plus, k.times, k.divide, k.comma, k.semicolon] },
    trigonometry: {
      keys: [k.theta, k.equals, k.minus, k.or, k.degree, k.pi, k.x, k.fraction, k.root, k.plusMinus],
      more: [k.sin, k.cos, k.tan, k.open, k.close, k.squared, k.plus, k.times, k.divide, k.comma],
    },
    functions: { keys: [k.x, k.equals, k.minus, k.or, k.plusMinus, k.fraction, k.root, k.semicolon, k.open, k.close], more: [k.squared, k.power, k.plus, k.times, k.divide, k.comma] },
    finance: { keys: [k.x, k.equals, k.minus, k.or, k.percent, k.fraction, k.root, k.squared, k.open, k.close], more: [k.rand, k.power, k.plus, k.times, k.divide, k.comma, k.plusMinus] },
    data: { keys: [k.x, k.equals, k.minus, k.or, k.percent, k.fraction, k.root, k.squared, k.open, k.close], more: [k.power, k.plus, k.times, k.divide, k.comma, k.plusMinus] },
  },
  number: {
    algebra: { keys: [k.subtract, k.fraction, k.root, k.power, k.squared, k.open, k.close, k.plus, k.times, k.divide], more: [k.comma, k.pi, k.degree, k.percent] },
    trigonometry: {
      keys: [k.sin, k.cos, k.tan, k.degree, k.pi, k.subtract, k.fraction, k.root, k.open, k.close],
      more: [k.power, k.squared, k.plus, k.times, k.divide, k.comma],
    },
    finance: { keys: [k.rand, k.percent, k.subtract, k.fraction, k.plus, k.times, k.divide, k.open, k.close, k.power], more: [k.root, k.squared, k.comma, k.pi] },
    data: { keys: [k.percent, k.rand, k.subtract, k.fraction, k.plus, k.times, k.divide, k.open, k.close, k.root], more: [k.power, k.squared, k.comma, k.pi] },
  },
}

/**
 * The keys of one question: what to show, and what is behind More. `form` does not change them (the help line says what form is asked). A derivative
 * question gets the derivative keys on an expression; an equation or a number answer of such a question has the ones of its own kind.
 */
export function keySet(input: { kind: TypedKind; topic?: string; prompt?: string; form?: Form }): KeySet {
  const strand = strandOf(input.topic, input.prompt)
  const sets = SETS[input.kind]
  const own = sets[strand] ?? sets.algebra
  return { keys: own.keys, more: own.more }
}

/** What a number box takes: digits, a comma or a point, the signs, brackets, pi, roots, degrees, a percent, a rand sign, and the letters of sin, cos, tan, sqrt and pi. */
export const numberChars = (s: string, max: number): string =>
  s.replace(/[^\d.,\-−+×÷*/()^²³√π°%\s±sincotaqrpR]/g, '').slice(0, max)

/** A minus in front of the text, or none: the minus key of a number toggles it (a typed hyphen and the minus sign are the same). */
export const toggleSign = (v: string, max: number): string => (/^[-−]/.test(v) ? v.slice(1) : `-${v}`.slice(0, max))

/** The text and where the cursor goes after a key is pressed in a box holding `value`, with the cursor (or the selection) from `from` to `to`. Null: nothing changes. */
export function pressKey(value: string, from: number, to: number, pressed: MathKey, max: number): { text: string; caret: number } | null {
  // The close bracket of a root or a function is already there: step over it. Only when no bracket is left open, so a bracket the child opened is still closed.
  if (pressed.closes && from === to && value[from] === ')') {
    const open = (value.match(/\(/g) ?? []).length - (value.match(/\)/g) ?? []).length
    if (open <= 0) return { text: value, caret: from + 1 }
  }
  const text = value.slice(0, from) + pressed.insert + value.slice(to)
  if (text.length > max) return null
  return { text, caret: from + pressed.insert.length - (pressed.back ?? 0) }
}
