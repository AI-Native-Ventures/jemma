import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import { GemIcon } from '@/components/ui'
import { ChevronRightIcon, CloseIcon } from '@/components/ui/icons'

/**
 * Hides the class layout's phone header and tab bar for screens whose board has its own back header and no tab bar
 * (settings, link request, year end). The layout is shared, so this only reaches it with CSS.
 */
export function BareChrome() {
  return (
    <style>{`div:has(> main .p21-bare) > header, div:has(> main .p21-bare) > nav { display: none; }`}</style>
  )
}

/** Page column: full width on the phone, a 560 px column on the laptop. */
export function Column({ children, bare, className = '' }: { children: ReactNode; bare?: boolean; className?: string }) {
  return (
    <div className={`${bare ? 'p21-bare ' : ''}mx-auto flex w-full max-w-[560px] flex-col bg-ground leading-[normal] text-ink ${className}`}>
      {bare ? <BareChrome /> : null}
      {children}
    </div>
  )
}

/** Header of the pushed screens: back arrow (or close), a small line and the screen name. */
export function BackHeader({ href, label, sub, title, close }: { href: string; label: string; sub?: string; title: string; close?: boolean }) {
  return (
    <header className="flex items-center gap-1 pt-2.5 pr-3 pb-1.5 pl-2">
      <Link href={href} aria-label={label} className="flex size-11 flex-none items-center justify-center rounded-12 text-ink">
        {close ? (
          <CloseIcon size={22} />
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 6-6 6 6 6" />
          </svg>
        )}
      </Link>
      <span className="flex min-w-0 flex-1 flex-col leading-[1.2] text-ink">
        {sub ? <span className="text-[13px] text-body">{sub}</span> : null}
        <span className="text-[17px] font-bold">{title}</span>
      </span>
    </header>
  )
}

/** The page's h1 with the coral gem, at the size each board uses. */
export function Title({ children, size = 26, tracking = '-0.015em', gemTop = 10, gem = 14 }: { children: ReactNode; size?: number; tracking?: string; gemTop?: number; gem?: number }) {
  return (
    <div className="flex items-start gap-2.5">
      <GemIcon size={gem} className="flex-none" style={{ marginTop: gemTop }} />
      <h1 className="m-0 font-semibold text-pretty" style={{ fontSize: size, lineHeight: 1.18, letterSpacing: tracking }}>
        {children}
      </h1>
    </div>
  )
}

/** White card with the title row used by the settings and setup boards. */
export function Section({ id, title, children, gap = 14, className = '', style }: { id: string; title: string; children: ReactNode; gap?: number; className?: string; style?: CSSProperties }) {
  return (
    <section aria-labelledby={id} className={`flex flex-col rounded-20 border border-line bg-card p-4 ${className}`} style={{ gap, ...style }}>
      <h2 id={id} className="m-0 text-[17px] font-semibold">
        {title}
      </h2>
      {children}
    </section>
  )
}

export const Chevron = () => <ChevronRightIcon className="flex-none" />
