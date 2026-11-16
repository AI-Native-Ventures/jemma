import Link from 'next/link'
import type { ReactNode } from 'react'
import { levelOfScore, levelWords } from '../../k/maths/format'
import { ProgressDot } from '../../k/maths/ProgressDots'
import { ChevronRight } from '../../k/session/_parts/Chips'
import type { TourAverage } from '../data/class'

export const list = 'm-0 flex list-none flex-col rounded-20 border border-line bg-card px-4 py-1 p-0'

/** The circle of a class average, drawn like the learner's circles and the teacher's Long view: 80 or more, 50 to 79, below 50, not taught yet. */
export const classLevel = (avg: number | null) => levelOfScore(avg === null ? { right: 0, asked: 0 } : { right: avg, asked: 100 })

/** The bar of a class average: ink from 50 up, coral below it. */
export function AverageBar({ avg }: { avg: number }) {
  return (
    <span aria-hidden="true" className="block h-2 w-full rounded-pill bg-soft-3">
      <span className={`block h-full rounded-pill ${avg < 50 ? 'bg-coral' : 'bg-ink'}`} style={{ width: `${Math.max(2, Math.min(100, avg))}%` }} />
    </span>
  )
}

/** "4 learners need help", or nothing. */
export const helpLine = (help: number): string | null => (help > 0 ? `${help} ${help === 1 ? 'learner needs' : 'learners need'} help` : null)

/** One row of a list of parts or topics: the circle of the class average, the name, the bar and how many learners need help. A link when `href` is given. */
export function ClassRow({ label, note, stat, href }: { label: string; note?: string; stat: TourAverage; href?: string }) {
  const help = helpLine(stat.help)
  const body: ReactNode = (
    <>
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="flex items-center gap-2.5">
          <ProgressDot level={classLevel(stat.avg)} label={levelWords(classLevel(stat.avg))} />
          <span className="min-w-0 text-[17px] leading-[1.3] font-semibold">{label}</span>
        </span>
        {stat.avg !== null ? <AverageBar avg={stat.avg} /> : null}
        <span className="flex flex-wrap gap-x-2 text-[14px] text-body">
          <span>{stat.avg === null ? 'Not taught yet' : `Class average ${stat.avg}%`}</span>
          {note ? <span>{note}</span> : null}
          {help ? <span className="font-semibold text-coral-text">{help}</span> : null}
        </span>
      </span>
      {href ? <ChevronRight /> : null}
    </>
  )
  return (
    <li className="border-t border-soft first:border-t-0">
      {href ? (
        <Link href={href} className="flex min-h-[72px] items-center gap-3 py-3 text-ink no-underline">
          {body}
        </Link>
      ) : (
        <div className="flex min-h-[72px] items-center gap-3 py-3 text-ink">{body}</div>
      )}
    </li>
  )
}

/** The way back to the list above, as the learner's part page has it. */
export function Back({ href, children }: { href: string; children: string }) {
  return (
    <Link href={href} className="flex min-h-11 items-center text-[16px] font-semibold text-ink no-underline">
      <span aria-hidden="true" className="mr-1.5">&lsaquo;</span>
      {children}
    </Link>
  )
}
