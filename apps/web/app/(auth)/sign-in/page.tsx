import { WelcomeDrawing } from '@/components/sa'
import Link from 'next/link'
import { IconLabel } from '@/components/ui/IconLabel'
import { Wordmark } from '@/components/install'
import { colors } from '../_parts'
import { demoOn } from '@/lib/demo-switch'
import { emailCodesOn } from '@/lib/email-codes'
import { CodeSignInForm } from './CodeSignInForm'
import { SignInForm } from './SignInForm'

export const metadata = { title: 'Sign in · Jemma' }

/** `?method=code` is the link "Email me a code instead". `?email=` is the email the sign-up page found already has an account. */
export default async function SignInPage({ searchParams }: { searchParams: Promise<{ method?: string | string[]; email?: string | string[] }> }) {
  const { method, email } = await searchParams
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '72px 24px 36px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Wordmark width={164} height={64} style={{ marginLeft: -6 }} />
        <p style={{ margin: 0, fontSize: 22, lineHeight: 1.3, fontWeight: 500, color: colors.ink, textWrap: 'pretty' }}>
          Learn maths until you understand it.
        </p>
      </div>

      {method === 'code' && emailCodesOn() ? <CodeSignInForm /> : <SignInForm email={typeof email === 'string' ? email.slice(0, 254) : undefined} codes={emailCodesOn()} />}

      <div aria-hidden="true" style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '28px 0 20px' }}>
        <span style={{ flex: 1, height: 1, background: colors.line }} />
        <span style={{ fontSize: 13, color: colors.body }}>New to Jemma?</span>
        <span style={{ flex: 1, height: 1, background: colors.line }} />
      </div>
      <Link
        href="/sign-up"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 52, padding: '12px 20px', textAlign: 'center', textWrap: 'balance', borderRadius: 14, border: `1.5px solid ${colors.ink}`, background: '#FFFFFF', color: colors.ink, fontSize: 17, fontWeight: 600, textDecoration: 'none' }}
      >
        Create an account
      </Link>

      <div className="sa-room" style={{ flex: '1 1 0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div aria-hidden="true" style={{ width: 176 }}>
          <WelcomeDrawing />
        </div>
      </div>
      {/* The demo copy is for local runs and the tests only: the live app has no link to it. */}
      {demoOn() ? (
        <Link href="/demo" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 44, padding: '10px 20px', textAlign: 'center', fontSize: 15, fontWeight: 600, color: colors.ink, textDecoration: 'none' }}>
          <IconLabel gap={8} icon={<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
            <polygon points="8,0.5 15.5,8 8,15.5 0.5,8" fill="#FFB81C" />
          </svg>}>
            Judging the challenge? Try the demo
          </IconLabel>
        </Link>
      ) : null}
    </div>
  )
}
