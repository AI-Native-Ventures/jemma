'use client'

import { PendingButton } from '@/components/ui/Button'
import { useActionState } from 'react'
import { requestSignInCode } from '../actions'
import { colors, errorText, primaryButton, textInput } from '../_parts'

export function SignInForm() {
  const [state, action, pending] = useActionState(requestSignInCode, undefined)
  return (
    <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 48 }}>
      <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Sign in</h1>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label htmlFor="email" style={{ fontSize: 15, fontWeight: 500 }}>
          Email
        </label>
        <input id="email" name="email" type="email" required placeholder="you@example.com" autoComplete="email" style={{ ...textInput, padding: '0 16px' }} />
      </div>
      {state?.error ? (
        <p role="alert" style={errorText}>
          {state.error}
        </p>
      ) : null}
      <PendingButton pending={pending} type="submit" disabled={pending} style={{ ...primaryButton, opacity: pending ? 0.6 : 1 }}>
        Send me a sign-in code
      </PendingButton>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45, color: colors.body }}>We email you a 6 digit code. No password to remember.</p>
    </form>
  )
}
