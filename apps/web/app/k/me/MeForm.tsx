'use client'

import { PendingButton } from '@/components/ui/Button'
import { useEffect, useState } from 'react'
import { signOutChild } from './actions'

const COLOURS = [
  { name: 'Peach', fill: '#FFD3C7' },
  { name: 'Lilac', fill: '#E9E7F3' },
  { name: 'Shell', fill: '#FFE3DA' },
  { name: 'Cloud', fill: '#EEEDF5' },
] as const

/** Both choices stay on this device: there is no account column for them. */
export const AVATAR_KEY = 'jemma:avatar-colour'
export const READ_ALOUD_KEY = 'jemma:read-aloud'

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}
function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Private window or blocked storage: the choice just lasts until the page closes.
  }
}

export function MeForm({ firstName, initial }: { firstName: string; initial: string }) {
  const [colour, setColour] = useState<string>('Peach')
  const [aloud, setAloud] = useState(false)

  useEffect(() => {
    const c = read(AVATAR_KEY)
    if (COLOURS.some((x) => x.name === c)) setColour(c!)
    setAloud(read(READ_ALOUD_KEY) === 'on')
  }, [])

  const fill = COLOURS.find((c) => c.name === colour)!.fill

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center' }}>
        <span aria-hidden="true" style={{ position: 'relative', width: 112, height: 112, borderRadius: 999, background: fill, fontSize: 46, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {initial}
          <svg width="34" height="34" viewBox="0 0 16 16" style={{ position: 'absolute', right: -2, bottom: -2, background: '#FFFFFF', borderRadius: 999, padding: 4 }}>
            <polygon points="8,0.5 15.5,8 8,15.5 0.5,8" fill="#FF6A4D" />
          </svg>
        </span>
        <h1 style={{ margin: 0, fontSize: 31, lineHeight: 1.14, fontWeight: 700, letterSpacing: '-0.02em' }}>That&apos;s you, {firstName}!</h1>
      </div>

      <fieldset style={{ border: 'none', margin: 0, padding: 18, display: 'flex', flexDirection: 'column', gap: 12, background: '#FFFFFF', borderRadius: 24, boxShadow: 'inset 0 0 0 1px #E7E6EF' }}>
        <legend style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Pick your colour</legend>
        <span aria-hidden="true" style={{ fontSize: 19, fontWeight: 600 }}>Pick your colour</span>
        <span style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 6px' }}>
          {COLOURS.map((c) => {
            const on = c.name === colour
            return (
              <button
                key={c.name}
                type="button"
                aria-pressed={on}
                aria-label={c.name}
                onClick={() => {
                  setColour(c.name)
                  write(AVATAR_KEY, c.name)
                }}
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 999,
                  ...(on ? { boxShadow: '0 0 0 3px #FFFFFF, 0 0 0 5px #1F1D36' } : { border: '1px solid #CFCDDC' }),
                  background: c.fill,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                  cursor: 'pointer',
                }}
              >
                {on && (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1F1D36" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m5 12.5 4.5 4.5L19 7.5" />
                  </svg>
                )}
              </button>
            )
          })}
        </span>
      </fieldset>

      <section style={{ padding: '4px 18px', background: '#FFFFFF', border: '1px solid #E7E6EF', borderRadius: 24 }}>
        <button
          type="button"
          aria-pressed={aloud}
          onClick={() => {
            setAloud(!aloud)
            write(READ_ALOUD_KEY, aloud ? 'off' : 'on')
          }}
          style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 56, padding: '6px 0', border: 'none', background: 'transparent', color: '#1F1D36', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 18, fontWeight: 500 }}>Read questions out loud</span>
            <span style={{ fontSize: 13, lineHeight: 1.35, color: '#5D5A73' }}>Jemma reads each question to you</span>
          </span>
          <span aria-hidden="true" style={{ position: 'relative', width: 50, height: 30, flex: 'none', borderRadius: 999, background: aloud ? '#1F1D36' : '#FFFFFF', border: `2px solid ${aloud ? '#1F1D36' : '#8C89A3'}` }}>
            <span style={{ position: 'absolute', top: 2, left: aloud ? 22 : 2, width: 22, height: 22, borderRadius: 999, background: aloud ? '#FFFFFF' : '#8C89A3' }} />
          </span>
        </button>
      </section>

      <form action={signOutChild} style={{ display: 'contents' }}>
        <PendingButton type="submit" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 60, borderRadius: 20, border: '2px solid #1F1D36', background: '#FFFFFF', color: '#1F1D36', fontSize: 19, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          I&apos;m done for today
        </PendingButton>
      </form>
      <p style={{ margin: 0, textAlign: 'center', fontSize: 16, lineHeight: 1.45, color: '#5D5A73' }}>A grown-up can change your PIN.</p>
    </>
  )
}
