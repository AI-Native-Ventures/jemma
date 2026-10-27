import { Outfit } from 'next/font/google'
import type { ReactNode } from 'react'
import { requireRole } from '@/lib/auth'

const outfit = Outfit({ subsets: ['latin'], weight: ['400', '500', '600', '700'] })

/** Account and data screens: one centred phone-width column on every screen size, parent only. */
export async function ParentFrame({ children }: { children: ReactNode }) {
  await requireRole('parent')
  return (
    <div className={`p26-shell ${outfit.className}`} style={{ minHeight: '100dvh', background: '#F7F7FA', color: '#1F1D36', lineHeight: 'normal' }}>
      <style>{`.p26-shell a:hover{color:#B8381F}.p26-shell button{font:inherit;cursor:pointer}.p26-shell input{font:inherit}`}</style>
      <div style={{ minHeight: '100dvh', maxWidth: 440, margin: '0 auto', display: 'flex', flexDirection: 'column', position: 'relative' }}>{children}</div>
    </div>
  )
}
