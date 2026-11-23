'use client'

import type { CSSProperties } from 'react'
import { useErrorRecovery, type ErrorScreenProps } from '@/components/ErrorRecovery'
import { RECOVERY_HELP, RECOVERY_TITLE, RECOVERY_WAITING } from '@/lib/error-recovery'
import { reloadPage } from '@/lib/reload-page'

// This screen replaces the whole page, root layout included (P152): the app's stylesheet is not loaded here, so every style is inline, with the
// colours and shapes of the app's own cards.
const page: CSSProperties = {
  margin: 0,
  minHeight: '100dvh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '40px 20px',
  boxSizing: 'border-box',
  background: '#f8f6f1',
  color: '#161616',
  fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
}
const card: CSSProperties = {
  width: '100%',
  maxWidth: 460,
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  padding: 20,
  background: '#ffffff',
  border: '1px solid #e8e5de',
  borderRadius: 26,
  boxShadow: '0 8px 24px rgba(22,22,22,0.06)',
  lineHeight: 'normal',
}
const title: CSSProperties = { margin: 0, fontSize: 24, lineHeight: 1.2, fontWeight: 700, letterSpacing: '-0.01em', textWrap: 'pretty' }
const words: CSSProperties = { margin: 0, fontSize: 17, lineHeight: 1.45, color: '#5c5a55' }
const action: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxSizing: 'border-box',
  minHeight: 56,
  padding: '12px 20px',
  borderRadius: 18,
  fontSize: 19,
  fontWeight: 700,
  textAlign: 'center',
  textDecoration: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
}

/**
 * The last error screen: a failure in the root layout itself, which no `error.tsx` can catch. It tries again by itself like the others; its Try again
 * button loads the whole page again, because here there is no router to ask (P152, see ErrorRecovery).
 */
export default function GlobalError(props: ErrorScreenProps) {
  const { phase } = useErrorRecovery(props)
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Jemma</title>
      </head>
      <body style={page}>
        {phase === 'waiting' ? (
          <section role="status" aria-live="polite" style={{ ...card, alignItems: 'center', textAlign: 'center' }}>
            <p style={words}>{RECOVERY_WAITING}</p>
          </section>
        ) : (
          <section role="alert" aria-labelledby="recovery-title" style={card}>
            <h2 id="recovery-title" style={title}>{RECOVERY_TITLE}</h2>
            <p style={words}>{RECOVERY_HELP}</p>
            <button type="button" onClick={reloadPage} style={{ ...action, border: 0, background: '#ffb81c', color: '#161616' }}>
              Try again
            </button>
            <a href="/" style={{ ...action, border: '1.5px solid #161616', background: '#ffffff', color: '#161616', fontWeight: 600 }}>
              Go to home
            </a>
          </section>
        )}
      </body>
    </html>
  )
}
