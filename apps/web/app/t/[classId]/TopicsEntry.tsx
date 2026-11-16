import Link from 'next/link'
import { ChevronRightIcon } from '@/components/ui/icons'

/**
 * The way into the Topics screens (P139) from the class page: one card, drawn the same on the phone and the laptop. It sits above the class page's own
 * content with the page's side space, so the page itself needs only one line.
 */
export function TopicsEntry({ base, narrow = false }: { base: string; narrow?: boolean }) {
  return (
    <div className={narrow ? 'px-5 pt-3.5' : 'px-5 pt-3.5 lg:mx-auto lg:max-w-[1120px] lg:px-9 lg:pt-8'}>
      <Link
        href={`${base}/topics`}
        className="flex items-center gap-3.5 rounded-18 border border-line bg-card py-3.5 pr-3 pl-4 text-ink no-underline"
      >
        <span aria-hidden="true" className="flex size-11 flex-none items-center justify-center rounded-14 bg-soft-4">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1F1D36" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="13" width="4" height="7" rx="1" />
            <rect x="10" y="8" width="4" height="12" rx="1" />
            <rect x="16" y="4" width="4" height="16" rx="1" />
          </svg>
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[17px] font-semibold">Topics</span>
          <span className="text-[14px] leading-[1.35] text-body">How the class is doing by topic, down to each learner</span>
        </span>
        <ChevronRightIcon className="flex-none" />
      </Link>
    </div>
  )
}
