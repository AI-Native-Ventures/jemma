'use client'

/**
 * P148: one small box for digits (the hours and the minutes of a time, the parts of a ratio), with its label for a screen reader. `mode` decides what may be
 * typed: `numeric` is digits only, `decimal` is digits with a comma or a point (1,5 : 2). The size comes from `className`.
 */

export type DigitBoxProps = {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  /** The most characters. */
  max: number
  mode?: 'numeric' | 'decimal'
  className: string
}

export const digitsOnly = (s: string, max: number) => s.replace(/\D/g, '').slice(0, max)
export const decimalOnly = (s: string, max: number) => s.replace(/[^\d.,]/g, '').slice(0, max)

export function DigitBox({ id, label, value, onChange, max, mode = 'numeric', className }: DigitBoxProps) {
  return (
    <>
      <label htmlFor={id} className="sr-only">{label}</label>
      <input
        id={id}
        type="text"
        inputMode={mode}
        autoComplete="off"
        value={value}
        onChange={(e) => onChange((mode === 'decimal' ? decimalOnly : digitsOnly)(e.target.value, max))}
        className={`block rounded-18 border-[3px] border-coral bg-card text-center font-bold text-ink outline-none ${className}`}
      />
    </>
  )
}
