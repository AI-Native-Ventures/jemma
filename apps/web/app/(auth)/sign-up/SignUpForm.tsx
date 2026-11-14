'use client'

import { PendingButton } from '@/components/ui/Button'
import Link from 'next/link'
import { useActionState } from 'react'
import { makeAccount } from '../actions'
import { colors, errorText, primaryButton, textInput } from '../_parts'
import { PasswordField } from '../PasswordField'

export function SignUpForm() {
  const [state, action, pending] = useActionState(makeAccount, undefined)
  return (
    <form action={action} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 18, background: '#FFFFFF', border: `1px solid ${colors.line}`, borderRadius: 22 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label htmlFor="name" style={{ fontSize: 15, fontWeight: 500 }}>
          Your name
        </label>
        <input id="name" name="name" type="text" placeholder="First and last name" autoComplete="name" defaultValue={state?.name} style={{ ...textInput, padding: '0 14px' }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label htmlFor="email" style={{ fontSize: 15, fontWeight: 500 }}>
          Email
        </label>
        <input id="email" name="email" type="email" placeholder="you@example.com" autoComplete="email" defaultValue={state?.email} style={{ ...textInput, padding: '0 14px' }} />
      </div>
      <PasswordField id="password" label="Make a password, at least 8 characters" autoComplete="new-password" padLeft={14} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        <style>{`
.cb{position:absolute;top:0;left:0;width:44px;height:44px;margin:0;opacity:0;cursor:pointer}
.cbx{width:24px;height:24px;border-radius:7px;border:2px solid #8C89A3;background:#FFFFFF;display:flex;align-items:center;justify-content:center}
.cbx svg{opacity:0}
.cb:checked + .cbx{background:#1F1D36;border-color:#1F1D36}
.cb:checked + .cbx svg{opacity:1}
.cb:focus-visible + .cbx{outline:3px solid #FF6A4D;outline-offset:2px}`}</style>
        <label htmlFor="agree" style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 48, cursor: 'pointer' }}>
          <span style={{ position: 'relative', width: 44, height: 44, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <input id="agree" name="agree" className="cb" type="checkbox" defaultChecked={state?.agree} />
            <span className="cbx" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m5 12.5 4.5 4.5L19 7.5" />
              </svg>
            </span>
          </span>
          <span style={{ fontSize: 15, lineHeight: 1.45 }}>I agree to Jemma&apos;s terms and privacy policy</span>
        </label>
        <Link href="/privacy" style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', minHeight: 44, marginLeft: 54, fontSize: 15, fontWeight: 600, color: colors.ink, textDecoration: 'underline', textUnderlineOffset: 3 }}>
          Read it in plain words
        </Link>
      </div>
      {state?.error ? (
        <p role="alert" style={state.taken ? { ...errorText, display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 4 } : errorText}>
          {state.taken ? (
            <>
              That email already has an account.{' '}
              <Link href={`/sign-in?email=${encodeURIComponent(state.email ?? '')}`} style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, fontWeight: 600, color: colors.ink, textDecoration: 'underline', textUnderlineOffset: 3 }}>
                Sign in instead.
              </Link>
            </>
          ) : (
            state.error
          )}
        </p>
      ) : null}
      <PendingButton pending={pending} type="submit" disabled={pending} style={{ ...primaryButton, opacity: pending ? 0.6 : 1 }}>
        Make my account
      </PendingButton>
    </form>
  )
}
