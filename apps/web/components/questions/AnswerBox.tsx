import type { CSSProperties, ReactNode } from 'react'

const hidden: CSSProperties = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }

export type AnswerBoxProps = {
  id: string
  /** Spoken name of the box (visually hidden, as on the boards). */
  label: string
  value: string
  onChange: (value: string) => void
  /** Text after the box: "cm²", "more". */
  unit: ReactNode
  unitStyle: CSSProperties
  disabled?: boolean
}

/** The big coral number box and its unit, shared by the two Grade 6 question styles. */
export function AnswerBox({ id, label, value, onChange, unit, unitStyle, disabled }: AnswerBoxProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <label htmlFor={id} style={hidden}>
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: 96,
          height: 76,
          borderRadius: 18,
          border: '3px solid #FF6A4D',
          background: '#FFFFFF',
          color: '#1F1D36',
          fontSize: 40,
          fontWeight: 700,
          textAlign: 'center',
          fontFamily: 'inherit',
        }}
      />
      <span style={unitStyle}>{unit}</span>
    </div>
  )
}
