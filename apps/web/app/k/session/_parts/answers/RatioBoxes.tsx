'use client'

import { useState } from 'react'
import { DigitBox } from './DigitBox'

// P148: the answer of a `ratio` question: a box for each part with a colon between them ("a : b", and "a : b : c" when the key has three parts).
// What is sent is the text the marker reads: "3 : 4".

const NAMES = ['first', 'second', 'third'] as const

/** The text for what the boxes hold, or '' while a box is empty or holds no number. */
export function ratioAnswer(parts: string[]): string {
  const clean = parts.map((p) => p.trim().replace(/[.,]+$/, ''))
  return clean.every((p) => /\d/.test(p)) ? clean.join(' : ') : ''
}

export function RatioBoxes({ parts, onChange }: { parts: 2 | 3; onChange: (answer: string) => void }) {
  const [values, setValues] = useState<string[]>(() => Array.from({ length: parts }, () => ''))
  const size = parts === 3 ? 'h-[64px] w-[68px] text-[32px]' : 'h-[64px] w-[88px] text-[34px]'
  return (
    <div data-ratio={parts} className="flex items-center justify-center gap-2">
      {values.map((value, i) => (
        <div key={i} className="flex items-center gap-2">
          {i > 0 ? <span aria-hidden="true" className="text-[40px] leading-none font-bold text-ink">:</span> : null}
          <DigitBox
            id={`part-${i + 1}`}
            label={`The ${NAMES[i]} number of the ratio`}
            value={value}
            max={5}
            mode="decimal"
            className={size}
            onChange={(v) => {
              const next = values.map((old, j) => (j === i ? v : old))
              setValues(next)
              onChange(ratioAnswer(next))
            }}
          />
        </div>
      ))}
    </div>
  )
}
