import { redirect } from 'next/navigation'
import { Wordmark } from '@/components/install'
import { BackLink, Gem, colors } from '../../_parts'
import { CodeForm } from './CodeForm'

export const metadata = { title: 'Sign-in code · Jemma' }

const length = () => Number(process.env.AUTH_OTP_LENGTH) || 6

export default async function CodePage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams
  if (!email) redirect('/sign-in')
  return (
    <>
      <header style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px 6px 8px' }}>
        <BackLink href="/sign-in" label="Back to sign in" />
        <Wordmark width={82} height={32} />
      </header>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 22, padding: '22px 20px 28px', minHeight: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <Gem />
            <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.18, fontWeight: 600, letterSpacing: '-0.015em', textWrap: 'pretty' }}>Check your email for a 6 digit code.</h1>
          </div>
          <p style={{ margin: '0 0 0 24px', fontSize: 15, lineHeight: 1.45, color: colors.body, textWrap: 'pretty' }}>
            We sent it to {email}. It works for 10 minutes.
          </p>
        </div>
        <CodeForm email={email} length={length()} />
        <div style={{ flex: 1 }} />
      </main>
    </>
  )
}
