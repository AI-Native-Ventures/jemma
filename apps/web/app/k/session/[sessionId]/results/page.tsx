import type { Metadata } from 'next'
import Link from 'next/link'
import { getPastResult } from '@/lib/data/p120'
import { Results } from '../../_parts/Results'

export const metadata: Metadata = { title: 'Your answers' }
export const dynamic = 'force-dynamic'

const back = 'flex min-h-[60px] w-full cursor-pointer items-center justify-center rounded-18 border-0 bg-ink px-5 py-3 text-center text-[19px] leading-[1.25] font-bold text-balance text-white no-underline'

/**
 * A finished practice, read again (P120): the same results screen as straight after the practice, read-only, for a learner to come back to. It is the
 * learner's own practice only (`getPastResult` reads it as the learner and answers "not found" for anyone else's, or for one that is not finished).
 * `?from=done` (the link on the hand-back screen) sends "Back" to the hand-back screen, any other way in to My maths.
 */
export default async function PastResultsPage({ params, searchParams }: { params: Promise<{ sessionId: string }>; searchParams?: Promise<{ from?: string | string[] }> }) {
  const { sessionId } = await params
  const from = (await searchParams)?.from
  const r = await getPastResult(sessionId)
  const note = [r.day, r.score].filter(Boolean).join(' · ')
  return (
    <div className="fixed inset-0 z-40 flex flex-col overflow-y-auto bg-ground font-sans leading-[normal] lg:static lg:z-auto lg:min-h-dvh lg:overflow-visible">
      <div className="mx-auto flex w-full flex-1 flex-col lg:max-w-[560px]">
        {r.hasAnswers ? (
          <Results firstName={r.firstName} missed={r.missed} heading={r.topic} note={note} />
        ) : (
          <main className="flex flex-1 flex-col gap-3 px-5 pt-5 pb-[26px]">
            <h1 className="m-0 text-[32px] leading-[1.1] font-bold tracking-[-0.02em]">{r.topic}</h1>
            {note ? <p className="m-0 text-[16px] leading-[1.45] font-semibold text-body">{note}</p> : null}
            <p className="m-0 text-[18px] leading-[1.45]">Jemma has no saved answers for this practice.</p>
            <div className="flex-1" />
          </main>
        )}
        <div className="px-5 pb-[26px]">
          <Link href={from === 'done' ? '/k/done' : '/k/maths'} className={back}>
            {from === 'done' ? 'Back' : 'Back to My maths'}
          </Link>
        </div>
      </div>
    </div>
  )
}
