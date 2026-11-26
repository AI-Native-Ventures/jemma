import { numberIn, type Notation } from './notation'

/**
 * P189: what the screen and the save gate both need to know about the pictures of the "Calculating and fractions" and "Percentages, time and money" boards:
 * how a factor tree is put together, the days of a month, and how coins, notes and amounts are written in the notation of the space (rand, or dollars in the
 * US). Pure: no clock, no database.
 */

// ---- A factor tree ----------------------------------------------------------------------------------------------------------------

export type FactorNode = {
  value: number
  /** 0 for the number at the top. */
  depth: number
  kids: FactorNode[]
  /** The one number the question asks for, drawn as a gold blank. */
  gold: boolean
}

export const isPrime = (n: number): boolean => {
  if (!Number.isInteger(n) || n < 2) return false
  for (let d = 2; d * d <= n; d++) if (n % d === 0) return false
  return true
}

/** The numbers of a tree in reading order: the top first, then each row from the left. */
export function readingOrder(root: FactorNode): FactorNode[] {
  const out: FactorNode[] = []
  let row = [root]
  while (row.length) {
    out.push(...row)
    row = row.flatMap((n) => n.kids)
  }
  return out
}

/**
 * The tree a factor tree draws. Each split hangs under the first number in reading order that is its `of` and has not split yet, so a split may only name a
 * number that is already on the tree. `unused` counts the splits that found no such number. The gold number is the last one in reading order with the value of
 * `gold`, never the top.
 */
export function factorTreeOf(s: { root: number; splits: { of: number; into: number[] }[]; gold?: number }): {
  root: FactorNode
  unused: number
  leaves: FactorNode[]
  rows: number
} {
  const root: FactorNode = { value: s.root, depth: 0, kids: [], gold: false }
  let unused = 0
  for (const split of s.splits) {
    const at = readingOrder(root).find((n) => n.value === split.of && n.kids.length === 0)
    if (!at) {
      unused++
      continue
    }
    at.kids = split.into.map((value) => ({ value, depth: at.depth + 1, kids: [], gold: false }))
  }
  const order = readingOrder(root)
  if (s.gold !== undefined) {
    const golden = order.filter((n) => n !== root && n.value === s.gold).pop()
    if (golden) golden.gold = true
  }
  const leaves = order.filter((n) => n.kids.length === 0)
  const rows = Math.max(...order.map((n) => n.depth)) + 1
  return { root, unused, leaves, rows }
}

// ---- A calendar -------------------------------------------------------------------------------------------------------------------

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const

/** How many days a month has (`month` 1 to 12). */
export const daysIn = (year: number, month: number): number => new Date(Date.UTC(year, month, 0)).getUTCDate()

/** The day of the week of a date, 0 for Sunday. */
export const weekdayOf = (year: number, month: number, day: number): number => new Date(Date.UTC(year, month - 1, day)).getUTCDay()

/** A date in words: "6 November", or "November 6" in the US. */
export const dateWords = (day: number, month: number, n: Notation): string => (n === 'us' ? `${MONTHS[month - 1]} ${day}` : `${day} ${MONTHS[month - 1]}`)

// ---- Coins, notes and amounts -----------------------------------------------------------------------------------------------------

/** P189: the coins and notes a picture may draw, in cents: the rand ones (10c to R200) and the dollar ones (1¢ to $100). */
export const MONEY_VALUES = [1, 5, 10, 20, 25, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000] as const

/** True for a note (a bill in the US): R10 and up, or $1 and up. */
export const isNote = (cents: number, n: Notation): boolean => (n === 'us' ? cents >= 100 : cents >= 1000)

/** What is written on a coin or a note: 50c, R2, R10, or 25¢, $1, $20 in the US. */
export const moneyLabel = (cents: number, n: Notation): string =>
  n === 'us' ? (cents >= 100 ? `$${cents / 100}` : `${cents}¢`) : cents >= 100 ? `R${cents / 100}` : `${cents}c`

/** A whole number with its thousands apart: 12 000, or 12,000 in the US. */
const grouped = (digits: string, n: Notation): string => digits.replace(/\B(?=(\d{3})+(?!\d))/g, n === 'us' ? ',' : ' ')

/**
 * An amount as Jemma writes it on a picture: R240, R12,50 and R1 200 (or $240, $12.50 and $1,200 in the US) for money, and a number in the notation for anything
 * else (2,5 or 2.5, with the thousands apart).
 */
export function amountIn(v: number, n: Notation, money = false): string {
  if (money) {
    const cents = Math.round(Math.abs(v) * 100)
    const whole = grouped(String(Math.floor(cents / 100)), n)
    const rest = cents % 100 === 0 ? '' : `${n === 'us' ? '.' : ','}${String(cents % 100).padStart(2, '0')}`
    return `${v < 0 ? '-' : ''}${n === 'us' ? '$' : 'R'}${whole}${rest}`
  }
  const text = numberIn(v, n)
  const [int = '', dec] = text.split(n === 'us' ? '.' : ',')
  return `${int.startsWith('-') ? '-' : ''}${grouped(int.replace('-', ''), n)}${dec === undefined ? '' : `${n === 'us' ? '.' : ','}${dec}`}`
}

/** A percent as Jemma writes it: 25%, 12,5% (12.5% in the US). */
export const percentIn = (v: number, n: Notation): string => `${numberIn(v, n)}%`

/** P189: the amount of the shaded part of a percentage bar. */
export const percentPart = (s: { whole: number; percent: number }): number => (s.whole * s.percent) / 100

const NUMBER_WORDS = ['no', 'a', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']

/** Coins and notes in words, the biggest first: "an R10 note, an R5 coin, two R2 coins and a 50c coin" ("a $1 bill and two 25¢ coins" in the US). */
export function moneyWords(items: readonly number[], n: Notation): string {
  const counts = new Map<number, number>()
  for (const c of [...items].sort((a, b) => b - a)) counts.set(c, (counts.get(c) ?? 0) + 1)
  const parts = [...counts].map(([c, k]) => {
    const what = isNote(c, n) ? (n === 'us' ? 'bill' : 'note') : 'coin'
    const label = moneyLabel(c, n)
    // An R is said "ar", so one rand coin or note is "an R5 coin".
    const count = k === 1 && label.startsWith('R') ? 'an' : (NUMBER_WORDS[k] ?? String(k))
    return `${count} ${label} ${what}${k === 1 ? '' : 's'}`
  })
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : (parts[0] ?? '')
}

// ---- P191: a growing tile pattern, a flow diagram and a balance scale -------------------------------------------------------------

/** The tiles of pattern `n` of a shape, as [column, row] from the top left. */
export function tilesOf(shape: string, n: number): [number, number][] {
  const out: [number, number][] = []
  const add = (c: number, r: number) => out.push([c, r])
  switch (shape) {
    case 'row':
      for (let c = 0; c < n; c++) add(c, 0)
      break
    case 'L':
      for (let r = 0; r <= n; r++) add(0, r)
      for (let c = 1; c <= n; c++) add(c, n)
      break
    case 'T':
      for (let c = 0; c <= 2 * n; c++) add(c, 0)
      for (let r = 1; r <= n; r++) add(n, r)
      break
    case 'cross':
      add(n, n)
      for (let k = 1; k <= n; k++) {
        add(n - k, n)
        add(n + k, n)
        add(n, n - k)
        add(n, n + k)
      }
      break
    case 'square':
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) add(c, r)
      break
    case 'rectangle':
      for (let r = 0; r < n; r++) for (let c = 0; c <= n; c++) add(c, r)
      break
    case 'stairs':
      // Steps of 1 to n tiles, from the left, standing on the bottom row.
      for (let c = 0; c < n; c++) for (let r = n - 1 - c; r < n; r++) add(c, r)
      break
  }
  return out
}

/** The output of a flow diagram for an input: each step of the rule in turn. */
export function flowOutput(rule: readonly { op: string; by: number }[], input: number): number {
  return rule.reduce((v, s) => (s.op === 'add' ? v + s.by : s.op === 'subtract' ? v - s.by : s.op === 'multiply' ? v * s.by : v / s.by), input)
}

/** A step of a flow diagram as it is written in its box: + 1, \u2212 3, \u00d7 4, \u00f7 2. */
export const flowStepText = (s: { op: string; by: number }, n: Notation = 'za'): string =>
  `${s.op === 'add' ? '+' : s.op === 'subtract' ? '\u2212' : s.op === 'multiply' ? '\u00d7' : '\u00f7'} ${numberIn(s.by, n)}`

/** What the unknown of a balance scale weighs: the pans balance, so left.x bags and left.n weigh what right.x bags and right.n weigh. */
export const balanceSolution = (s: { left: { x: number; n: number }; right: { x: number; n: number } }): number => (s.right.n - s.left.n) / (s.left.x - s.right.x)

// ---- P192: shapes and position ----------------------------------------------------------------------------------------------------

/** The faces, edges and corners of each 3D object a picture draws (a curved face counts as a face, and a cone's tip as a corner). */
export const SOLID_COUNTS: Readonly<Record<string, { faces: number; edges: number; corners: number }>> = {
  cube: { faces: 6, edges: 12, corners: 8 },
  cuboid: { faces: 6, edges: 12, corners: 8 },
  square_pyramid: { faces: 5, edges: 8, corners: 5 },
  triangular_pyramid: { faces: 4, edges: 6, corners: 4 },
  triangular_prism: { faces: 5, edges: 9, corners: 6 },
  cylinder: { faces: 3, edges: 2, corners: 0 },
  cone: { faces: 2, edges: 1, corners: 1 },
  sphere: { faces: 1, edges: 0, corners: 0 },
}

/** True when a line cuts a shape into two mirror halves. The shapes stand upright: a heart, a star, a house and a kite have one line, down the middle. */
export function isSymmetryLine(shape: string, line: string): boolean {
  switch (shape) {
    case 'circle':
    case 'square':
      return true
    case 'rectangle':
      return line === 'vertical' || line === 'horizontal'
    case 'arrow':
      return line === 'horizontal'
    default:
      return line === 'vertical'
  }
}

/** What each place of a map is marked with: its first letter, or its first two when another place starts with the same letter. */
export function placeMarks(names: readonly string[]): string[] {
  const first = names.map((n) => n.trim().charAt(0).toUpperCase())
  return names.map((n, i) => (first.filter((f) => f === first[i]).length > 1 ? n.trim().slice(0, 2).replace(/^./, (c) => c.toUpperCase()) : first[i]!))
}

// ---- P193: angles and transformations ---------------------------------------------------------------------------------------------

/** The kind of an angle by its size: acute, right, obtuse, straight or reflex (or a full turn). */
export function angleKind(degrees: number): 'acute' | 'right' | 'obtuse' | 'straight' | 'reflex' | 'full' {
  if (degrees < 90) return 'acute'
  if (degrees === 90) return 'right'
  if (degrees < 180) return 'obtuse'
  if (degrees === 180) return 'straight'
  return degrees < 360 ? 'reflex' : 'full'
}

/** The size of each corner where the slanted line of two parallel lines crosses one of them: the acute angle above and to the right, and below and to the left. */
export const cornerAngle = (acute: number, corner: string): number => (corner === 'above_right' || corner === 'below_left' ? acute : 180 - acute)

/** The number an angle label says, like 65 for `65°`, or null for a letter. */
export const labelDegrees = (label: string): number | null => {
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*°?\s*$/.exec(label)
  return m ? Number(m[1]!.replace(',', '.')) : null
}
