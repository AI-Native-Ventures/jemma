'use client'

import { useState } from 'react'
import { GENERAL_MAX_FAMILIES, generalAnswer, generalLetter } from '@jemma/profiling/logic'
import type { GeneralSpec } from '@jemma/profiling/schemas'
import { ValueBox } from './ValueBox'

// P180: every solution of a trig equation, from the "Type every solution" board ("Find the general solution of sin θ = 0,5."). A frame for each family of
// solutions: θ = [angle]° + k · [period]°. "Add another solution" opens the next frame (up to 4) for the second angle. The angle box has the full keyboard, so
// an angle may be negative; the period box has the number pad. What goes up to the screen is the angle and the period of each frame that is filled.
// P186: the line under the frames says k is any integer (k ∈ ℤ): k may be negative, which a whole number never is.

type Row = { angle: string; period: string }

const box = 'h-[50px] w-[66px] border-[2.5px] border-green text-[20px]'

export function SolutionFrame({ general, onChange }: { general: GeneralSpec; onChange: (answer: string) => void }) {
  const letter = generalLetter(general)
  const [rows, setRows] = useState<Row[]>([{ angle: '', period: '' }])
  const write = (next: Row[]) => {
    setRows(next)
    onChange(generalAnswer(next))
  }
  const set = (i: number, part: keyof Row, value: string) => write(rows.map((r, k) => (k === i ? { ...r, [part]: value } : r)))
  const filled = rows.filter((r) => r.angle.trim() && r.period.trim()).length
  return (
    <div data-answer="general" data-values="true" className="flex w-full flex-col items-center gap-2.5">
      {rows.map((r, i) => (
        <div key={i} data-family={i + 1} className="flex flex-nowrap items-center justify-center gap-1.5 text-[19px] font-bold text-ink">
          <span aria-hidden="true" className="w-[64px] flex-none text-right whitespace-nowrap">{i === 0 ? `${letter} =` : `or ${letter} =`}</span>
          <ValueBox id={`angle-${i + 1}`} label={`Solution ${i + 1}: the angle, in degrees`} value={r.angle} onChange={(v) => set(i, 'angle', v)} plain={false} className={box} />
          <span aria-hidden="true" className="whitespace-nowrap">° + k ·</span>
          <ValueBox id={`period-${i + 1}`} label={`Solution ${i + 1}: how often it comes back, in degrees`} value={r.period} onChange={(v) => set(i, 'period', v)} plain className={box} />
          <span aria-hidden="true">°</span>
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
      {filled > 0 && rows.length === 1 ? <p aria-live="polite" className="m-0 text-center text-[16px] leading-[1.4] text-body">Add another solution if there is one.</p> : null}
    </div>
  )
}
