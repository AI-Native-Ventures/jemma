'use client'

import { useState } from 'react'
import { colors, textInput } from './_parts'

/**
 * A password box with a Show / Hide button at its right edge (the button is a plain button: it never sends the form). The box is named
 * `password`. The button's words are only "Show" and "Hide", so the box keeps the label's name to itself.
 */
export function PasswordField({ id, label, autoComplete, padLeft }: { id: string; label: string; autoComplete: 'new-password' | 'current-password'; padLeft: number }) {
  const [shown, setShown] = useState(false)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label htmlFor={id} style={{ fontSize: 15, fontWeight: 500 }}>
        {label}
      </label>
      <div style={{ position: 'relative', display: 'flex' }}>
        <input
          id={id}
          name="password"
          type={shown ? 'text' : 'password'}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          style={{ ...textInput, flex: 1, minWidth: 0, padding: `0 76px 0 ${padLeft}px` }}
        />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-controls={id}
          style={{ position: 'absolute', top: 4, right: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 60, minHeight: 44, padding: '0 12px', borderRadius: 10, border: 'none', background: 'transparent', color: colors.ink, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
        >
          {shown ? 'Hide' : 'Show'}
        </button>
      </div>
    </div>
  )
}
