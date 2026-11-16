'use client'

import { useState } from 'react'
import type { AnswerShape } from '../../[sessionId]/logic'
import { joined, ValueBox } from './ValueBox'
import { valuesHint } from './values-hints'

// P150: a row of small boxes, one for each value of a list. The count comes from the server (never the values). A label over a box when the lesson gave one
// ("min", "Q1", "median", "Q3", "max"); the boxes wrap to a second row on a phone. The text sent is the values with a semicolon between them, or nothing until
// every box has a value.

type ListShape = Extract<AnswerShape, { kind: 'list' }>

export function Hint({ children }: { children: string }) {
  return <p className="m-0 text-center text-[16px] leading-[1.4] text-body">{children}</p>
}

export function ListAnswer({ shape, onChange }: { shape: ListShape; onChange: (text: string) => void }) {
  const [values, setValues] = useState<string[]>(() => Array.from({ length: shape.count }, () => ''))
  const set = (i: number, v: string) => {
    const next = values.map((old, k) => (k === i ? v : old))
    setValues(next)
    onChange(joined(next))
  }
  // A plain number needs little room; a fraction, a root or a minus sign needs more.
  const width = shape.plain ? 'w-[52px] text-[20px]' : 'w-[68px] text-[20px]'
  return (
    <div className="flex w-full flex-col items-center gap-3.5">
      <div data-values="list" role="group" aria-label="Your answers" className="flex w-full flex-wrap justify-center gap-x-2 gap-y-3">
        {values.map((value, i) => {
          const caption = shape.labels?.[i] ?? (shape.ordered ? String(i + 1) : '')
          return (
            <div key={i} className="flex flex-none flex-col items-center gap-1">
              <ValueBox
                id={`value-${i}`}
                label={shape.labels?.[i] ?? `Answer ${i + 1}`}
                value={value}
                onChange={(v) => set(i, v)}
                plain={shape.plain}
                className={`h-12 border-[3px] border-coral px-0 ${width}`}
              />
              {caption ? <span aria-hidden="true" className="max-w-[68px] text-center text-[13px] leading-[1.2] font-semibold text-body">{caption}</span> : null}
            </div>
          )
        })}
      </div>
      <Hint>{valuesHint(shape)}</Hint>
    </div>
  )
}
