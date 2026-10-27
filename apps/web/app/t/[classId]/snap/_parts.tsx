import type { ReactNode } from 'react'

export function Diamond({ size = 14, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" className={`flex-none ${className}`}>
      <polygon points="8,0.5 15.5,8 8,15.5 0.5,8" fill="#FF6A4D" />
    </svg>
  )
}

/** Page title: coral diamond then the sentence. Sizes differ a little board to board. */
export function PageTitle({ children, size = 26, leading = 1.18, tracking = '-0.015em' }: { children: ReactNode; size?: number; leading?: number; tracking?: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <Diamond className="mt-2.5" />
      <h1 className="m-0 font-semibold text-pretty" style={{ fontSize: size, lineHeight: leading, letterSpacing: tracking }}>
        {children}
      </h1>
    </div>
  )
}

/** Stacked fraction as the key boards draw it: 16 px bold, 2 px bar. `3 3/4` puts the whole number first at 20 px. */
export function KeyFraction({ value }: { value: string }) {
  const m = /^\s*(?:(\d+)\s+)?(\d+)\/(\d+)\s*$/.exec(value)
  if (!m) return <span className="text-[18px] font-bold">{value}</span>
  const stack = (
    <span className="inline-flex flex-col items-center text-[16px] leading-none font-bold">
      <span className="px-[3px] pb-0.5">{m[2]}</span>
      <span className="border-t-2 border-ink px-[3px] pt-0.5">{m[3]}</span>
    </span>
  )
  if (!m[1]) return <span role="img" aria-label={value}>{stack}</span>
  return (
    <span role="img" aria-label={value} className="inline-flex items-center gap-[3px] text-[16px] font-bold">
      <span className="text-[20px]">{m[1]}</span>
      {stack}
    </span>
  )
}

export const RETAKE_PATH = 'M20 12a8 8 0 1 1-2.34-5.66'

/** Same threshold as `READ_MIN` in lib/data/p31 (client code must not import that server module). */
export const SURE = 0.8

const HIDE = '@media (max-width:1023px){body:has([data-flow]) header.lg\\:hidden,body:has([data-flow]) nav.lg\\:hidden{display:none}}'

/**
 * Flow screens (snap key to review) have their own header with Back or Close and no tab bar on the phone,
 * so the layout's class header and tab bar are hidden while one is on screen.
 */
export function Flow({
  href,
  label,
  close = false,
  title,
  subtitle,
  subtitleFirst = false,
  right,
  hideAtLaptop = false,
  children,
}: {
  href: string
  label: string
  close?: boolean
  title: string
  subtitle: string
  subtitleFirst?: boolean
  right?: string
  /** The laptop board draws its own breadcrumb instead of this header. */
  hideAtLaptop?: boolean
  children: ReactNode
}) {
  const titleCls = subtitleFirst ? 'text-[17px] font-bold' : 'text-[18px] font-bold'
  const sub = <span className="text-[13px] text-body">{subtitle}</span>
  const main = <span className={titleCls}>{title}</span>
  return (
    <div data-flow className="leading-[normal]">
      <style>{HIDE}</style>
      <header className={`flex items-center gap-1 pt-2.5 pb-1.5 pl-2 ${right || !subtitleFirst ? 'pr-4' : 'pr-3'} ${hideAtLaptop ? 'lg:hidden' : ''}`}>
        <a href={href} aria-label={label} className="flex size-11 flex-none items-center justify-center rounded-12 text-ink">
          {close ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>
          )}
        </a>
        <span className="flex min-w-0 flex-1 flex-col leading-[1.2]">
          {subtitleFirst ? sub : main}
          {subtitleFirst ? main : sub}
        </span>
        {right ? <span className="text-[13px] font-semibold text-body">{right}</span> : null}
      </header>
      {children}
    </div>
  )
}
