'use client'

import type { ReactNode } from 'react'
import { FractionText } from '../Frac'
import { plainNumberHint } from './hints'
import { QuantityBox } from './QuantityBox'

// P148: the answer area of a whole or a decimal question that has a unit, a round or a minus key (a senior class). The same boxes and lines as the old whole and decimal
// answers, plus the unit after the box, the minus key and the line about rounding. A question with none of these is drawn by QuestionScreen exactly as it always was.

/** One short line under the boxes. The same look as the other hints of the question screen. */
export function AnswerHint({ children }: { children: string }) {
  return (
    <p className="m-0 text-center text-[16px] leading-[1.4] text-body">
      <FractionText text={children} size={18} rule={2} gap={3} side={3} typeset="all" />
    </p>
  )
}

export function Stack({ children }: { children: ReactNode }) {
  return <div className="flex flex-col items-center gap-3.5">{children}</div>
}

export function QuantityAnswer({
  kind,
  extras,
  value,
  onChange,
}: {
  kind: 'whole' | 'decimal'
  extras: { unit?: string; round?: number; signed?: true }
  value: string
  onChange: (value: string) => void
}) {
  return (
    <Stack>
      <QuantityBox id="answer" label="Your answer" value={value} onChange={onChange} unit={extras.unit} signed={!!extras.signed} mode={kind === 'whole' ? 'numeric' : 'decimal'} />
      <AnswerHint>{plainNumberHint(kind, extras)}</AnswerHint>
    </Stack>
  )
}
