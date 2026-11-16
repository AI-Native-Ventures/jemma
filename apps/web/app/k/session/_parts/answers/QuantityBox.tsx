'use client'

import type { ReactNode } from 'react'

// P148: what goes with an answer that is a quantity. `UnitFrame` puts the unit of the question next to the answer box (after it, outside the field; the rand
// sign goes before). `QuantityBox` is the plain box of a whole or a decimal answer when it has a unit, or may be negative (a senior class), with a minus key:
// a phone's number pad has none. A whole or a decimal question with neither is not drawn from here: its screen is the one it always was.

const MINUS = '−'
const unitClass = 'flex min-h-[64px] flex-none items-center text-[28px] leading-none font-bold text-ink'

/** A number as it is typed: digits, a comma or a point, and (when it may be negative) a minus in front. */
export function quantityText(s: string, max: number, signed: boolean): string {
  const kept = s.replace(/−/g, '-').replace(/[^\d.,-]/g, '')
  const sign = signed && kept.startsWith('-') ? '-' : ''
  return (sign + kept.replace(/-/g, '')).slice(0, max)
}

const toggleMinus = (v: string, max: number) => (v.startsWith('-') ? v.slice(1) : `-${v}`.slice(0, max))

/** The unit beside whatever answer box `children` draws. Nothing is added when the question has no unit. */
export function UnitFrame({ unit, children }: { unit?: string; children: ReactNode }) {
  if (!unit) return <>{children}</>
  const before = unit === 'R'
  return (
    <div className="flex w-full items-start justify-center gap-2.5">
      {before ? <span data-unit="true" className={unitClass}>{unit}</span> : null}
      <div className="min-w-0 flex-1">{children}</div>
      {before ? null : <span data-unit="true" className={unitClass}>{unit}</span>}
    </div>
  )
}

export type QuantityBoxProps = {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  /** The unit shown after the box. */
  unit?: string
  /** A minus key, and a minus allowed in the box. */
  signed?: boolean
  mode: 'numeric' | 'decimal'
}

export function QuantityBox({ id, label, value, onChange, unit, signed = false, mode }: QuantityBoxProps) {
  const before = unit === 'R'
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {before ? <span data-unit="true" className="text-[40px] leading-none font-bold text-ink">{unit}</span> : null}
      {signed ? (
        <button
          type="button"
          aria-label="Minus sign"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onChange(toggleMinus(value, 10))}
          className="flex h-[76px] w-14 flex-none cursor-pointer items-center justify-center rounded-18 border-2 border-edge bg-card text-[34px] font-bold text-ink"
        >
          {MINUS}
        </button>
      ) : null}
      <label htmlFor={id} className="sr-only">{label}</label>
      <input
        id={id}
        type="text"
        inputMode={mode}
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(quantityText(e.target.value, 10, signed))}
        className={`block h-[76px] rounded-18 border-[3px] border-coral bg-card text-center text-[40px] font-bold text-ink outline-none ${unit || signed ? 'w-32' : 'w-48'}`}
      />
      {unit && !before ? <span data-unit="true" className="text-[28px] leading-none font-bold text-ink">{unit}</span> : null}
    </div>
  )
}
