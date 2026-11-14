'use client'

import { PendingButton } from '@/components/ui/Button'
import Link from 'next/link'
import { useActionState } from 'react'
import { signInWithPassword } from '../actions'
import { colors, errorText, primaryButton, textInput } from '../_parts'
import { PasswordField } from '../PasswordField'

/** The sign-in form: an email and a password. `email` is filled when the sign-up page sent the person here ("Sign in instead"). */
export function SignInForm({ email }: { email?: string }) {
  const [state, action, pending] = useActionState(signInWithPassword, undefined)
  return (
    <form action={action} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 48 }}>
      <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Sign in</h1>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label htmlFor="email" style={{ fontSize: 15, fontWeight: 500 }}>
          Email
        </label>
        <input id="email" name="email" type="email" placeholder="you@example.com" autoComplete="email" defaultValue={state?.email ?? email} style={{ ...textInput, padding: '0 16px' }} />
      </div>
      <PasswordField id="password" label="Password" autoComplete="current-password" padLeft={16} />
      {state?.error ? (
        <p role="alert" style={errorText}>
          {state.error}
        </p>
      ) : null}
      <PendingButton pending={pending} type="submit" disabled={pending} style={{ ...primaryButton, opacity: pending ? 0.6 : 1 }}>
        Sign in
      </PendingButton>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45, color: colors.body }}>Forgot your password? Ask the person who set up your school&apos;s Jemma.</p>
      <Link href="/sign-in?method=code" style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', minHeight: 44, padding: '0 2px', fontSize: 15, fontWeight: 600, color: colors.ink, textDecoration: 'underline', textUnderlineOffset: 3 }}>
        Email me a code instead
      </Link>
    </form>
  )
}
