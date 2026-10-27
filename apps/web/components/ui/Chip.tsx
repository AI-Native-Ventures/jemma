import Link from 'next/link'
import type { ReactNode } from 'react'

export type ChipProps = {
  href?: string
  icon?: ReactNode
  /** `onInk` is the translucent chip used on the dark "what to focus on" card. */
  tone?: 'soft' | 'onInk'
  className?: string
  children: ReactNode
}

/** Evidence chip: 44 px tall, radius 12, links to the paper or the photo it came from. */
export function Chip({ href, icon, tone = 'soft', className = '', children }: ChipProps) {
  const cls = `inline-flex leading-[normal] min-h-11 items-center gap-1.5 rounded-12 px-3 text-[14px] font-semibold no-underline ${
    tone === 'onInk' ? 'bg-white/12 text-white' : 'bg-soft-2 text-ink'
  } ${className}`
  const content = (
    <>
      {icon}
      {children}
    </>
  )
  return href ? (
    <Link href={href} className={cls}>
      {content}
    </Link>
  ) : (
    <span className={cls}>{content}</span>
  )
}
