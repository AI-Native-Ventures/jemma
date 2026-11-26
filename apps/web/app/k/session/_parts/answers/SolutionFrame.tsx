'use client'

import { useRef, useState } from 'react'
import { GENERAL_MAX_FAMILIES, generalAnswer, generalLetter } from '@jemma/profiling/logic'
import type { GeneralSpec } from '@jemma/profiling/schemas'
import { ValueBox } from './ValueBox'

// P180: every solution of a trig equation, from the "Type every solution" board ("Find the general solution of sin θ = 0,5."). A frame for each family of
// solutions: θ = [angle]° + k · [period]°. "Add another solution" opens the next frame (up to 4) for the second angle. The angle box has the full keyboard, so
// an angle may be negative; the period box has the number pad. What goes up to the screen is the angle and the period of each frame that is filled.
// P186: the line under the frames says k is any integer (k ∈ ℤ): k may be negative, which a whole number never is.
// P198: in radians (`radians`, a class in the US, from the "Radians" board) the frame is x = [angle] + k · [period] with no degree sign, both boxes take the full
// keyboard, and a row of keys under the frames types π, a fraction line and a minus sign into the box last used (a phone's keyboard has no π).

type Row = { angle: string; period: string }
type Part = keyof Row

const box = 'h-[50px] w-[66px] border-[2.5px] border-green text-[20px]'
const radianBox = 'h-[50px] w-[78px] border-[2.5px] border-green text-[19px]'

/** The keys under a frame in radians: what each types, and what a screen reader says. */
const KEYS = [
  { text: 'π', label: 'Type pi' },
  { text: '/', label: 'Type a fraction line' },
  { text: '−', label: 'Type a minus sign' },
] as const

export function SolutionFrame({ general, onChange }: { general: GeneralSpec; onChange: (answer: string) => void }) {
  const letter = generalLetter(general)
  const radians = general.radians === true
  const [rows, setRows] = useState<Row[]>([{ angle: '', period: '' }])
  // The box a key types into: the one used last (the angle of the first frame until then).
  const last = useRef<{ i: number; part: Part }>({ i: 0, part: 'angle' })
  const write = (next: Row[]) => {
    setRows(next)
    onChange(generalAnswer(next))
  }
  const set = (i: number, part: Part, value: string) => write(rows.map((r, k) => (k === i ? { ...r, [part]: value } : r)))
  const filled = rows.filter((r) => r.angle.trim() && r.period.trim()).length
  const unit = radians ? 'in radians' : 'in degrees'
  /** A key types its text where the caret of the box used last is, and the caret goes after it. */
  const type = (text: string) => {
    const { i, part } = last.current
    const row = rows[i]
    if (!row) return
    const input = document.getElementById(`${part}-${i + 1}`) as HTMLInputElement | null
    const value = row[part]
    const at = input && input.selectionStart !== null ? input.selectionStart : value.length
    const to = input && input.selectionEnd !== null ? input.selectionEnd : value.length
    set(i, part, `${value.slice(0, at)}${text}${value.slice(to)}`)
    requestAnimationFrame(() => {
      if (!input) return
      input.focus()
      input.setSelectionRange(at + text.length, at + text.length)
    })
  }
  return (
    <div data-answer="general" data-values="true" data-radians={radians ? 'true' : undefined} className="flex w-full flex-col items-center gap-2.5">
      {rows.map((r, i) => (
        <div key={i} data-family={i + 1} className="flex flex-nowrap items-center justify-center gap-1.5 text-[19px] font-bold text-ink">
          <span aria-hidden="true" className="w-[64px] flex-none text-right whitespace-nowrap">{i === 0 ? `${letter} =` : `or ${letter} =`}</span>
          <span className="contents" onFocus={() => (last.current = { i, part: 'angle' })}>
            <ValueBox id={`angle-${i + 1}`} label={`Solution ${i + 1}: the angle, ${unit}`} value={r.angle} onChange={(v) => set(i, 'angle', v)} plain={false} className={radians ? radianBox : box} />
          </span>
          <span aria-hidden="true" className="whitespace-nowrap">{radians ? '+ k ·' : '° + k ·'}</span>
          <span className="contents" onFocus={() => (last.current = { i, part: 'period' })}>
            <ValueBox
              id={`period-${i + 1}`}
              label={`Solution ${i + 1}: how often it comes back, ${unit}`}
              value={r.period}
              onChange={(v) => set(i, 'period', v)}
              plain={!radians}
              className={radians ? radianBox : box}
            />
          </span>
          {radians ? null : <span aria-hidden="true">°</span>}
        </div>
      ))}
      {rows.length < GENERAL_MAX_FAMILIES ? (
        <button
          type="button"
          onClick={() => write([...rows, { angle: '', period: '' }])}
          className="flex min-h-11 cursor-pointer items-center gap-1.5 rounded-12 border-2 border-dashed border-green bg-transparent px-3.5 text-[16px] font-bold text-green"
        >
          <span aria-hidden="true" className="text-[20px] leading-none">+</span> Add another solution
        </button>
      ) : null}
      <p className="m-0 text-center text-[15px] text-body">k is any integer: k ∈ ℤ</p>
      {radians ? (
        <div data-pi-keys="" className="flex items-center justify-center gap-2">
          {KEYS.map((k) => (
            <button
              key={k.text}
              type="button"
              aria-label={k.label}
              // The box keeps its caret: the key does not take the focus from it.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => type(k.text)}
              className="flex h-11 min-w-[52px] cursor-pointer items-center justify-center rounded-12 border-2 border-edge bg-card px-3 text-[20px] font-bold text-ink"
            >
              {k.text}
            </button>
          ))}
        </div>
      ) : null}
      {filled > 0 && rows.length === 1 ? <p aria-live="polite" className="m-0 text-center text-[16px] leading-[1.4] text-body">Add another solution if there is one.</p> : null}
    </div>
  )
}
