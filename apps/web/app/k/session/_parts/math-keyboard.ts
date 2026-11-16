import { strandOf, type Strand, type TypedKind } from './maths-keys'

// P132: the keyboard of the maths editor, as tabs by kind of symbol, the way a graphing calculator keyboard is laid out: the signs and numbers, the letters
// that stand for numbers, the functions and constants, the signs of geometry and the Greek letters, and calculus. A letter never looks like a sign: the
// letters are italic maths letters on their own tab, and the times key is the cross. Pure functions: MathLive is given the object they return (its custom
// layout format, one layer for each tab); nothing here touches the editor or the page.
//
// Every row is seven keys wide, so each key is 48 px on a 360 px phone (the editor's default is ten to a row, 36 px).
//   123    the signs + - x / = ( ), then fraction, square root, cube root, x squared, x to a power and backspace, then the digits, the decimal comma, the arrows
//   abc    the letters, italic: x y k p n t a b c m first, then the rest
//   f(x)   sin cos tan and their inverses, |x|, log ln e, pi, f(x), % and R, the relations < > <= >= != and plus or minus
//   angle  the degree sign, theta and the Greek letters, the signs of geometry (angle, triangle, perpendicular, parallel, congruent, similar)
//   calc   d/dx, f'(x), the integral, lim, the sum, infinity, e, ln
// A number has no letters, so its keyboard has no abc and no calculus tab. The faces of the keys are textbook maths (LaTeX drawn by the editor), never
// text with a slash or a caret.

/** One key, in the shape the editor takes: `latex` is its face and what it types unless `insert` says more (#@ is what is before the cursor, #? an empty box). */
export type Keycap = {
  latex?: string
  label?: string
  insert?: string
  class?: string
  width?: 0.5 | 1 | 1.5 | 2 | 5
  tooltip?: string
  command?: string | [string, string]
}
export type KeyboardLayer = { id: string; style: string; rows: (string | Keycap)[][] }
export type KeyboardLayout = { id: string; label: string; tooltip: string; displayEditToolbar: false; displayShiftedKeycaps: false; layers: KeyboardLayer[] }

/** Units a row is wide. */
export const ROW_WIDTH = 7

const cap = (tooltip: string, extra: Keycap): Keycap => ({ tooltip, ...extra })
const BLANK = '[separator]'

/** A letter key: the letter as an italic maths letter. */
const letter = (c: string): Keycap => cap(`the letter ${c}`, { latex: c })

export const CAPS = {
  plus: cap('plus', { latex: '+', class: 'big-op' }),
  minus: cap('minus', { latex: '-', label: '&#x2212;', class: 'big-op' }),
  times: cap('times', { latex: '\\times', class: 'big-op' }),
  divide: cap('divided by', { latex: '\\div', class: 'big-op' }),
  equals: cap('equals', { latex: '=', class: 'big-op' }),
  open: cap('open bracket', { latex: '(', class: 'big-op' }),
  close: cap('close bracket', { latex: ')', class: 'big-op' }),
  fraction: cap('fraction', { latex: '\\frac{\\square}{\\square}', insert: '\\frac{#@}{#?}' }),
  sqrt: cap('square root', { latex: '\\sqrt{\\square}', insert: '\\sqrt{#0}' }),
  cbrt: cap('cube root', { latex: '\\sqrt[3]{\\square}', insert: '\\sqrt[3]{#0}' }),
  squared: cap('squared', { latex: 'x^2', insert: '#@^2' }),
  power: cap('to the power of', { latex: 'x^{\\square}', insert: '#@^{#?}' }),
  backspace: cap('backspace', { label: '[backspace]', class: 'action', width: 2 }),
  backspaceNarrow: cap('backspace', { label: '[backspace]', class: 'action', width: 1 }),
  left: cap('move left', { label: '[left]' }),
  right: cap('move right', { label: '[right]' }),
  hide: cap('hide the keyboard', { label: '[hide-keyboard]', width: 2 }),
  comma: cap('decimal comma', { latex: '{,}', label: ',', insert: '{,}', class: 'big-op' }),
  // functions and constants
  sin: cap('sine', { latex: '\\sin', insert: '\\sin\\left(#?\\right)', class: 'small' }),
  cos: cap('cosine', { latex: '\\cos', insert: '\\cos\\left(#?\\right)', class: 'small' }),
  tan: cap('tangent', { latex: '\\tan', insert: '\\tan\\left(#?\\right)', class: 'small' }),
  asin: cap('inverse sine', { latex: '\\sin^{-1}', insert: '\\sin^{-1}\\left(#?\\right)', class: 'small' }),
  acos: cap('inverse cosine', { latex: '\\cos^{-1}', insert: '\\cos^{-1}\\left(#?\\right)', class: 'small' }),
  atan: cap('inverse tangent', { latex: '\\tan^{-1}', insert: '\\tan^{-1}\\left(#?\\right)', class: 'small' }),
  abs: cap('absolute value', { latex: '\\left|\\square\\right|', insert: '\\left|#0\\right|' }),
  log: cap('logarithm', { latex: '\\log', insert: '\\log\\left(#?\\right)', class: 'small' }),
  ln: cap('natural logarithm', { latex: '\\ln', insert: '\\ln\\left(#?\\right)', class: 'small' }),
  e: cap('the number e', { latex: '\\mathrm{e}' }),
  pi: cap('pi', { latex: '\\pi' }),
  fx: cap('f of x', { latex: 'f(x)', insert: 'f\\left(x\\right)', class: 'small' }),
  percent: cap('percent', { latex: '\\%' }),
  rand: cap('rand', { latex: 'R' }),
  less: cap('less than', { latex: '<' }),
  greater: cap('greater than', { latex: '>' }),
  lessEqual: cap('less than or equal to', { latex: '\\le' }),
  greaterEqual: cap('greater than or equal to', { latex: '\\ge' }),
  notEqual: cap('not equal to', { latex: '\\ne' }),
  plusMinus: cap('plus or minus', { latex: '\\pm' }),
  or: cap('or', { label: 'or', insert: '\\text{ or }', class: 'small' }),
  // geometry and Greek letters
  degree: cap('degrees', { latex: '{}^{\\circ}', insert: '^{\\circ}' }),
  theta: cap('theta', { latex: '\\theta' }),
  alpha: cap('alpha', { latex: '\\alpha' }),
  beta: cap('beta', { latex: '\\beta' }),
  gamma: cap('gamma', { latex: '\\gamma' }),
  delta: cap('delta', { latex: '\\delta' }),
  phi: cap('phi', { latex: '\\phi' }),
  angle: cap('angle', { latex: '\\angle' }),
  triangle: cap('triangle', { latex: '\\triangle' }),
  perpendicular: cap('perpendicular', { latex: '\\perp' }),
  parallel: cap('parallel', { latex: '\\parallel' }),
  congruent: cap('congruent', { latex: '\\cong' }),
  similar: cap('similar', { latex: '\\sim' }),
  // calculus
  ddx: cap('d by d x', { latex: '\\frac{d}{dx}', insert: '\\frac{d}{dx}', class: 'small' }),
  fPrime: cap('f prime of x', { latex: "f'(x)", insert: 'f^{\\prime}\\left(x\\right)', class: 'small' }),
  integral: cap('integral', { latex: '\\int' }),
  limit: cap('limit', { latex: '\\lim', class: 'small' }),
  sum: cap('sum', { latex: '\\sum' }),
  infinity: cap('infinity', { latex: '\\infty' }),
  arrow: cap('tends to', { latex: '\\to' }),
} as const satisfies Record<string, Keycap>

// ---- The tabs ----------------------------------------------------------------------------------------------------------------

export type TabId = 'numbers' | 'letters' | 'functions' | 'geometry' | 'calculus'
type Tab = { id: TabId; face: string; tooltip: string; kinds: TypedKind[] }

/** The tabs, in the order they are shown. A key of the tab row has the face of its tab. */
export const TABS: Tab[] = [
  { id: 'numbers', face: '123', tooltip: 'numbers and signs', kinds: ['number', 'expression', 'equation'] },
  { id: 'letters', face: '<i>abc</i>', tooltip: 'letters', kinds: ['expression', 'equation'] },
  { id: 'functions', face: '<i>f</i>(<i>x</i>)', tooltip: 'functions and constants', kinds: ['number', 'expression', 'equation'] },
  { id: 'geometry', face: '&#x2220;', tooltip: 'geometry and Greek letters', kinds: ['number', 'expression', 'equation'] },
  { id: 'calculus', face: '&#x222B;', tooltip: 'calculus', kinds: ['expression', 'equation'] },
]

export const layerId = (tab: TabId): string => `jemma-${tab}`

/** The tabs a kind of answer has: a number has no letters, so it has no abc and no calculus tab. */
export const tabsFor = (kind: TypedKind): Tab[] => TABS.filter((t) => t.kinds.includes(kind))

/** The tab a question opens on: calculus for a derivative, the functions tab for trigonometry, geometry for angles and shapes, the numbers otherwise. */
export function openingTab(kind: TypedKind, strand: Strand): TabId {
  const wanted: TabId =
    strand === 'calculus' ? 'calculus'
    : strand === 'trigonometry' ? (kind === 'equation' ? 'geometry' : 'functions')
    : strand === 'geometry' ? 'geometry'
    : 'numbers'
  return tabsFor(kind).some((t) => t.id === wanted) ? wanted : 'numbers'
}

// ---- The rows ----------------------------------------------------------------------------------------------------------------

const unitsOf = (key: string | Keycap): number => (typeof key === 'string' ? 1 : (key.width ?? 1))
/** The units of a row, for a test of the layout. */
export const rowUnits = (row: (string | Keycap)[]): number => row.reduce((n, k) => n + unitsOf(k), 0)

/** A row of exactly seven units: the keys, then blank keys to fill it. */
const filled = (keys: (string | Keycap)[]): (string | Keycap)[] => [...keys, ...Array.from({ length: Math.max(0, ROW_WIDTH - rowUnits(keys)) }, () => BLANK)]

/** The row of tabs at the top of every tab: the tab you are on is dark. Then blanks, and the key that hides the keyboard. */
function tabRow(kind: TypedKind, current: TabId): (string | Keycap)[] {
  const keys: Keycap[] = tabsFor(kind).map((t) =>
    cap(t.tooltip, { label: t.face, command: ['switchKeyboardLayer', layerId(t.id)], class: `action tab${t.id === current ? ' is-current-tab' : ''}`, width: 1 }),
  )
  return filled([...keys, ...Array.from({ length: Math.max(0, ROW_WIDTH - 2 - keys.length) }, () => BLANK), CAPS.hide])
}

const LETTERS = ['x', 'y', 'k', 'p', 'n', 't', 'a', 'b', 'c', 'm', 'd', 'f', 'g', 'h', 'i', 'j', 'l', 'o', 'q', 'r', 's', 'u', 'v', 'w', 'z']

/** The last row of a tab that is not the numbers: the arrows to move the cursor, the brackets, equals (an answer that is a number has none) and backspace. */
const lastRow = (kind: TypedKind): (string | Keycap)[] => [CAPS.left, CAPS.right, CAPS.open, CAPS.close, kind === 'number' ? BLANK : CAPS.equals, CAPS.backspace]

function rowsOf(tab: TabId, kind: TypedKind): (string | Keycap)[][] {
  const word = kind !== 'number'
  switch (tab) {
    case 'numbers':
      return [
        [CAPS.plus, CAPS.minus, CAPS.times, CAPS.divide, CAPS.equals, CAPS.open, CAPS.close],
        [CAPS.fraction, CAPS.sqrt, CAPS.cbrt, CAPS.squared, CAPS.power, CAPS.backspace],
        ['[1]', '[2]', '[3]', '[4]', '[5]', CAPS.left, CAPS.right],
        ['[6]', '[7]', '[8]', '[9]', '[0]', CAPS.comma, word ? letter('x') : CAPS.percent],
      ]
    case 'letters': {
      const rows: (string | Keycap)[][] = []
      for (let i = 0; i < LETTERS.length; i += ROW_WIDTH) rows.push(LETTERS.slice(i, i + ROW_WIDTH).map(letter))
      // The last row of letters has room for the arrows and a narrow backspace.
      const tail = rows.pop()!
      return [...rows, filled([...tail, CAPS.left, CAPS.right].slice(0, ROW_WIDTH - 1).concat(CAPS.backspaceNarrow))]
    }
    case 'functions':
      return word
        ? [
            [CAPS.sin, CAPS.cos, CAPS.tan, CAPS.asin, CAPS.acos, CAPS.atan, CAPS.abs],
            [CAPS.log, CAPS.ln, CAPS.e, CAPS.pi, CAPS.fx, CAPS.percent, CAPS.rand],
            filled([CAPS.less, CAPS.greater, CAPS.lessEqual, CAPS.greaterEqual, CAPS.notEqual, CAPS.plusMinus]),
            lastRow(kind),
          ]
        : [
            [CAPS.sin, CAPS.cos, CAPS.tan, CAPS.asin, CAPS.acos, CAPS.atan, CAPS.abs],
            filled([CAPS.log, CAPS.ln, CAPS.e, CAPS.pi, CAPS.percent, CAPS.rand]),
            lastRow(kind),
          ]
    case 'geometry':
      return word
        ? [
            [CAPS.degree, CAPS.theta, CAPS.alpha, CAPS.beta, CAPS.gamma, CAPS.pi, CAPS.angle],
            [CAPS.triangle, CAPS.perpendicular, CAPS.parallel, CAPS.congruent, CAPS.similar, CAPS.delta, CAPS.phi],
            lastRow(kind),
          ]
        : [filled([CAPS.degree, CAPS.pi, CAPS.percent]), lastRow(kind)]
    case 'calculus':
      return [
        [CAPS.ddx, CAPS.fPrime, CAPS.integral, CAPS.limit, CAPS.sum, CAPS.infinity, CAPS.e],
        filled([CAPS.ln, letter('x'), letter('y'), CAPS.arrow]),
        lastRow(kind),
      ]
  }
}

/** The CSS of a layer: the tab you are on is dark, and the face of a tab is a small label. */
const LAYER_STYLE = `.MLK__rows .tab { font-size: 15px; font-weight: 700; }
.MLK__rows .tab.is-current-tab { background: #1f1d36 !important; color: #ffffff !important; border-color: #1f1d36 !important; }`

/** The keyboard of one question: a layer for each tab of its kind of answer, the tab that fits the question first (the editor opens on the first). */
export function keyboardLayout(input: { kind: TypedKind; topic?: string; prompt?: string }): KeyboardLayout {
  const strand = strandOf(input.topic, input.prompt)
  const first = openingTab(input.kind, strand)
  const tabs = tabsFor(input.kind)
  const order = [...tabs.filter((t) => t.id === first), ...tabs.filter((t) => t.id !== first)]
  return {
    id: `jemma-${input.kind}-${strand}`,
    label: 'Maths',
    tooltip: 'Jemma maths keys',
    displayEditToolbar: false,
    displayShiftedKeycaps: false,
    layers: order.map((t) => ({ id: layerId(t.id), style: LAYER_STYLE, rows: [tabRow(input.kind, t.id), ...rowsOf(t.id, input.kind)] })),
  }
}

/** The name of a key for a screen reader and for a test: its tooltip, a digit, or its label. */
export function keyName(key: string | Keycap): string {
  if (typeof key === 'string') return key
  return key.tooltip ?? key.label ?? key.latex ?? ''
}
