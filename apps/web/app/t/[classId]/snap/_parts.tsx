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
