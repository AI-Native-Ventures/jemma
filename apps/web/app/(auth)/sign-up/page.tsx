import Link from 'next/link'
import { Wordmark } from '@/components/install'
import { BackLink, Gem, colors } from '../_parts'
import { SignUpForm } from './SignUpForm'

export const metadata = { title: 'Create an account · Jemma' }

export default function SignUpPage() {
  return (
    <>
      <header style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px 6px 8px' }}>
        <BackLink href="/sign-in" label="Back to sign in" />
        <Wordmark width={82} height={32} />
      </header>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 22, padding: '18px 20px 28px', minHeight: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <Gem />
            <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.18, fontWeight: 600, letterSpacing: '-0.015em', textWrap: 'pretty' }}>
              Make your Jemma account. It&apos;s free for families.
            </h1>
          </div>
          <p style={{ margin: '0 0 0 24px', fontSize: 15, lineHeight: 1.45, color: colors.body, textWrap: 'pretty' }}>
            For teachers, parents, and learners in Grade 8 and up. Younger children get their sign-in from a grown-up.
          </p>
        </div>

        <SignUpForm />

        <p style={{ margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: '4px 8px', fontSize: 15, color: colors.body }}>
          Already have an account?
          <Link href="/sign-in" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, fontWeight: 600, color: colors.ink, textDecoration: 'underline', textUnderlineOffset: 3 }}>
            Sign in
          </Link>
        </p>
        <div style={{ flex: 1 }} />
      </main>
    </>
  )
}
