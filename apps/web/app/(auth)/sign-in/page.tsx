import Link from 'next/link'
import { Wordmark } from '@/components/install'
import { colors } from '../_parts'
import { SignInForm } from './SignInForm'

export const metadata = { title: 'Sign in · Jemma' }

export default function SignInPage() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '72px 24px 36px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Wordmark width={164} height={64} style={{ marginLeft: -6 }} />
        <p style={{ margin: 0, fontSize: 22, lineHeight: 1.3, fontWeight: 500, color: colors.ink, textWrap: 'pretty' }}>
          Each child&apos;s own tutor. Snap a test, Jemma finds the gaps and teaches them.
        </p>
      </div>

      <SignInForm />

      <div aria-hidden="true" style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '28px 0 20px' }}>
        <span style={{ flex: 1, height: 1, background: colors.line }} />
        <span style={{ fontSize: 13, color: colors.body }}>New to Jemma?</span>
        <span style={{ flex: 1, height: 1, background: colors.line }} />
      </div>
      <Link
        href="/sign-up"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 52, borderRadius: 14, border: `1.5px solid ${colors.ink}`, background: '#FFFFFF', color: colors.ink, fontSize: 17, fontWeight: 600, textDecoration: 'none' }}
      >
        Create an account
      </Link>

      <div style={{ flex: 1 }} />
      <Link href="/demo" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 44, fontSize: 15, fontWeight: 600, color: colors.ink, textDecoration: 'none' }}>
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
          <polygon points="8,0.5 15.5,8 8,15.5 0.5,8" fill="#FF6A4D" />
        </svg>
        Judging the challenge? Try the demo
      </Link>
    </div>
  )
}
