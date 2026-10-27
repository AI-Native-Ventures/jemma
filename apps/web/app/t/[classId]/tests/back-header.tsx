import Link from 'next/link'
import type { ReactNode } from 'react'

/**
 * Back header of the test, question and notifications boards. The class layout's own header
 * (class switcher, bell, gear) belongs to tab roots, so this hides it while a back header is on the page.
 */
export function BackHeader({
  href,
  backLabel,
  eyebrow,
  title,
  right,
}: {
  href: string
  backLabel: string
  eyebrow: string
  title: string
  right?: ReactNode
}) {
  return (
    <>
      <style>{'div:has(> main [data-back-header]) > header:not([data-back-header]){display:none}'}</style>
      <header data-back-header className={`flex items-center gap-1 pt-2.5 pb-1.5 pl-2 leading-[normal] ${right ? 'pr-3' : 'pr-4'}`}>
        <Link
          href={href}
          aria-label={backLabel}
          className="flex size-11 flex-none items-center justify-center rounded-12 text-ink"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 6-6 6 6 6" />
          </svg>
        </Link>
        <span className="flex min-w-0 flex-1 flex-col leading-[1.2] text-ink">
          <span className="text-[13px] text-body">{eyebrow}</span>
          <span className="text-[17px] font-bold">{title}</span>
        </span>
        {right}
      </header>
    </>
  )
}

/** The coral diamond that opens a sentence, 12 px, as on the test and question boards. */
export function Lead({ children }: { children: ReactNode }) {
  return (
    <p className="m-0 flex gap-2.5 text-[17px] leading-[1.45]">
      <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true" className="mt-[7px] flex-none">
        <polygon points="8,0.5 15.5,8 8,15.5 0.5,8" fill="#FF6A4D" />
      </svg>
      <span>{children}</span>
    </p>
  )
}
