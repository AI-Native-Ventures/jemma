'use client'

import Link from 'next/link'
import { useRef, useState, useTransition } from 'react'
import type { ClipboardEvent, KeyboardEvent } from 'react'
import { checkCode, resendCode } from '../../actions'
import { colors, errorText, primaryButton } from '../../_parts'

function hint(filled: number, LENGTH: number): string {
  const left = LENGTH - filled
  if (filled === 0 || filled === LENGTH) return 'Paste it or type it.'
  return `Paste it or type it. ${left === 1 ? 'One more digit' : `${left} more digits`} to go.`
}

/** `length` is the project's emailed code length: 6 as drawn on the board unless AUTH_OTP_LENGTH says otherwise. */
export function CodeForm({ email, length: LENGTH }: { email: string; length: number }) {
  const [digits, setDigits] = useState<string[]>(Array(LENGTH).fill(''))
  const [error, setError] = useState<string>()
  const [note, setNote] = useState<string>()
  const [pending, start] = useTransition()
  const refs = useRef<Array<HTMLInputElement | null>>([])

  const filled = digits.filter(Boolean).length
  const active = digits.findIndex((d) => !d)

  const fill = (from: number, text: string) => {
    const chars = text.replace(/\D/g, '').slice(0, LENGTH - from).split('')
    if (!chars.length) return
    const next = [...digits]
    chars.forEach((c, i) => (next[from + i] = c))
    setDigits(next)
    refs.current[Math.min(from + chars.length, LENGTH - 1)]?.focus()
  }

  const onKeyDown = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      const next = [...digits]
      next[i - 1] = ''
      setDigits(next)
      refs.current[i - 1]?.focus()
    }
  }

  const onPaste = (i: number, e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    fill(i === 0 || e.clipboardData.getData('text').replace(/\D/g, '').length >= LENGTH ? 0 : i, e.clipboardData.getData('text'))
  }

  const submit = () => {
    setError(undefined)
    setNote(undefined)
    start(async () => {
      const result = await checkCode(email, digits.join(''))
      if (result?.error) setError(result.error)
    })
  }

  const sendNew = () => {
    setError(undefined)
    setNote(undefined)
    start(async () => {
      const result = await resendCode(email)
      if (result?.error) setError(result.error)
      else setNote('A new code is on its way.')
    })
  }

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <legend style={{ padding: 0, marginBottom: 10, fontSize: 15, fontWeight: 500 }}>Sign-in code</legend>
          <span style={{ display: 'grid', gridTemplateColumns: `repeat(${LENGTH}, minmax(0, 1fr))`, gap: 8 }}>
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => {
                  refs.current[i] = el
                }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                aria-label={`Digit ${i + 1} of ${LENGTH}`}
                autoComplete={i === 0 ? 'one-time-code' : 'off'}
                value={d}
                onChange={(e) => fill(i, e.target.value)}
                onKeyDown={(e) => onKeyDown(i, e)}
                onPaste={(e) => onPaste(i, e)}
                onFocus={(e) => e.target.select()}
                style={{
                  width: '100%',
                  height: 62,
                  padding: 0,
                  borderRadius: 14,
                  border: i === active ? `2px solid ${colors.ink}` : `1px solid ${colors.grey}`,
                  background: '#FFFFFF',
                  color: colors.ink,
                  fontSize: 28,
                  fontWeight: 600,
                  textAlign: 'center',
                }}
              />
            ))}
          </span>
          <span style={{ fontSize: 14, color: colors.body }}>{hint(filled, LENGTH)}</span>
          {error ? (
            <span role="alert" style={errorText}>
              {error}
            </span>
          ) : null}
          {note ? (
            <span role="status" style={{ fontSize: 14, color: colors.body }}>
              {note}
            </span>
          ) : null}
        </fieldset>
        <button type="submit" disabled={pending || filled < LENGTH} style={{ ...primaryButton, opacity: pending ? 0.6 : 1 }}>
          Sign in
        </button>
      </form>

      <section aria-labelledby="noget" style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 16, background: '#FFFFFF', border: `1px solid ${colors.line}`, borderRadius: 18 }}>
        <h2 id="noget" style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
          Didn&apos;t get it?
        </h2>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.45, color: colors.body }}>Check your spam folder. A new code can take a minute.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
          <button
            type="button"
            onClick={sendNew}
            disabled={pending}
            style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 44, padding: '0 14px', borderRadius: 12, border: `1.5px solid ${colors.ink}`, background: '#FFFFFF', color: colors.ink, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 12a8 8 0 1 1-2.34-5.66" />
              <path d="M20 4v4.5h-4.5" />
            </svg>
            Send a new code
          </button>
          <Link href="/sign-in" style={{ display: 'flex', alignItems: 'center', minHeight: 44, padding: '0 10px', fontSize: 15, fontWeight: 600, color: colors.ink, textDecoration: 'underline', textUnderlineOffset: 3 }}>
            Use a different email
          </Link>
        </div>
      </section>
    </>
  )
}
