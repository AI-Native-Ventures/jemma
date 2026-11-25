import type { CSSProperties, ReactNode } from 'react'
import { Gem } from '../account/_ui'
import { dangerButton, outlineButton } from '../account/_styles'

// The shared look of the plan screens (P161), the same as the account screens: white cards, a gold button for the one main step.

export const ink = '#161616'
export const body = '#5C5A55'
export const line = '#E8E5DE'
export const soft = '#F0EEE8'

export const card: CSSProperties = { display: 'flex', flexDirection: 'column', padding: 16, background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 20 }
export const gold: CSSProperties = { ...outlineButton, border: 'none', background: '#FFB81C', color: ink, fontSize: 17, fontWeight: 700, textDecoration: 'none' }
export const outline: CSSProperties = { ...outlineButton, textDecoration: 'none' }
export const danger: CSSProperties = dangerButton
export const red: CSSProperties = { ...dangerButton, border: 'none', background: '#B8281E', color: '#FFFFFF' }
export const small: CSSProperties = { margin: 0, fontSize: 14, lineHeight: 1.45, color: body }
export const note: CSSProperties = { margin: 0, fontSize: 15, lineHeight: 1.5, color: '#3D3B37' }
export const goldBox: CSSProperties = { margin: 0, padding: 16, borderRadius: 18, border: '1px solid #FFDC93', background: '#FFF8E8', fontSize: 15, lineHeight: 1.5 }

export function Main({ children, gap = 16 }: { children: ReactNode; gap?: number }) {
  return <main style={{ flex: 1, display: 'flex', flexDirection: 'column', gap, padding: '12px 20px 28px' }}>{children}</main>
}

export function Headline({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <Gem />
        <h1 style={{ margin: 0, fontSize: 26, lineHeight: 1.18, fontWeight: 600, letterSpacing: '-0.015em', textWrap: 'pretty' }}>{children}</h1>
      </div>
      {sub ? <p style={{ margin: 0, paddingLeft: 24, fontSize: 16, lineHeight: 1.45, color: body }}>{sub}</p> : null}
    </div>
  )
}

export function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, padding: '11px 0', borderTop: `1px solid ${soft}` }}>
      <span style={{ fontSize: 16, color: body }}>{label}</span>
      <span style={{ fontSize: 16, fontWeight: 600, textAlign: 'right' }}>{value}</span>
    </div>
  )
}

export function Lock({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none', marginTop: 1 }}>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </svg>
  )
}

export function Check({ size = 38, color = '#FFFFFF' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none' }}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  )
}

export function SafeBox() {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: 16, borderRadius: 18, background: '#F4F2EE' }}>
      <Lock />
      <p style={{ ...note, color: ink }}>You pay on PayFast, a safe payment page. Jemma never sees your card.</p>
    </div>
  )
}

/** "Amina", "Amina and Sarah", "Amina, Sarah and Leo". */
export function namesOf(names: string[]): string {
  if (names.length <= 1) return names[0] ?? 'your children'
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}
