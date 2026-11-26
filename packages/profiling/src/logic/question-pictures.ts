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
