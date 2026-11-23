import Link from 'next/link'
import type { ReactNode } from 'react'

export const colors = { ink: '#161616', body: '#5C5A55', line: '#E8E5DE', grey: '#8F8D88', gold: '#FFB81C', redText: '#B8281E', green: '#007749' }

export function Gem({ size = 14, marginTop = 11 }: { size?: number; marginTop?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" style={{ flex: 'none', marginTop }}>
      <polygon points="8,0.5 15.5,8 8,15.5 0.5,8" fill="#FFB81C" />
    </svg>
  )
}

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} aria-label={label} style={{ width: 44, height: 44, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 12, color: colors.ink }}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m15 6-6 6 6 6" />
      </svg>
    </Link>
  )
}

export function ChevronRight() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#161616" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none' }}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  )
}

/** The titled white card used by privacy and help. */
export function Section({ id, title, gap, children }: { id: string; title: string; gap: number; children: ReactNode }) {
  return (
    <section aria-labelledby={id} style={{ display: 'flex', flexDirection: 'column', gap, padding: 16, background: '#FFFFFF', border: `1px solid ${colors.line}`, borderRadius: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <h2 id={id} style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>
            {title}
          </h2>
        </div>
      </div>
      {children}
    </section>
  )
}

export const primaryButton = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  minHeight: 52,
  padding: '12px 20px',
  textAlign: 'center',
  textWrap: 'balance',
  borderRadius: 14,
  border: 'none',
  background: colors.green,
  color: '#FFFFFF',
  fontSize: 17,
  fontWeight: 600,
  textDecoration: 'none',
  cursor: 'pointer',
} as const

export const textInput = {
  height: 52,
  borderRadius: 14,
  border: `1px solid ${colors.grey}`,
  background: '#FFFFFF',
  color: colors.ink,
  fontSize: 17,
} as const

export const errorText = { margin: 0, fontSize: 14, color: colors.redText } as const
