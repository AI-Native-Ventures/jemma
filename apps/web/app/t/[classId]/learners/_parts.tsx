import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'

export const font = "Outfit, system-ui, -apple-system, 'Segoe UI', sans-serif"

const svg = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const

/**
 * The boards in this folder carry their own back header instead of the class header the layout draws.
 * The layout header is hidden by a rule that matches only while one of these pages is on screen.
 */
export function BackHeader({ href, kicker, title, pad = '10px 16px 6px 8px' }: { href: string; kicker: string; title: string; pad?: string }) {
  return (
    <>
      <style>{`div:has(> main [data-own-header]) > header:not([data-own-header]){display:none}`}</style>
      <header data-own-header style={{ display: 'flex', alignItems: 'center', gap: 4, padding: pad }}>
        <Link href={href} aria-label="Back to learners" style={{ width: 44, height: 44, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 12, color: '#1F1D36' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" strokeWidth="2" {...svg}><path d="m15 6-6 6 6 6" /></svg>
        </Link>
        <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2, flex: 1, minWidth: 0, color: '#1F1D36' }}>
          <span style={{ fontSize: 13, color: '#5D5A73' }}>{kicker}</span>
          <span style={{ fontSize: 17, fontWeight: 700 }}>{title}</span>
        </span>
      </header>
    </>
  )
}

export function Page({ children }: { children: ReactNode }) {
  return <div style={{ fontFamily: font, color: '#1F1D36' }} className="mx-auto flex w-full max-w-[640px] flex-col">{children}</div>
}

export function Diamond({ size = 14, top = 10 }: { size?: number; top?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" style={{ flex: 'none', marginTop: top }}>
      <polygon points="8,0.5 15.5,8 8,15.5 0.5,8" fill="#FF6A4D" />
    </svg>
  )
}

export function EyeIcon({ size = 16, stroke = 1.8 }: { size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth={stroke} {...svg} style={{ flex: 'none' }}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r={size === 18 ? 3 : 2.8} />
    </svg>
  )
}

export function Chevron() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" stroke="#1F1D36" strokeWidth="2" {...svg} style={{ flex: 'none' }}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  )
}

export const avatarBg = (first: boolean): CSSProperties['background'] => (first ? '#FFD3C7' : '#E9E7F3')

export function Avatar({ name, size = 34, first = false, fontSize = 13 }: { name: string; size?: number; first?: boolean; fontSize?: number }) {
  return (
    <span aria-hidden="true" style={{ width: size, height: size, flex: 'none', borderRadius: 999, background: avatarBg(first), fontSize, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {name.charAt(0)}
    </span>
  )
}

export const card = (radius = 20): CSSProperties => ({ display: 'flex', flexDirection: 'column', background: '#FFFFFF', border: '1px solid #E7E6EF', borderRadius: radius })
