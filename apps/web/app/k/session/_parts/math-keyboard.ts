import { strandOf, type Strand, type TypedKind } from './maths-keys'

// P132: the keys of the maths editor's own keyboard, by what the question is about and what kind of answer it takes. Pure functions: MathLive is given
// the object they return (its custom layout format), nothing here touches the editor or the page.
//
// Every row is seven keys wide, so the keys of every row are the same size: 360 px is 7 keys of 48 px, the size the P90 rule asks for.
//   Row 1  + - x / = ( )                 always, the signs a child uses most
//   Row 2  fraction, square root, cube root, x squared, x to a power, backspace (two wide)
//   Row 3  the keys of the topic: x y for algebra, sin cos tan for trigonometry, f(x) for functions, d/dx for calculus, % and R for money
//   Row 4  1 2 3 4 5, and the arrows (to leave a fraction or a power)
//   Row 5  6 7 8 9 0, the decimal comma, and hide the keyboard

/** One key, in the shape the editor takes: `latex` is its face and what it types unless `insert` says more (#@ is what is before the cursor, #? an empty box). */
export type Keycap = { latex?: string; label?: string; insert?: string; class?: string; width?: 0.5 | 1 | 1.5 | 2 | 5; tooltip?: string }
export type KeyboardLayout = { id: string; label: string; tooltip: string; displayEditToolbar: false; displayShiftedKeycaps: false; rows: (string | Keycap)[][] }

/** Units a row is wide. */
export const ROW_WIDTH = 7

const cap = (tooltip: string, extra: Keycap): Keycap => ({ tooltip, ...extra })

export const CAPS = {
  plus: cap('plus', { latex: '+', class: 'big-op' }),
  minus: cap('minus', { latex: '-', label: '&#x2212;', class: 'big-op' }),
  times: cap('times', { latex: '\\times', class: 'big-op' }),
  divide: cap('divided by', { latex: '\\div', class: 'big-op' }),
  equals: cap('equals', { latex: '=', class: 'big-op' }),
  open: cap('open bracket', { latex: '(', class: 'big-op' }),
  close: cap('close bracket', { latex: ')', class: 'big-op' }),
  fraction: cap('fraction', { latex: '\\frac{#@}{#?}' }),
  sqrt: cap('square root', { latex: '\\sqrt{#0}' }),
  cbrt: cap('cube root', { latex: '\\sqrt[3]{#0}' }),
  squared: cap('squared', { latex: 'x^2', insert: '#@^2' }),
  power: cap('to the power of', { latex: 'x^{\\square}', insert: '#@^{#?}' }),
  backspace: cap('backspace', { label: '[backspace]', class: 'action', width: 2 }),
  left: cap('move left', { label: '[left]' }),
  right: cap('move right', { label: '[right]' }),
  hide: cap('hide the keyboard', { label: '[hide-keyboard]', width: 1 }),
  comma: cap('decimal comma', { latex: '{,}', label: ',', insert: '{,}', class: 'big-op' }),
  x: cap('x', { latex: 'x' }),
  y: cap('y', { latex: 'y' }),
  theta: cap('theta', { latex: '\\theta' }),
  pi: cap('pi', { latex: '\\pi' }),
  degree: cap('degrees', { latex: '{}^{\\circ}', insert: '^{\\circ}' }),
  sin: cap('sine', { label: 'sin', insert: '\\sin\\left(#?\\right)', class: 'small' }),
  cos: cap('cosine', { label: 'cos', insert: '\\cos\\left(#?\\right)', class: 'small' }),
  tan: cap('tangent', { label: 'tan', insert: '\\tan\\left(#?\\right)', class: 'small' }),
  fx: cap('f of x', { latex: 'f(x)', insert: 'f\\left(x\\right)', class: 'small' }),
  fPrime: cap('f prime of x', { latex: "f'(x)", insert: 'f^{\\prime}\\left(x\\right)', class: 'small' }),
  dydx: cap('d y by d x', { latex: '\\frac{dy}{dx}', insert: '\\frac{dy}{dx}', class: 'small' }),
  percent: cap('percent', { latex: '\\%' }),
  rand: cap('rand', { latex: 'R' }),
  plusMinus: cap('plus or minus', { latex: '\\pm' }),
  or: cap('or', { label: 'or', insert: '\\text{ or }', class: 'small' }),
} as const satisfies Record<string, Keycap>

const DIGITS_A = ['[1]', '[2]', '[3]', '[4]', '[5]'] as const
const DIGITS_B = ['[6]', '[7]', '[8]', '[9]', '[0]'] as const

/** The third row: the keys of the topic, for each kind of answer. A number has no letter; an equation has "or" and plus-or-minus. */
const TOPIC_ROWS: Record<TypedKind, Partial<Record<Strand, (string | Keycap)[]>> & { algebra: (string | Keycap)[] }> = {
  expression: {
    algebra: [CAPS.x, CAPS.y, CAPS.pi],
    trigonometry: [CAPS.sin, CAPS.cos, CAPS.tan, CAPS.theta, CAPS.degree, CAPS.pi, CAPS.x],
    functions: [CAPS.x, CAPS.y, CAPS.fx, CAPS.pi],
    calculus: [CAPS.x, CAPS.y, CAPS.dydx, CAPS.fPrime],
    finance: [CAPS.x, CAPS.y, CAPS.percent, CAPS.rand],
    data: [CAPS.x, CAPS.y, CAPS.percent, CAPS.rand],
  },
  equation: {
    algebra: [CAPS.x, CAPS.y, CAPS.plusMinus, CAPS.or],
    trigonometry: [CAPS.theta, CAPS.degree, CAPS.pi, CAPS.or, CAPS.plusMinus, CAPS.sin, CAPS.cos],
    functions: [CAPS.x, CAPS.y, CAPS.plusMinus, CAPS.or],
    finance: [CAPS.x, CAPS.percent, CAPS.rand, CAPS.or],
    data: [CAPS.x, CAPS.percent, CAPS.rand, CAPS.or],
  },
  number: {
    algebra: [CAPS.pi, CAPS.degree, CAPS.percent],
    trigonometry: [CAPS.sin, CAPS.cos, CAPS.tan, CAPS.degree, CAPS.pi],
    finance: [CAPS.rand, CAPS.percent],
    data: [CAPS.percent, CAPS.rand],
  },
}

/** A key is one unit wide unless it says more; a key given as a plain string (a digit, a blank) is one. */
const unitsOf = (key: string | Keycap): number => (typeof key === 'string' ? 1 : (key.width ?? 1))

/** A row of exactly seven units: the keys, then blank keys to fill it. */
const filled = (keys: (string | Keycap)[]): (string | Keycap)[] => {
  const used = keys.reduce((n, k) => n + unitsOf(k), 0)
  return [...keys, ...Array.from({ length: Math.max(0, ROW_WIDTH - used) }, () => '[separator]')]
}

/** The keyboard of one question. */
export function keyboardLayout(input: { kind: TypedKind; topic?: string; prompt?: string }): KeyboardLayout {
  const strand = strandOf(input.topic, input.prompt)
  const topic = TOPIC_ROWS[input.kind][strand] ?? TOPIC_ROWS[input.kind].algebra
  return {
    id: `jemma-${input.kind}-${strand}`,
    label: 'Maths',
    tooltip: 'Jemma maths keys',
    displayEditToolbar: false,
    displayShiftedKeycaps: false,
    rows: [
      [CAPS.plus, CAPS.minus, CAPS.times, CAPS.divide, CAPS.equals, CAPS.open, CAPS.close],
      [CAPS.fraction, CAPS.sqrt, CAPS.cbrt, CAPS.squared, CAPS.power, CAPS.backspace],
      filled(topic),
      [...DIGITS_A, CAPS.left, CAPS.right],
      [...DIGITS_B, CAPS.comma, CAPS.hide],
    ],
  }
}

/** The name of a key for a screen reader and for a test: its tooltip, a digit, or its label. */
export function keyName(key: string | Keycap): string {
  if (typeof key === 'string') return key
  return key.tooltip ?? key.label ?? key.latex ?? ''
}

/** The units of a row, for a test of the layout. */
export const rowUnits = (row: (string | Keycap)[]): number => row.reduce((n, k) => n + unitsOf(k), 0)
