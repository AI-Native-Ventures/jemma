'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'

export const colors = { ink: '#161616', body: '#5C5A55', line: '#E8E5DE', grey: '#8F8D88', gold: '#FFB81C', redText: '#B8281E', green: '#007749' }

export function Gem({ size = 14, marginTop = 10 }: { size?: number; marginTop?: number }) {
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

export function Chevron() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#161616" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none' }}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  )
}

/** Header row of a board: back arrow, optional small line above the title. */
export function BoardHeader({ href, label, small, title }: { href: string; label: string; small?: string; title: string }) {
  return (
    <header style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '10px 12px 6px 8px' }}>
      <BackLink href={href} label={label} />
      <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2, flex: 1, minWidth: 0, color: colors.ink }}>
        {small ? <span style={{ fontSize: 13, color: colors.body }}>{small}</span> : null}
        <span style={{ fontSize: 17, fontWeight: 700 }}>{title}</span>
      </span>
    </header>
  )
}

export function BoardHeadline({ size, children }: { size: number; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <Gem />
        <h1 style={{ margin: 0, fontSize: size, lineHeight: 1.18, fontWeight: 600, letterSpacing: '-0.015em', textWrap: 'pretty' }}>{children}</h1>
      </div>
    </div>
  )
}

/** The titled white card. */
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

export function Switch({ on }: { on: boolean }) {
  return on ? (
    <span aria-hidden="true" style={{ position: 'relative', width: 50, height: 30, flex: 'none', borderRadius: 999, background: '#007749' }}>
      <span style={{ position: 'absolute', top: 4, left: 24, width: 22, height: 22, borderRadius: 999, background: '#FFFFFF' }} />
    </span>
  ) : (
    <span aria-hidden="true" style={{ position: 'relative', width: 50, height: 30, flex: 'none', borderRadius: 999, background: '#FFFFFF', border: '2px solid #8F8D88' }}>
      <span style={{ position: 'absolute', top: 2, left: 2, width: 22, height: 22, borderRadius: 999, background: '#8F8D88' }} />
    </span>
  )
}

/** A toggle row. `onToggle` may save; the switch flips straight away. */
export function ToggleRow({
  title,
  detail,
  initial,
  divider,
  onToggle,
}: {
  title: string
  detail?: string
  initial: boolean
  divider?: boolean
  onToggle?: (on: boolean) => void | Promise<void>
}) {
  const [on, setOn] = useState(initial)
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => {
        const next = !on
        setOn(next)
        void onToggle?.(next)
      }}
      style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 56, padding: '6px 0', border: 'none', borderTop: divider ? '1px solid #F0EEE8' : 'none', background: 'transparent', color: colors.ink, textAlign: 'left' }}
    >
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 16, fontWeight: 500 }}>{title}</span>
        {detail ? <span style={{ fontSize: 13, lineHeight: 1.35, color: colors.body }}>{detail}</span> : null}
      </span>
      <Switch on={on} />
    </button>
  )
}

