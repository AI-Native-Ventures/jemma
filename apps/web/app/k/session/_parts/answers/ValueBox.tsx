'use client'

import type { KeyboardEvent } from 'react'

// P150: the box of one value of a list or a table. A number pad when the values are plain numbers; the full keyboard when a value may be a fraction, a root
// or negative (a phone's number pad has no minus and no slash). The maths editor is one box on a screen with one keyboard, so a row of boxes is plain text boxes:
// the answer is read as a number or an expression by the same reader as every other answer (`1/2`, `sqrt(2)`, `-3`).

/** The most characters of one value: a number with a comma, or a short fraction or root. */
const MAX_PLAIN = 8
const MAX_RICH = 14

/** Enter moves to the next box of the same list or table (the phone's key says Next), and does nothing on the last one. */
function toNext(e: KeyboardEvent<HTMLInputElement>) {
  if (e.key !== 'Enter') return
  e.preventDefault()
  const boxes = Array.from(e.currentTarget.closest('[data-values]')?.querySelectorAll<HTMLInputElement>('input[data-value-box]') ?? [])
  boxes[boxes.indexOf(e.currentTarget) + 1]?.focus()
}

export type ValueBoxProps = {
  id: string
  /** The name a screen reader says ("min", "Row 2, y"). */
  label: string
  value: string
  onChange: (value: string) => void
  /** Digits with a comma or a point are all this value can be: a number pad is enough. */
  plain: boolean
  className?: string
}

export function ValueBox({ id, label, value, onChange, plain, className = '' }: ValueBoxProps) {
  return (
    <>
      <label htmlFor={id} className="sr-only">{label}</label>
      <input
        id={id}
        data-value-box="true"
        type="text"
        inputMode={plain ? 'decimal' : 'text'}
        enterKeyHint="next"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(plain ? e.target.value.replace(/[^\d.,]/g, '').slice(0, MAX_PLAIN) : e.target.value.slice(0, MAX_RICH))}
        onKeyDown={toNext}
        className={`block min-w-0 rounded-14 bg-card text-center font-bold text-ink outline-none focus:border-ink ${className}`}
      />
    </>
  )
}

/** A value is filled when it has something in it. */
export const filled = (values: string[]): boolean => values.length > 0 && values.every((v) => v.trim() !== '')

/** The one text that is sent: the values with a semicolon between them (a comma is the comma of a decimal), or nothing until every box has a value. */
export const joined = (values: string[]): string => (filled(values) ? values.map((v) => v.trim()).join('; ') : '')
