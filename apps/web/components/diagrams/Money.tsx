import type { ReactNode } from 'react'
import type { MoneySpec } from '@jemma/profiling/schemas'
import { amountIn, isNote, moneyLabel, moneyWords, type Notation } from '@jemma/profiling/logic'
import { GOLD_TINT, INK, Svg, T, type Variant } from './shared'

// P189: coins and notes to count, from the "Percentages, time and money" board ("How much money is there?"). Rand coins and notes in South Africa (10c to R5, R10
// to R200), dollar coins and bills in the US (1¢ to 25¢, $1 to $20). The notes come first, then the coins, the biggest first.

export type MoneyProps = MoneySpec & { variant?: Variant; notation?: Notation }

const W = 320
const NOTE_W = 136
const NOTE_H = 66
const GAP = 10

type Look = { fill: string; edge: string; ink: string }

/** The colour of a rand note, close to the real one: R10 green, R20 brown, R50 red, R100 blue, R200 orange. A dollar bill is green-grey. */
const noteLook = (cents: number, n: Notation): Look => {
  if (n === 'us') return { fill: '#E6EDE0', edge: '#4F6F52', ink: '#2F5D3A' }
  switch (cents) {
    case 1000:
      return { fill: '#D8EFE3', edge: '#007749', ink: '#007749' }
    case 2000:
      return { fill: '#F3E3D3', edge: '#8A5A2B', ink: '#7A4A1E' }
    case 5000:
      return { fill: '#FBE0DD', edge: '#B8281E', ink: '#B8281E' }
    case 10000:
      return { fill: '#DCE3F5', edge: '#001489', ink: '#001489' }
    default:
      return { fill: '#FDE8D0', edge: '#B45309', ink: '#9A4A07' }
  }
}

const BRONZE: Look = { fill: GOLD_TINT, edge: '#8C7A4A', ink: INK }
const SILVER: Look = { fill: '#E9E7E2', edge: '#8F8D88', ink: INK }
const COPPER: Look = { fill: '#EBC3A3', edge: '#9A5B33', ink: INK }

/** How big a coin is drawn and what it is made of, close to the real one: a rand coin grows with its value, a dime is the smallest US coin. */
const coinLook = (cents: number, n: Notation): { r: number; look: Look; centre?: Look } => {
  if (n === 'us') {
    const r = { 1: 19, 5: 21, 10: 17, 25: 24, 50: 27 }[cents] ?? 20
    return { r, look: cents === 1 ? COPPER : SILVER }
  }
  const r = { 10: 17, 20: 19, 50: 22, 100: 23, 200: 26, 500: 28 }[cents] ?? 18
  if (cents === 500) return { r, look: SILVER, centre: BRONZE }
  return { r, look: cents >= 100 ? SILVER : BRONZE }
}

export function describeMoney({ items, variant = 'card', notation = 'za' }: MoneyProps): string {
  const words = `Money: ${moneyWords(items, notation)}.`
  // While a question is answered the words never add it up: the total may be the answer.
  if (variant === 'question') return words
  return `${words} ${amountIn(items.reduce((a, c) => a + c, 0) / 100, notation, true)} in all.`
}

export function Money(props: MoneyProps) {
  const { items, notation = 'za' } = props
  const sorted = [...items].sort((a, b) => b - a)
  const notes = sorted.filter((c) => isNote(c, notation))
  const coins = sorted.filter((c) => !isNote(c, notation))
  const out: ReactNode[] = []
  let y = 8
  // Notes two to a row, in the middle.
  for (let i = 0; i < notes.length; i += 2) {
    const row = notes.slice(i, i + 2)
    const left = (W - (row.length * NOTE_W + (row.length - 1) * GAP)) / 2
    row.forEach((c, j) => {
      const x = left + j * (NOTE_W + GAP)
      const look = noteLook(c, notation)
      out.push(
        <g key={`n${i + j}`} data-note={c}>
          <rect x={x} y={y} width={NOTE_W} height={NOTE_H} rx={10} fill={look.fill} stroke={look.edge} strokeWidth={2} />
          <rect x={x + 8} y={y + 8} width={NOTE_W - 16} height={NOTE_H - 16} rx={6} fill="none" stroke={look.edge} strokeOpacity={0.45} strokeWidth={1.2} />
          <T x={x + NOTE_W / 2} y={y + NOTE_H / 2 + 9} size={26} weight={700} fill={look.ink}>
            {moneyLabel(c, notation)}
          </T>
        </g>,
      )
    })
    y += NOTE_H + GAP
  }
  // Coins in rows, as many as fit, each row in the middle.
  const sized = coins.map((c) => ({ c, ...coinLook(c, notation) }))
  let k = 0
  while (k < sized.length) {
    const row: typeof sized = []
    let used = 0
    while (k < sized.length && used + sized[k]!.r * 2 + (row.length ? GAP : 0) <= W - 16) {
      used += sized[k]!.r * 2 + (row.length ? GAP : 0)
      row.push(sized[k]!)
      k++
    }
    const tall = Math.max(...row.map((s) => s.r * 2))
    let x = (W - used) / 2
    for (const s of row) {
      const cx = x + s.r
      const cy = y + tall / 2
      out.push(
        <g key={`c${out.length}`} data-coin={s.c}>
          <circle cx={cx} cy={cy} r={s.r} fill={s.look.fill} stroke={s.look.edge} strokeWidth={2} />
          {s.centre ? <circle cx={cx} cy={cy} r={s.r - 8} fill={s.centre.fill} stroke={s.centre.edge} strokeWidth={1.2} /> : <circle cx={cx} cy={cy} r={s.r - 5} fill="none" stroke={s.look.edge} strokeOpacity={0.5} strokeWidth={1.2} />}
          <T x={cx} y={cy + (s.r >= 24 ? 5.5 : 4.5)} size={s.r >= 24 ? 15 : s.r >= 20 ? 13 : 12} weight={700} fill={s.look.ink}>
            {moneyLabel(s.c, notation)}
          </T>
        </g>,
      )
      x += s.r * 2 + GAP
    }
    y += tall + GAP
  }
  return (
    <Svg width={W} height={y - GAP + 8} label={describeMoney(props)}>
      {out}
    </Svg>
  )
}
