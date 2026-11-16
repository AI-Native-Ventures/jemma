import Link from 'next/link'
import { practiceResultsHref } from '@/lib/handback'
import type { PracticeRow } from '@/lib/past-practice'
import { ChevronRight } from './session/_parts/Chips'

/**
 * "Your practice" on My maths (P120): the learner's finished practices, newest first, each with its topic, its day and its count ("4 of 5 right"), each
 * opening that practice's answers to read again. Nothing shows until there is a finished practice. The rows come from the page (`getPastPractice`).
 */
export function PastPractice({ rows }: { rows: PracticeRow[] }) {
  if (rows.length === 0) return null
  return (
    <section aria-labelledby="past-practice" className="flex flex-col gap-2.5">
      <h2 id="past-practice" className="m-0 text-[17px] font-bold">Your practice</h2>
      <ul className="m-0 flex list-none flex-col rounded-20 border border-line bg-card px-4 py-1 p-0">
        {rows.map((r) => (
          <li key={r.sessionId} className="border-t border-soft first:border-t-0">
            <Link href={practiceResultsHref(r.sessionId)} className="flex min-h-[64px] items-center gap-3 py-3 text-ink no-underline">
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[17px] leading-[1.3] font-semibold">{r.topic}</span>
                <span className="text-[14px] text-body">{[r.day, r.score].filter(Boolean).join(' · ')}</span>
              </span>
              <ChevronRight />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
