'use client'

import { useState, useTransition, type CSSProperties, type ReactNode } from 'react'
import { Sheet } from '@/components/ui'

const field: CSSProperties = { height: 52, boxSizing: 'border-box', border: '1px solid #8F8D88', borderRadius: 14, background: '#FFFFFF', padding: '0 14px', fontSize: 17, color: '#161616', fontFamily: 'inherit' }
const save: CSSProperties = { minHeight: 56, border: 'none', borderRadius: 14, background: '#007749', color: '#FFFFFF', fontSize: 17, fontWeight: 600, cursor: 'pointer' }

/** A button that opens a sheet with one name to change and Save. Used for the parent's own name and for a child's first name. */
export function EditName({
  button,
  buttonStyle,
  ariaLabel,
  title,
  label,
  initial,
  onSave,
}: {
  button: ReactNode
  buttonStyle: CSSProperties
  ariaLabel?: string
  title: string
  label: string
  initial: string
  onSave: (name: string) => Promise<{ ok: true } | { ok: false; message: string }>
}) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const id = `edit-${label.replace(/\W+/g, '-').toLowerCase()}`
  return (
    <>
      <button type="button" aria-label={ariaLabel} onClick={() => setOpen(true)} style={buttonStyle}>
        {button}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={title}>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            start(async () => {
              setError(null)
              const res = await onSave(value)
              if (res.ok) setOpen(false)
              else setError(res.message)
            })
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          <label htmlFor={id} style={{ fontSize: 15, fontWeight: 600 }}>
            {label}
          </label>
          <input id={id} value={value} onChange={(e) => setValue(e.target.value)} maxLength={80} autoComplete="off" style={field} />
          {error ? (
            <p role="alert" style={{ margin: 0, fontSize: 14, color: '#B8281E' }}>
              {error}
            </p>
          ) : null}
          <button type="submit" disabled={pending || !value.trim()} style={{ ...save, opacity: pending || !value.trim() ? 0.5 : 1 }}>
            {pending ? 'Saving' : 'Save'}
          </button>
        </form>
      </Sheet>
    </>
  )
}
