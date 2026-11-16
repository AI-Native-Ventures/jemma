import { strandOf, type Strand, type TypedKind } from './maths-keys'

// P132: the keyboard of the maths editor. P140 made it simpler: every tab has the same three rows on top, so the numbers, the signs and the fraction, root
// and power keys are always there, and five word tabs (Letters, Trig, Compare, Shapes, Calculus) change only the two rows under them. The last row is the strip
// of tabs. A letter never looks like a sign: the letters are italic maths letters, and the times key is the cross. Pure functions: MathLive is given the object
// they return (its custom layout format, one layer for each tab); nothing here touches the editor or the page.
//
// Every row is ten units wide. Rows 1 to 3 are the same on every tab:
//   1  the digits 1 2 3 4 5 6 7 8 9 0
//   2  + - x / = ( ) and the decimal comma, then backspace (two units)
//   3  fraction (2), square root, cube root, x squared, x to a power (1.5 each), move left, move right
// Rows 4 and 5 depend on the tab (blank keys fill a row, so every tab is as tall as the others):
//   Letters   x y z a b c k m n p / d f g h q r s t u v
//   Trig      sin cos tan and their inverses, the degree sign, theta, alpha, beta / pi, gamma, delta, phi
//   Compare   < > <= >= != plus-or-minus |x| % R
//   Shapes    angle, triangle, perpendicular, parallel, congruent, similar, the degree sign, theta, pi
//   Calculus  d/dx, f'(x), the integral, lim, the sum, infinity, to, e / ln, log, f(x), x, y
// Row 6 is the tabs, one key for each tab of this kind of answer (the one you are on is dark). A number has no letters and no calculus, so it has Trig, Compare
// and Shapes, then blanks, then the key that hides the keyboard. The faces of the keys are textbook maths (LaTeX drawn by the editor), never text with a slash
// or a caret. The size of everything follows the width of the screen (LAYER_STYLE).

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

/** Units a row is wide: ten keys, so a 360 px phone has keys 36 px wide (32 px with the gap) and 46 px tall. */
export const ROW_WIDTH = 10

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
  fraction: cap('fraction', { latex: '\\frac{\\square}{\\square}', insert: '\\frac{#@}{#?}', class: 'stack' }),
  sqrt: cap('square root', { latex: '\\sqrt{\\square}', insert: '\\sqrt{#0}' }),
  cbrt: cap('cube root', { latex: '\\sqrt[3]{\\square}', insert: '\\sqrt[3]{#0}' }),
  squared: cap('squared', { latex: 'x^2', insert: '#@^2' }),
  power: cap('to the power of', { latex: 'x^{\\square}', insert: '#@^{#?}' }),
  backspace: cap('backspace', { label: '[backspace]', class: 'action', width: 2 }),
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
  integral: cap('integral', { latex: '\\int', class: 'tall' }),
  limit: cap('limit', { latex: '\\lim', class: 'small' }),
  sum: cap('sum', { latex: '\\sum' }),
  infinity: cap('infinity', { latex: '\\infty' }),
  arrow: cap('tends to', { latex: '\\to' }),
} as const satisfies Record<string, Keycap>

// ---- The tabs ----------------------------------------------------------------------------------------------------------------

export type TabId = 'letters' | 'trig' | 'compare' | 'shapes' | 'calculus'
type Tab = { id: TabId; face: string; tooltip: string; kinds: TypedKind[] }

/**
 * The face of a tab: ONE element holding the word, on one line (a key is a flex column, so loose pieces of a label would each be a row of their own). The
 * size of the word follows the screen (LAYER_STYLE).
 */
const face = (word: string): string => `<span class="tab-face">${word}</span>`

/** The tabs, in the order they are shown. A key of the tab strip has the face of its tab. */
export const TABS: Tab[] = [
  { id: 'letters', face: face('Letters'), tooltip: 'letters', kinds: ['expression', 'equation'] },
  { id: 'trig', face: face('Trig'), tooltip: 'trigonometry and Greek letters', kinds: ['number', 'expression', 'equation'] },
  { id: 'compare', face: face('Compare'), tooltip: 'comparing and other signs', kinds: ['number', 'expression', 'equation'] },
  { id: 'shapes', face: face('Shapes'), tooltip: 'shapes and angles', kinds: ['number', 'expression', 'equation'] },
  { id: 'calculus', face: face('Calculus'), tooltip: 'calculus', kinds: ['expression', 'equation'] },
]

export const layerId = (tab: TabId): string => `jemma-${tab}`

/** The tabs a kind of answer has: a number has no letters, so it has no Letters and no Calculus tab. */
export const tabsFor = (kind: TypedKind): Tab[] => TABS.filter((t) => t.kinds.includes(kind))

/**
 * The tab a question opens on: Calculus for a derivative, Trig for trigonometry, Shapes for angles and shapes, otherwise Letters (Compare for an answer that is
 * a number, which has no letters). A tab this kind of answer does not have is replaced by the first tab it has.
 */
export function openingTab(kind: TypedKind, strand: Strand): TabId {
  const wanted: TabId =
    strand === 'calculus' ? 'calculus'
    : strand === 'trigonometry' ? 'trig'
    : strand === 'geometry' ? 'shapes'
    : kind === 'number' ? 'compare'
    : 'letters'
  const tabs = tabsFor(kind)
  return tabs.some((t) => t.id === wanted) ? wanted : tabs[0]!.id
}

// ---- The rows ----------------------------------------------------------------------------------------------------------------

const unitsOf = (key: string | Keycap): number => (typeof key === 'string' ? 1 : (key.width ?? 1))
/** The units of a row, for a test of the layout. */
export const rowUnits = (row: (string | Keycap)[]): number => row.reduce((n, k) => n + unitsOf(k), 0)

/** A key with a width of its own (the keys of the third row are 1.5 and 2 units wide). */
const wide = (key: Keycap, width: NonNullable<Keycap['width']>): Keycap => ({ ...key, width })

/** A row of exactly ten units: the keys, then blank keys to fill it. */
const filled = (keys: (string | Keycap)[]): (string | Keycap)[] => [...keys, ...Array.from({ length: Math.max(0, ROW_WIDTH - rowUnits(keys)) }, () => BLANK)]

/** The strip of tabs, the last row of every tab: one key for each tab of this kind of answer, the tab you are on dark. A number has three tabs, then blanks, and the key that hides the keyboard. */
function tabRow(kind: TypedKind, current: TabId): (string | Keycap)[] {
  const keys: Keycap[] = tabsFor(kind).map((t) =>
    cap(t.tooltip, { label: t.face, command: ['switchKeyboardLayer', layerId(t.id)], class: `action tab${t.id === current ? ' is-current-tab' : ''}`, width: 2 }),
  )
  // The five tabs fill the row. With fewer, the hide key is the last key of the row.
  return keys.length >= 5 ? keys : filled([...keys, ...Array.from({ length: Math.max(0, ROW_WIDTH - 2 - rowUnits(keys)) }, () => BLANK), CAPS.hide])
}

/** The three rows on top of every tab: the digits, the signs with the comma and backspace, and fraction, roots, powers and the arrows. */
const topRows = (): (string | Keycap)[][] => [
  ['[1]', '[2]', '[3]', '[4]', '[5]', '[6]', '[7]', '[8]', '[9]', '[0]'],
  [CAPS.plus, CAPS.minus, CAPS.times, CAPS.divide, CAPS.equals, CAPS.open, CAPS.close, CAPS.comma, CAPS.backspace],
  [wide(CAPS.fraction, 2), wide(CAPS.sqrt, 1.5), wide(CAPS.cbrt, 1.5), wide(CAPS.squared, 1.5), wide(CAPS.power, 1.5), CAPS.left, CAPS.right],
]

/** The two rows under the top rows: they are what a tab changes. */
function tabRows(tab: TabId): [(string | Keycap)[], (string | Keycap)[]] {
  switch (tab) {
    case 'letters':
      return [['x', 'y', 'z', 'a', 'b', 'c', 'k', 'm', 'n', 'p'].map(letter), ['d', 'f', 'g', 'h', 'q', 'r', 's', 't', 'u', 'v'].map(letter)]
    case 'trig':
      return [
        [CAPS.sin, CAPS.cos, CAPS.tan, CAPS.asin, CAPS.acos, CAPS.atan, CAPS.degree, CAPS.theta, CAPS.alpha, CAPS.beta],
        filled([CAPS.pi, CAPS.gamma, CAPS.delta, CAPS.phi]),
      ]
    case 'compare':
      return [filled([CAPS.less, CAPS.greater, CAPS.lessEqual, CAPS.greaterEqual, CAPS.notEqual, CAPS.plusMinus, CAPS.abs, CAPS.percent, CAPS.rand]), filled([])]
    case 'shapes':
      return [filled([CAPS.angle, CAPS.triangle, CAPS.perpendicular, CAPS.parallel, CAPS.congruent, CAPS.similar, CAPS.degree, CAPS.theta, CAPS.pi]), filled([])]
    case 'calculus':
      return [
        [wide(CAPS.ddx, 2), wide(CAPS.fPrime, 2), CAPS.integral, CAPS.limit, CAPS.sum, CAPS.infinity, CAPS.arrow, CAPS.e],
        filled([CAPS.ln, CAPS.log, CAPS.fx, letter('x'), letter('y')]),
      ]
  }
}

/** The rows of one tab for one kind of answer: the three rows every tab has, the two of the tab, and the strip of tabs. Six rows, whatever the tab. */
const rowsOf = (tab: TabId, kind: TypedKind): (string | Keycap)[][] => [...topRows(), ...tabRows(tab), tabRow(kind, tab)]

/**
 * The CSS of a layer, so that the keyboard is responsive: the size of the keys and of what is written on them follows the width of the screen, and nothing
 * sticks out of a key. A key is a flex column with 12 px of padding on an action key, which left no room for a word: every key has no padding, its content
 * centred, and its text on one line. MathLive's own variables set the height (46 px, so a key is at least 44 px tall), the gap (4 px, so ten keys fit a 320 px
 * screen), the widest a key grows on a laptop (64 px, a row is 640 px) and the sizes of the maths faces (16 to 24 px) and of the small text keys (11 to 16 px).
 * The word of a tab is 11 to 15 px. The tab you are on is dark. Two faces are taller than the rest, measured with the editor's own renderer: the fraction is
 * 1.87 times its font size high and the integral 2.23 times, which would not fit a 46 px key at the full 24 px, so the `stack` and `tall` keys have a smaller
 * font (at most 20 px and 17 px: at most 38 px high).
 */
const LAYER_STYLE = `.MLK__rows { --keycap-height: 46px; --keycap-gap: 4px; --keycap-max-width: 64px; --keycap-font-size: clamp(16px, 5.2vw, 24px); --keycap-small-font-size: clamp(11px, 3.4vw, 16px); }
.MLK__rows > .MLK__row .MLK__keycap { padding: 0 !important; min-width: 0; align-items: center; justify-content: center; overflow: hidden; }
.MLK__rows > .MLK__row .MLK__keycap.small { font-size: clamp(11px, 3.4vw, 16px) !important; line-height: 1; white-space: nowrap; }
.MLK__rows > .MLK__row .MLK__keycap.stack { font-size: clamp(15px, 4.8vw, 20px) !important; }
.MLK__rows > .MLK__row .MLK__keycap.tall { font-size: clamp(13px, 4vw, 17px) !important; }
.MLK__rows > .MLK__row .tab { padding: 0 !important; font-size: clamp(11px, 3.3vw, 15px) !important; font-weight: 700; line-height: 1 !important; white-space: nowrap; overflow: hidden; text-overflow: clip; }
.MLK__rows > .MLK__row .tab .tab-face { display: inline-flex; align-items: center; justify-content: center; max-width: 100%; white-space: nowrap; line-height: 1; }
.MLK__rows > .MLK__row .tab.is-current-tab { background: #1f1d36 !important; color: #ffffff !important; border-color: #1f1d36 !important; }`

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
    layers: order.map((t) => ({ id: layerId(t.id), style: LAYER_STYLE, rows: rowsOf(t.id, input.kind) })),
  }
}

/** The name of a key for a screen reader and for a test: its tooltip, a digit, or its label. */
export function keyName(key: string | Keycap): string {
  if (typeof key === 'string') return key
  return key.tooltip ?? key.label ?? key.latex ?? ''
}
