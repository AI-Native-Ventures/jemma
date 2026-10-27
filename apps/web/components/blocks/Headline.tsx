import Link from 'next/link'
import type { ReactNode } from 'react'
import { GemIcon, ReportIcon } from '../ui/icons'

export type HeadlineProps = {
  children: ReactNode
  /** `phone` 28 px (teacher, parent), `child` 31 px bold, `laptop` 36 px. */
  size?: 'phone' | 'child' | 'laptop'
  /** Evidence link under the sentence, for example "See the papers it comes from". */
  action?: { href: string; label: string }
  /** Small grey line under the sentence, for example "Updated today at 14:13". */
  note?: ReactNode
  className?: string
}

const sizes = {
  phone: { h: 'text-[28px] leading-[1.18] font-semibold tracking-[-0.015em]', gem: 14, mt: 'mt-[11px]' },
  child: { h: 'text-[31px] leading-[1.14] font-bold tracking-[-0.02em]', gem: 16, mt: 'mt-3' },
  laptop: { h: 'text-[36px] leading-[1.15] font-semibold tracking-[-0.02em]', gem: 16, mt: 'mt-3.5' },
}

/** The page's one h1: coral gem, then a sentence that says what is true now. */
export function Headline({ children, size = 'phone', action, note, className = '' }: HeadlineProps) {
  const s = sizes[size]
  const heading = (
    <div className={`flex items-start ${size === 'laptop' ? 'gap-3' : 'gap-2.5'}`}>
      <GemIcon size={s.gem} className={`flex-none ${s.mt}`} />
      <h1 className={`m-0 text-pretty ${s.h}`}>{children}</h1>
    </div>
  )
  if (!action && !note) return <div className={`leading-[normal] ${className}`}>{heading}</div>
  return (
    <div className={`flex flex-col leading-[normal] ${note ? 'gap-2' : 'gap-2.5'} ${className}`}>
      {heading}
      {note ? <p className="m-0 ml-6 text-[14px] text-body">{note}</p> : null}
      {action ? (
        <Link
          href={action.href}
          className="ml-6 inline-flex min-h-11 items-center gap-1.5 self-start text-[15px] font-semibold text-ink underline underline-offset-[3px]"
        >
          <ReportIcon size={note ? 18 : 16} strokeWidth={note ? 1.9 : 1.8} />
          {action.label}
        </Link>
      ) : null}
    </div>
  )
}
