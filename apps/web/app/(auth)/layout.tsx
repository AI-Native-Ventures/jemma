import { Outfit } from 'next/font/google'
import { RegisterServiceWorker } from '@/components/install'

// The boards use Outfit 400 for body text; the root layout loads 500 to 700 only.
const outfit = Outfit({ subsets: ['latin'], weight: ['400', '500', '600', '700'] })

/** Shared screens: one centred phone-width column on every screen size. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`auth-shell ${outfit.className}`} style={{ minHeight: '100dvh', background: '#F7F7FA', lineHeight: 'normal' }}>
      <style>{`.auth-shell a:hover{color:#B8381F}`}</style>
      <RegisterServiceWorker />
      <div style={{ minHeight: '100dvh', maxWidth: 440, margin: '0 auto', display: 'flex', flexDirection: 'column', position: 'relative' }}>
        {children}
      </div>
    </div>
  )
}
