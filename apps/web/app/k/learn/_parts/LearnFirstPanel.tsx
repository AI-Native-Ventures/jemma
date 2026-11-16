import Link from 'next/link'
import { entryButton, nextEntry, type LibraryEntry } from '@/lib/teaching'

const startLink =
  'flex min-h-[60px] w-full items-center justify-center rounded-18 bg-ink px-5 py-3 text-center text-[19px] font-bold text-balance text-white no-underline'
const skipButton =
  'flex min-h-[56px] w-full cursor-pointer items-center justify-center rounded-18 border-[1.5px] border-ink bg-card px-5 py-3 text-center text-[17px] font-semibold text-balance text-ink'

/**
 * The Learn step of a practice, for a topic that has lessons in the teaching library (P142): "Learn it first". The lessons in order with a tick for each one
 * done, one button to start (or go on with) the first one that is not finished, and "I know this, go to practice" for a learner who wants the questions now.
 * A lesson opens from here with the practice in the address (`?session=`), so the way back to this practice is on its screens. Drawn in place of the cards, the
 * diagram or the audio memo the practice's own lesson has; the questions after it are the same.
 */
export function LearnFirstPanel({ library, topicId, sessionId, topic, onSkip }: { library: LibraryEntry[]; topicId: string; sessionId: string; topic: string; onSkip: () => void }) {
  const go = nextEntry(library)
  const href = (position: number) => `/k/learn/${topicId}/${position}?session=${sessionId}`
  return (
    <main className="mx-auto flex w-full max-w-[560px] flex-1 flex-col gap-4 px-5 pt-[18px] pb-[26px]">
      <p className="m-0 text-[15px] font-semibold text-body">Learn</p>
      <div className="flex flex-col gap-1.5">
        <h1 className="m-0 text-[28px] leading-[1.15] font-bold tracking-[-0.015em]">Learn it first</h1>
        <p className="m-0 text-[17px] font-semibold">{topic}</p>
        <p className="m-0 text-[16px] leading-[1.45] text-body">Short lessons with worked examples. Each one ends with a few questions.</p>
      </div>
      {go ? (
        <Link href={href(go.position)} className={startLink}>
          {entryButton(go)}
        </Link>
      ) : null}
      <ol aria-label="Lessons" className="m-0 flex list-none flex-col rounded-20 border border-line bg-card px-4 py-1 p-0">
        {library.map((e) => (
          <li key={e.id} className="border-t border-soft first:border-t-0">
            <Link href={href(e.position)} className="flex min-h-[64px] items-center gap-3 py-3 text-ink no-underline">
              <span aria-hidden="true" className={`flex size-9 flex-none items-center justify-center rounded-pill text-[16px] font-bold ${e.done ? 'bg-ink text-white' : 'border-2 border-edge text-ink'}`}>
                {e.done ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                ) : (
                  e.position
                )}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[17px] leading-[1.3] font-semibold text-pretty">{e.title}</span>
                <span className="text-[14px] leading-[1.35] text-body">
                  {e.minutes} min{e.done ? ' · Done' : e.started ? ' · Started' : ''}
                </span>
              </span>
              <span aria-hidden="true" className="flex-none text-[22px] text-muted">&rsaquo;</span>
            </Link>
          </li>
        ))}
      </ol>
      <div className="flex-1" />
      <button type="button" onClick={onSkip} className={skipButton}>
        I know this, go to practice
      </button>
    </main>
  )
}
