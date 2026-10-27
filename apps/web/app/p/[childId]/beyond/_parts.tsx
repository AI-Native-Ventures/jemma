'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Button, Sheet } from '@/components/ui'

/** Board inline styles, copied as written: "a:b;c:d" to a React style object. */
export function css(text: string): CSSProperties {
  const out: Record<string, string> = {}
  for (const decl of text.split(';')) {
    const i = decl.indexOf(':')
    if (i < 0) continue
    const key = decl.slice(0, i).trim().replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
    out[key] = decl.slice(i + 1).trim()
  }
  return out as CSSProperties
}

const STROKE = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round' } as const

type IconName = 'back' | 'chevron' | 'paper' | 'camera' | 'bulb' | 'calendar' | 'note' | 'sport' | 'music' | 'book' | 'test' | 'plus' | 'chat' | 'eye' | 'down' | 'share' | 'star' | 'club'

const PATHS: Record<IconName, ReactNode> = {
  back: <path d="m15 6-6 6 6 6" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  paper: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.4-2h5l1.4 2h1.6A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" />
      <circle cx="12" cy="12.5" r="3.5" />
    </>
  ),
  bulb: (
    <>
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1.1 1.3 1.1 2.2h5c0-.9.5-1.7 1.1-2.2A6 6 0 0 0 12 3z" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16" />
    </>
  ),
  note: (
    <>
      <path d="M5 4.5h10l4 4V19.5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-14a1 1 0 0 1 1-1z" />
      <path d="M14.5 4.5V9h4.5" />
      <path d="M8 13h8M8 16.5h5" />
    </>
  ),
  sport: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5c-2.5 2.6-3.6 5.4-3.6 8.5s1.1 5.9 3.6 8.5M12 3.5c2.5 2.6 3.6 5.4 3.6 8.5s-1.1 5.9-3.6 8.5M3.5 12h17" />
    </>
  ),
  music: (
    <>
      <path d="M9 18V5.5l10-2V16" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="16.5" cy="16" r="2.5" />
    </>
  ),
  book: (
    <>
      <path d="M4 5.5C4 4.7 4.7 4 5.5 4H10c1.1 0 2 .9 2 2v14c0-1.1-.9-2-2-2H4z" />
      <path d="M20 5.5c0-.8-.7-1.5-1.5-1.5H14c-1.1 0-2 .9-2 2v14c0-1.1.9-2 2-2h6z" />
    </>
  ),
  test: (
    <>
      <rect x="5" y="3.5" width="14" height="17" rx="2" />
      <path d="M8.5 8h7M8.5 11.5h7M8.5 15h4" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  chat: <path d="M4 5.5h16v10H9l-5 4z" />,
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  down: (
    <>
      <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5" />
      <path d="M5 19.5h14" />
    </>
  ),
  share: (
    <>
      <path d="M12 15V3.5M7.5 8 12 3.5 16.5 8" />
      <path d="M5 12.5v6a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-6" />
    </>
  ),
  star: <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19.6l1-5.8L3.5 9.7l5.9-.9z" />,
  club: (
    <>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" />
    </>
  ),
}

export function Icon({ name, size = 18, width = 1.9, color }: { name: IconName; size?: number; width?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth={width} {...STROKE} stroke={color ?? 'currentColor'} aria-hidden="true">
      {PATHS[name]}
    </svg>
  )
}

export function Diamond({ size, style }: { size: number; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" style={style}>
      <polygon points="8,0.5 15.5,8 8,15.5 0.5,8" fill="#FF6A4D" />
    </svg>
  )
}

export function Chevron() {
  return (
    <span style={css('flex:none;display:flex')}>
      <Icon name="chevron" size={20} width={2} color="#1F1D36" />
    </span>
  )
}

/**
 * Back header of the pushed screens (report, beyond, add activity). The space layout draws its own phone
 * header and tab bar around every child page; the boards for these screens have neither, so on the phone they are hidden here.
 */
export function SubHeader({ back, eyebrow, title, backLabel }: { back: string; eyebrow: string; title: string; backLabel: string }) {
  return (
    <>
      <style>{`@media (max-width: 1023px){body header:not([data-sub]),body nav.sticky{display:none !important}}`}</style>
      <header data-sub="" style={css('display:flex;align-items:center;gap:4px;padding:10px 12px 6px 8px')}>
        <Link href={back} aria-label={backLabel} style={css('width:44px;height:44px;flex:none;display:flex;align-items:center;justify-content:center;border-radius:12px;color:#1F1D36')}>
          <Icon name="back" size={24} width={2} />
        </Link>
        <span style={css('display:flex;flex-direction:column;line-height:1.2;flex:1;min-width:0;color:#1F1D36')}>
          <span style={css('font-size:13px;color:#5D5A73')}>{eyebrow}</span>
          <span style={css('font-size:17px;font-weight:700')}>{title}</span>
        </span>
      </header>
    </>
  )
}

/** A control the boards draw for an after-the-challenge feature: it opens "Coming after the challenge". */
export function ComingButton({ style, children }: { style: CSSProperties; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} style={style}>
        {children}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Coming after the challenge" description="This part of Jemma is not in this version yet.">
        <Button variant="primary" onClick={() => setOpen(false)}>
          Got it
        </Button>
      </Sheet>
    </>
  )
}
