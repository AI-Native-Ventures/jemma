import Link from 'next/link'
import { PendingButton } from '@/components/ui/Button'
import type { LevelCheckSummary } from '@/lib/data/level'

// P163: the level check on the parent's page of a child. Not done: one button hands the phone to the child for it. Done: the one-line answer, and a
// link to what the check found. Words name the child and never say he or she.

export type { LevelCheckSummary }

export function LevelCheckCard({ childId, name, summary, start }: { childId: string; name: string; summary: LevelCheckSummary; start: () => Promise<void> }) {
  if (summary.state === 'done') {
    return (
      <Link
        href={`/p/${childId}/level`}
        className="flex items-center gap-3.5 rounded-20 border border-line bg-card py-4 pr-3 pl-4 text-ink no-underline"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-1 leading-[1.35]">
          <span className="text-[14px] font-semibold text-body">Level check &middot; {summary.dateText}</span>
          <span className="text-[17px] font-semibold text-pretty">{summary.headline}</span>
        </span>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#161616" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-none">
          <path d="m9 6 6 6-6 6" />
        </svg>
      </Link>
    )
  }
  return (
    <section aria-labelledby="level-check" className="flex flex-col gap-3 rounded-20 border border-line bg-card p-4 leading-[normal]">
      <div className="flex flex-col gap-1">
        <h2 id="level-check" className="m-0 text-[17px] font-semibold">
          Find {name}&apos;s level
        </h2>
        <p className="m-0 text-[14px] leading-[1.45] text-body">
          {summary.state === 'started'
            ? `${name} has done ${summary.answered} of ${summary.of} questions. The rest take a few minutes.`
            : '12 questions, about 10 minutes. Jemma finds where to start, so the first lessons are about the right things.'}
        </p>
      </div>
      <form action={start} className="contents">
        <PendingButton
          type="submit"
          className="flex min-h-14 w-full cursor-pointer items-center justify-center rounded-14 border-0 bg-gold px-5 py-3 text-center text-[17px] font-bold text-balance text-ink disabled:opacity-60"
        >
          Hand the phone to {name}
        </PendingButton>
      </form>
    </section>
  )
}
