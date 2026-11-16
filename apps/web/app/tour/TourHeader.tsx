import Link from 'next/link'
import { TOUR_LEARNER } from './data/topics'

export type TourView = 'learner' | 'teacher'

/** How wide the page under the bar is, so the bar lines up with it. */
export const LEARNER_WIDTH = 'max-w-[560px]'
export const TEACHER_WIDTH = 'max-w-[960px]'

const tab = 'flex min-h-11 items-center rounded-pill px-3.5 text-[15px] font-semibold no-underline'

/**
 * The bar at the top of every page of the tour except the lesson itself: the app's mark and name, and the two views side by side so the tour can be
 * switched from one to the other at any time. It never links into the signed-in app.
 */
export function TourHeader({ view, className }: { view: TourView; className: string }) {
  return (
    <header className="border-b border-line bg-card leading-[normal]">
      <div className={`mx-auto flex w-full items-center justify-between gap-3 px-5 py-2 ${className}`}>
        <Link href={view === 'learner' ? '/tour' : '/tour/teacher'} className="flex min-h-11 min-w-0 items-center gap-2.5 text-ink no-underline">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/jemma-app-icon.svg" alt="" width={34} height={34} className="block size-[34px] flex-none" />
          <span className="truncate text-[19px] font-bold">{view === 'learner' ? `${TOUR_LEARNER}'s Jemma` : 'Jemma'}</span>
        </Link>
        <nav aria-label="View" className="flex flex-none gap-1 rounded-pill bg-soft-4 p-1">
          <Link href="/tour" aria-current={view === 'learner' ? 'page' : undefined} className={`${tab} ${view === 'learner' ? 'bg-ink text-white' : 'text-ink'}`}>
            Learner
          </Link>
          <Link href="/tour/teacher" aria-current={view === 'teacher' ? 'page' : undefined} className={`${tab} ${view === 'teacher' ? 'bg-ink text-white' : 'text-ink'}`}>
            Teacher
          </Link>
        </nav>
      </div>
    </header>
  )
}
