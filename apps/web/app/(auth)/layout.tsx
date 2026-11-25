import { headers } from 'next/headers'
import { Outfit } from 'next/font/google'
import { UsWords } from '@/components/UsWords'
import { usForVisitor } from '@/lib/us-words-on'
import { RegisterServiceWorker } from '@/components/install'

// The boards use Outfit 400 for body text; the root layout loads 500 to 700 only.
const outfit = Outfit({ subsets: ['latin'], weight: ['400', '500', '600', '700'] })

/** Shared screens: one centred phone-width column on every screen size. */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  // P164: a visitor Cloudflare sees in the US reads US English before signing in too.
  const us = usForVisitor((await headers()).get('cf-ipcountry'))
  return (
    <div className={`auth-shell ${outfit.className}`} style={{ minHeight: '100dvh', background: '#F8F6F1', lineHeight: 'normal' }}>
      <style>{`.auth-shell a:hover{color:#B8281E}`}</style>
      <RegisterServiceWorker />
      {us ? <UsWords /> : null}
      <div style={{ minHeight: '100dvh', maxWidth: 440, margin: '0 auto', display: 'flex', flexDirection: 'column', position: 'relative' }}>
        {children}
      </div>
    </div>
  )
}
