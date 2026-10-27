import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import { Wordmark } from '@/components/install'

export const ink = '#1F1D36'
export const body = '#5D5A73'
export const line = '#E7E6EF'

/** One 390 px phone column, centred when the window is wider. These pages sit above any child's space, so no sidebar. */
export function Page({ children }: { children: ReactNode }) {
  return (
    <div style={{ background: '#F7F7FA', minHeight: '100dvh' }}>
      <div
        style={{
          maxWidth: 480,
          margin: '0 auto',
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: "var(--font-outfit), Outfit, system-ui, -apple-system, 'Segoe UI', sans-serif",
          color: ink,
          lineHeight: 'normal',
        }}
      >
        {children}
      </div>
    </div>
  )
}

export function Main({ gap, padding, children }: { gap: number; padding: string; children: ReactNode }) {
  return (
    <main style={{ flex: 1, display: 'flex', flexDirection: 'column', gap, padding, minHeight: 0 }}>{children}</main>
  )
}

export function Gem({ size = 14, marginTop = 10 }: { size?: number; marginTop?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" style={{ flex: 'none', marginTop }}>
      <polygon points="8,0.5 15.5,8 8,15.5 0.5,8" fill="#FF6A4D" />
    </svg>
  )
}

export function Initials({ text }: { text: string }) {
  return (
    <span style={{ width: 36, height: 36, borderRadius: 999, background: '#FFE3DA', color: ink, fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {text}
    </span>
  )
}

export function AccountLink({ initials }: { initials: string }) {
  return (
    <Link href="/p/account" aria-label="Your account" style={{ width: 44, height: 44, borderRadius: 999, border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, textDecoration: 'none', color: ink }}>
      <Initials text={initials} />
    </Link>
  )
}

/** Logo on the left, anything (account, bell) on the right. */
export function BrandHeader({ children }: { children: ReactNode }) {
  return (
    <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 12px 4px 18px' }}>
      <Wordmark width={82} height={32} />
      {children}
    </header>
  )
}

export function BackHeader({ href, children, padding = '10px 16px 6px 8px' }: { href: string; children: ReactNode; padding?: string }) {
  return (
    <header style={{ display: 'flex', alignItems: 'center', gap: 4, padding }}>
      <Link href={href} aria-label="Back" style={{ width: 44, height: 44, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 12, color: ink }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m15 6-6 6 6 6" />
        </svg>
      </Link>
      {children}
    </header>
  )
}

export function DemoTag({ margin = 0 }: { margin?: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px 3px 7px', borderRadius: 999, background: '#FFE3DA', fontSize: 12, fontWeight: 700 }}>
      <svg width="10" height="10" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: 'none', marginTop: margin }}>
        <polygon points="8,0.5 15.5,8 8,15.5 0.5,8" fill="#FF6A4D" />
      </svg>
      Demo
    </span>
  )
}

export function Bullet({ size, top, children, lineHeight = 1.4, gap = 10 }: { size: number; top: number; children: ReactNode; lineHeight?: number; gap?: number }) {
  return (
    <li style={{ display: 'flex', gap, fontSize: 15, lineHeight }}>
      <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" style={{ flex: 'none', marginTop: top }}>
        <polygon points="8,0.5 15.5,8 8,15.5 0.5,8" fill="#FF6A4D" />
      </svg>
      {children}
    </li>
  )
}

export const list: CSSProperties = { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }

export const primaryButton: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', height: 52, borderRadius: 14, background: ink, color: '#FFFFFF',
  fontSize: 17, fontWeight: 600, textDecoration: 'none', border: 'none', cursor: 'pointer', width: '100%', padding: 0,
}
