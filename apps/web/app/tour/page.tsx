import type { Metadata } from 'next'
import Link from 'next/link'
import { ProgressLegend } from '../k/maths/ProgressDots'
import { ChevronRight } from '../k/session/_parts/Chips'
import { Diamond } from '../k/session/_parts/Gems'
import { TOUR_GRADE, TOUR_PARTS, TOUR_SUBJECT } from './data/topics'
import { PartProgress } from './Progress'
import { LEARNER_WIDTH, TourHeader } from './TourHeader'

export const metadata: Metadata = { title: 'My maths' }

const list = 'm-0 flex list-none flex-col rounded-20 border border-line bg-card px-4 py-1 p-0'

/**
 * The learner's first page: every part of Grade 11 Mathematics, drawn as "My maths" draws a senior map (a row for each part, a circle for each topic of
 * it). Nothing has been tried yet, so every circle is dashed, until the lesson has been done in this tab: then Equations and inequalities has its
 * circle and Algebra says one topic is started. Algebra is the part the tour goes into.
 */
export default function TourHome() {
  return (
    <>
      <TourHeader view="learner" className={LEARNER_WIDTH} />
      <main className={`mx-auto flex w-full flex-1 flex-col gap-5 px-5 pt-[18px] pb-[22px] ${LEARNER_WIDTH}`}>
        <div className="flex flex-col gap-2">
          <div className="flex items-start gap-2.5">
            <Diamond size={16} className="mt-3 flex-none" />
            <h1 className="m-0 text-[30px] leading-[1.14] font-bold tracking-[-0.02em] text-pretty">My maths</h1>
          </div>
          <p className="m-0 pl-[26px] text-[17px] leading-[1.4] text-body">Grade {TOUR_GRADE} {TOUR_SUBJECT}. Pick a part to practise.</p>
        </div>

        <section aria-labelledby="all" className="flex flex-col gap-2.5">
          <h2 id="all" className="m-0 text-[17px] font-bold">All of {TOUR_SUBJECT}</h2>
          <ProgressLegend />
          <ul className={list}>
            {TOUR_PARTS.map((part) => (
              <li key={part.slug} className="border-t border-soft first:border-t-0">
                <Link href={`/tour/${part.slug}`} className="flex min-h-[64px] items-center gap-3 py-3 text-ink no-underline">
                  <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span className="text-[17px] leading-[1.3] font-semibold">{part.label}</span>
                    <PartProgress part={part} />
                  </span>
                  <ChevronRight />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </>
  )
}
