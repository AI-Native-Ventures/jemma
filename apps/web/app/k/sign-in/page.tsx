import { Outfit } from 'next/font/google'
import { Wordmark } from '@/components/install'
import { SignInForm } from './SignInForm'

const outfit = Outfit({ subsets: ['latin'], weight: ['400', '500', '600', '700'] })

/**
 * Board `child-sign-in`. Signed-out screen: the learner layout and proxy let it through
 * (`/k/sign-in` is the one public path under `/k`).
 */
export default function ChildSignInPage() {
  return (
    <div className={outfit.className} style={{ minHeight: '100dvh', background: '#F7F7FA', color: '#1F1D36', lineHeight: 'normal' }}>
      <div style={{ minHeight: '100dvh', maxWidth: 440, margin: '0 auto', display: 'flex', flexDirection: 'column' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 18px 4px' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/jemma-app-icon.svg" alt="" style={{ width: 36, height: 36, display: 'block' }} />
          <Wordmark width={72} height={28} />
        </header>
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 18, padding: '16px 20px 24px', minHeight: 0 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: 'none', marginTop: 12 }}>
              <polygon points="8,0.5 15.5,8 8,15.5 0.5,8" fill="#FF6A4D" />
            </svg>
            <h1 style={{ margin: 0, fontSize: 31, lineHeight: 1.14, fontWeight: 700, letterSpacing: '-0.02em', textWrap: 'pretty' }}>Hi! Sign in to your Jemma.</h1>
          </div>
          <SignInForm />
          <p style={{ margin: 0, textAlign: 'center', fontSize: 16, color: '#5D5A73' }}>Forgot your PIN? Ask a grown-up.</p>
          <div style={{ flex: 1 }} />
        </main>
      </div>
    </div>
  )
}
