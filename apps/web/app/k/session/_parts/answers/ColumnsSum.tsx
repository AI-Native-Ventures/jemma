'use client'

import { useState, type KeyboardEvent, type ReactNode } from 'react'
import { columnsAnswer, columnsBoxes, PLACE_NAMES, PLACE_WORDS } from '@jemma/profiling/logic'
import type { ColumnsSpec } from '@jemma/profiling/schemas'

// P168: a sum worked in columns, from the "Write digits in columns" board. The place of each column over it, a small box over each column for a carry, the
// numbers one under the other, a line, and a box for each digit of the answer. The learner writes from the ones with the keypad under the sum: the next box
// to the left opens by itself, and a tap on a box (or a small box) chooses it. The same drawing is the paper sheet (empty boxes) and the results (the
// learner's digits in blue, a wrong one circled in red pen with the right digit beside it).

const HAND = '#001489'
const PEN = '#E03C31'

/** The width of a column: five fit easily on a phone; a sum of six digits gets narrower columns. */
const columnWidth = (boxes: number) => (boxes <= 5 ? 52 : boxes === 6 ? 46 : 40)

type Box = { row: 'answer' | 'carry'; i: number }

export type ColumnsSumProps = {
  columns: ColumnsSpec
  mode: 'answer' | 'paper' | 'results'
  /** answer: the digits of the answer boxes, the leftmost first, and the carries over the columns. */
  digits?: string[]
  carries?: string[]
  active?: Box | null
  onBox?: (box: Box) => void
  onKey?: (e: KeyboardEvent<HTMLButtonElement>) => void
  /** results: each answer box as the learner wrote it, with the right digit. */
  places?: { wrote: string; right: string; ok: boolean }[]
}

/** The words of the sum for a screen reader: "347 plus 285, written in columns." */
export const describeColumns = (c: ColumnsSpec) => `${c.numbers.join(c.op === '+' ? ' plus ' : ' take away ')}, written in columns.`

export function ColumnsSum({ columns, mode, digits = [], carries = [], active = null, onBox, onKey, places = [] }: ColumnsSumProps) {
  const n = columnsBoxes(columns)
  const w = columnWidth(n)
  const box = Math.min(48, w - 4)
  const grid = { display: 'grid', gridTemplateColumns: `28px repeat(${n}, ${w}px)`, justifyContent: 'center', alignItems: 'center' } as const
  /** The place of box i (counted from the left) from the ones: 0 is the ones. */
  const place = (i: number) => n - 1 - i
  const widest = Math.max(...columns.numbers.map((x) => x.trim().length))
  const cells = (content: (i: number) => ReactNode, key: string) => Array.from({ length: n }, (_, i) => <div key={`${key}${i}`} className="flex justify-center">{content(i)}</div>)
  const digitOf = (number: string, i: number) => {
    const s = number.trim()
    const at = s.length - 1 - place(i)
    return at >= 0 ? s[at] : ''
  }
  return (
    <div data-columns={columns.op} role="group" aria-label={describeColumns(columns)} className="flex w-full flex-col gap-1 select-none">
      <div style={grid} aria-hidden="true">
        <span />
        {cells((i) => <span className="text-[13px] font-bold text-body">{place(i) < widest || columns.op === '-' ? PLACE_NAMES[place(i)] : ''}</span>, 'p')}
      </div>
      {/* The small boxes for a carry: over every column with a digit but the ones. */}
      <div style={grid} className="min-h-[30px]">
        <span />
        {cells((i) => {
          const has = place(i) > 0 && place(i) < widest
          if (!has) return <span className="h-[26px]" />
          const v = carries[i] ?? ''
          const on = active?.row === 'carry' && active.i === i
          if (mode !== 'answer') return <span aria-hidden="true" className="h-[26px] w-[26px] rounded-[6px] border border-dashed border-edge" />
          return (
            <button
              type="button"
              data-carry={i}
              aria-label={`Small box over the ${PLACE_WORDS[place(i)]}${v ? `, ${v}` : ''}`}
              aria-pressed={on}
              onClick={() => onBox?.({ row: 'carry', i })}
              onKeyDown={onKey}
              className={`flex h-[26px] w-[26px] cursor-pointer items-center justify-center rounded-[6px] p-0 text-[16px] font-bold ${
                on ? 'border-[2.4px] border-gold bg-gold-tint' : v ? 'border border-edge bg-card' : 'border border-dashed border-edge bg-card'
              }`}
              style={{ color: HAND }}
            >
              {v}
            </button>
          )
        }, 'c')}
      </div>
      {columns.numbers.map((number, r) => (
        <div key={r} style={grid} aria-hidden="true">
          <span className="text-center text-[30px] font-bold">{r === columns.numbers.length - 1 ? (columns.op === '+' ? '+' : '−') : ''}</span>
          {cells((i) => <span className="text-[32px] leading-[1.25] font-bold">{digitOf(number, i)}</span>, `n${r}`)}
        </div>
      ))}
      <div style={grid} aria-hidden="true">
        <span />
        <div className="h-[2.5px] bg-ink" style={{ gridColumn: `2 / span ${n}` }} />
      </div>
      <div style={grid} className="pt-1.5">
        <span />
        {cells((i) => {
          if (mode === 'paper') return <span aria-hidden="true" className="block rounded-12 border-[2.5px] border-green bg-card" style={{ width: box, height: 56 }} />
          if (mode === 'results') {
            const p = places[i] ?? { wrote: '', right: '', ok: true }
            return (
              <span className="relative flex items-center justify-center rounded-12 border-[2.5px] border-line bg-card" style={{ width: box, height: 56 }} data-place={p.ok ? 'ok' : 'wrong'}>
                <span className="text-[30px] font-bold" style={{ color: HAND }}>{p.wrote}</span>
                {p.ok ? null : (
                  <>
                    <span aria-hidden="true" className="pointer-events-none absolute inset-[-4px] rounded-pill border-[3px]" style={{ borderColor: PEN }} />
                    <span className="absolute -top-3 -left-2 rounded-pill bg-card px-1 text-[20px] leading-none font-bold" style={{ color: PEN }}>{p.right || '–'}</span>
                  </>
                )}
              </span>
            )
          }
          const v = digits[i] ?? ''
          const on = active?.row === 'answer' && active.i === i
          return (
            <button
              type="button"
              data-digit={i}
              aria-label={`Answer, ${PLACE_WORDS[place(i)]}${v ? `, ${v}` : ''}`}
              aria-pressed={on}
              onClick={() => onBox?.({ row: 'answer', i })}
              onKeyDown={onKey}
              className={`flex cursor-pointer items-center justify-center rounded-12 p-0 text-[32px] font-bold ${on ? 'border-[3px] border-gold bg-gold-tint' : 'border-[2.5px] border-green bg-card'}`}
              style={{ width: box, height: 56, color: HAND }}
            >
              {v || (on ? <span aria-hidden="true" className="block h-8 w-[2px] bg-ink" /> : '')}
            </button>
          )
        }, 'a')}
      </div>
    </div>
  )
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', 'next'] as const

/**
 * The line under the sum: where to start; then, while the box that is open is empty, how to use the small boxes; and on a box that holds a digit, how to change
 * it. It never says whether an answer is right.
 */
export function columnsHint(c: ColumnsSpec, digits: string[], openHolds: boolean): string {
  if (digits.every((d) => d === '')) return 'Start with the ones. The next box opens by itself.'
  if (openHolds) return 'Tap a box to change its digit.'
  return c.op === '+' ? 'Tap a small box to carry a digit.' : 'Tap a small box to write your working.'
}

/** The answer of a sum in columns: the sum with its boxes, and the keypad. `onChange` gets the answer as digits, or '' until it is written. */
export function ColumnsAnswer({ columns, onChange }: { columns: ColumnsSpec; onChange: (text: string) => void }) {
  const n = columnsBoxes(columns)
  const [digits, setDigits] = useState<string[]>(() => Array.from({ length: n }, () => ''))
  const [carries, setCarries] = useState<string[]>(() => Array.from({ length: n }, () => ''))
  const [active, setActive] = useState<Box | null>({ row: 'answer', i: n - 1 })

  const write = (next: string[]) => {
    setDigits(next)
    onChange(columnsAnswer(next))
  }
  const press = (key: (typeof KEYS)[number]) => {
    const at = active ?? { row: 'answer' as const, i: n - 1 }
    if (at.row === 'carry') {
      if (key === 'back') return setCarries(carries.map((v, i) => (i === at.i ? '' : v)))
      if (key === 'next') return setActive({ row: 'answer', i: at.i })
      setCarries(carries.map((v, i) => (i === at.i ? key : v)))
      // After a carry the learner writes the digit of the column the carry went to.
      return setActive({ row: 'answer', i: at.i })
    }
    if (key === 'next') return setActive({ row: 'answer', i: Math.max(0, at.i - 1) })
    if (key === 'back') {
      if (digits[at.i]) return write(digits.map((v, i) => (i === at.i ? '' : v)))
      const right = Math.min(n - 1, at.i + 1)
      setActive({ row: 'answer', i: right })
      return write(digits.map((v, i) => (i === right ? '' : v)))
    }
    write(digits.map((v, i) => (i === at.i ? key : v)))
    if (at.i > 0) setActive({ row: 'answer', i: at.i - 1 })
  }
  // A keyboard works too: a digit, Backspace, and the arrows to move between the boxes.
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (/^\d$/.test(e.key)) press(e.key as (typeof KEYS)[number])
    else if (e.key === 'Backspace') press('back')
    else if (e.key === 'ArrowLeft' && active) setActive({ ...active, i: Math.max(0, active.i - 1) })
    else if (e.key === 'ArrowRight' && active) setActive({ ...active, i: Math.min(n - 1, active.i + 1) })
    else return
    e.preventDefault()
  }
  return (
    <div data-answer="columns" className="flex w-full flex-col items-center gap-3.5">
      <ColumnsSum columns={columns} mode="answer" digits={digits} carries={carries} active={active} onBox={setActive} onKey={onKey} />
      <p className="m-0 text-center text-[16px] leading-[1.4] text-body">{columnsHint(columns, digits, active?.row === 'answer' && digits[active.i] !== '')}</p>
      <div role="group" aria-label="Keypad" className="grid w-full max-w-[300px] grid-cols-3 gap-2">
        {KEYS.map((key) => (
          <button
            key={key}
            type="button"
            aria-label={key === 'back' ? 'Delete' : key === 'next' ? 'Next box' : key}
            onClick={() => press(key)}
            className={`flex h-[46px] cursor-pointer items-center justify-center rounded-14 border-0 px-2 text-[22px] font-bold text-ink ${key === 'back' || key === 'next' ? 'bg-soft-2' : 'bg-card shadow-[inset_0_0_0_1.5px_var(--color-edge)]'}`}
          >
            {key === 'back' ? '⌫' : key === 'next' ? '←' : key}
          </button>
        ))}
      </div>
    </div>
  )
}
