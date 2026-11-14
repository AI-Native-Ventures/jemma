'use client'

import { scoreText, type MyMathsSuggestion } from '@jemma/profiling/logic'
import { PendingButton } from '@/components/ui/Button'
import type { PracticeState } from '@/lib/data/p27'
import { useRefreshPoll } from '@/lib/use-refresh-poll'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { retryPractice, type ActionResult } from './actions'
import { PractiseButton } from './Practise'

const card = 'flex flex-col rounded-[26px] border border-line bg-card p-5 shadow-[0_8px_24px_rgba(31,29,54,0.06)]'
const bigButton = 'flex h-[68px] w-full cursor-pointer items-center justify-center gap-3 rounded-20 border-0 bg-coral text-[24px] font-bold text-ink disabled:opacity-60'
const chooseLink = 'flex min-h-11 items-center justify-center text-[16px] font-semibold text-ink underline underline-offset-[3px]'

/** The same coral ring the lesson-loading screen turns while Jemma works. */
function Ring() {
  return (
    <svg aria-hidden="true" width="44" height="44" viewBox="0 0 28 28" className="motion-safe:animate-spin">
      <circle cx="14" cy="14" r="11" fill="none" stroke="#EEEDF5" strokeWidth="3.5" />
      <path d="M14 3a11 11 0 0 1 11 11" fill="none" stroke="#FF6A4D" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  )
}

/**
 * What the learner's home offers when there is no session to start (the state is worked out on the server, see `practiceState`):
 * the first thing "My maths" suggests, with a Practise button and a link to choose something else; the writing state (the screen asks again
 * 3 seconds after the last answer came back, the way the teacher's key screen does); the failed state with a retry; or one plain line when
 * there is nothing to practise yet, with a link to "My maths".
 */
export function PracticeCard({ state, suggestion }: { state: PracticeState; suggestion: MyMathsSuggestion | null }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  // While Jemma writes: look again 3 seconds after the last answer came back, never while the last look is still waiting.
  useRefreshPoll(3000, state === 'writing')

  const run = (action: () => Promise<ActionResult>) =>
    start(async () => {
      const res = await action()
      setError(res.ok ? null : res.message)
      router.refresh()
    })

  if (state === 'none' || (state === 'ready' && !suggestion)) {
    return (
      <>
        <p className="m-0 px-1 text-[16px] leading-[1.45] text-body">Practice starts after your teacher marks a test.</p>
        <Link href="/k/maths" className={chooseLink}>See my maths</Link>
      </>
    )
  }

  if (state === 'writing') {
    return (
      <section role="status" aria-live="polite" aria-labelledby="practice-writing" className={`${card} items-center gap-3.5 text-center`}>
        <Ring />
        <h2 id="practice-writing" className="m-0 text-[24px] leading-[1.2] font-bold tracking-[-0.01em] text-pretty">Jemma is writing your practice.</h2>
        <p className="m-0 text-[17px] leading-[1.45] text-body">A minute or two. You can wait here.</p>
      </section>
    )
  }

  if (state === 'ready' && suggestion) {
    return (
      <>
        <section aria-labelledby="practice-suggested" className={`${card} gap-3.5`}>
          <span id="practice-suggested" className="text-[14px] font-semibold text-coral-text">Suggested for you</span>
          <h2 className="m-0 text-[25px] leading-[1.2] font-bold tracking-[-0.01em] text-pretty">{suggestion.topicName}</h2>
          <p className="m-0 text-[16px] leading-[1.45] text-body">{suggestion.reason} &middot; {scoreText(suggestion.score)}</p>
          <PractiseButton choice={{ topicId: suggestion.topicId, topicName: suggestion.topicName }} size="big" />
        </section>
        <Link href="/k/maths" className={chooseLink}>Choose something else</Link>
      </>
    )
  }

  // failed
  return (
    <section role="alert" aria-labelledby="practice-card" className={`${card} gap-4`}>
      <h2 id="practice-card" className="m-0 text-[24px] leading-[1.2] font-bold tracking-[-0.01em] text-pretty">Jemma could not write your practice.</h2>
      <PendingButton type="button" pending={pending} onClick={() => run(retryPractice)} className={bigButton}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 12a8 8 0 1 1-2.34-5.66" /><path d="M20 4v4.5h-4.5" />
        </svg>
        Try again
      </PendingButton>
      {error ? <p role="alert" className="m-0 text-center text-[14px] text-coral-text">{error}</p> : null}
    </section>
  )
}
