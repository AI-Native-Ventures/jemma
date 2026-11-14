'use client'

import { PendingButton } from '@/components/ui/Button'
import { useRouter } from 'next/navigation'
import { useState, useTransition, type CSSProperties } from 'react'
import { signInChild } from '@/lib/auth'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const

const keyStyle: CSSProperties = {
  height: 60,
  borderRadius: 18,
  border: '1px solid #E7E6EF',
  background: '#FFFFFF',
  color: '#1F1D36',
  fontSize: 26,
  fontWeight: 600,
  fontFamily: 'inherit',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
}

const hidden: CSSProperties = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }

const MESSAGES = {
  wrong: 'That code or PIN is not right. Check it and try again.',
  locked: 'Too many tries. Ask a grown-up to help.',
  failed: 'Jemma could not sign you in. Try again.',
} as const

/** Board `child-sign-in`: the family code and a 4-digit PIN keypad. */
export function SignInForm() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState<keyof typeof MESSAGES | null>(null)
  const [pending, start] = useTransition()

  const press = (d: string) => setPin((p) => (p.length < 4 ? p + d : p))

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (pending) return
    if (!code.trim() || pin.length !== 4) return setError('wrong')
    setError(null)
    start(async () => {
      try {
        const res = await signInChild(code, pin)
        if (res.ok) {
          router.replace('/k')
          router.refresh()
        } else {
          setError(res.reason)
          setPin('')
        }
      } catch {
        setError('failed')
      }
    })
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label htmlFor="code" style={{ fontSize: 16, fontWeight: 600 }}>
          Your code
        </label>
        <input
          id="code"
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s/g, ''))}
          autoComplete="username"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          style={{ height: 60, padding: '0 16px', borderRadius: 16, border: '1px solid #8C89A3', background: '#FFFFFF', color: '#1F1D36', fontSize: 26, fontWeight: 700, letterSpacing: '0.16em', fontFamily: 'inherit' }}
        />
      </div>
      <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <legend style={{ padding: 0, marginBottom: 8, fontSize: 16, fontWeight: 600 }}>Your PIN</legend>
        <span style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span aria-hidden="true" style={{ display: 'flex', gap: 14 }}>
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                style={{ width: 18, height: 18, borderRadius: 999, ...(i < pin.length ? { background: '#1F1D36' } : { border: '2px solid #8C89A3' }) }}
              />
            ))}
          </span>
          <span role="status" style={hidden}>
            {pin.length} of 4 digits typed
          </span>
        </span>
        <span style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
          {KEYS.map((d) => (
            <button key={d} type="button" onClick={() => press(d)} style={keyStyle}>
              {d}
            </button>
          ))}
          <span aria-hidden="true" />
          <button type="button" onClick={() => press('0')} style={keyStyle}>
            0
          </button>
          <button type="button" aria-label="Delete" onClick={() => setPin((p) => p.slice(0, -1))} style={keyStyle}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 5h11a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9l-6-7z" />
              <path d="m12.5 9.5 5 5M17.5 9.5l-5 5" />
            </svg>
          </button>
        </span>
      </fieldset>
      {error && (
        <p role="alert" style={{ margin: 0, fontSize: 16, lineHeight: 1.4, fontWeight: 600, color: '#B8381F' }}>
          {MESSAGES[error]}
        </p>
      )}
      <PendingButton pending={pending}
        type="submit"
        disabled={pending}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 64, padding: '12px 20px', textAlign: 'center', textWrap: 'balance', borderRadius: 20, border: 'none', background: '#FF6A4D', color: '#1F1D36', fontSize: 20, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', opacity: pending ? 0.6 : 1 }}
      >
        Sign in
      </PendingButton>
    </form>
  )
}
