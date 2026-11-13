'use client'

import { PendingButton } from '@/components/ui/Button'
import type { PracticeState } from '@/lib/data/p27'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { retryPractice, startPractice, type ActionResult } from './actions'

const card = 'flex flex-col rounded-[26px] border border-line bg-card p-5 shadow-[0_8px_24px_rgba(31,29,54,0.06)]'
const bigButton = 'flex h-[68px] w-full cursor-pointer items-center justify-center gap-3 rounded-20 border-0 bg-coral text-[24px] font-bold text-ink disabled:opacity-60'

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
 * a button to practise now, the writing state (the screen asks again every 3 seconds, the way the teacher's key screen does), the failed
 * state with a retry, or one plain line when there is nothing to practise yet.
 */
export function PracticeCard({ state }: { state: PracticeState }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  useEffect(() => {
    if (state !== 'writing') return
    const id = setInterval(() => router.refresh(), 3000)
    return () => clearInterval(id)
  }, [state, router])

  const run = (action: () => Promise<ActionResult>) =>
    start(async () => {
      const res = await action()
      setError(res.ok ? null : res.message)
      router.refresh()
    })

  if (state === 'none') {
    return <p className="m-0 px-1 text-[16px] leading-[1.45] text-body">Practice starts after your teacher marks a test.</p>
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

  const failed = state === 'failed'
  return (
    <section role={failed ? 'alert' : undefined} aria-label={failed ? undefined : 'Practise now'} aria-labelledby={failed ? 'practice-card' : undefined} className={`${card} gap-4`}>
      {failed ? (
        <h2 id="practice-card" className="m-0 text-[24px] leading-[1.2] font-bold tracking-[-0.01em] text-pretty">Jemma could not write your practice.</h2>
      ) : null}
      <PendingButton type="button" pending={pending} onClick={() => run(failed ? retryPractice : startPractice)} className={bigButton}>
        {failed ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 12a8 8 0 1 1-2.34-5.66" /><path d="M20 4v4.5h-4.5" />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="#1F1D36" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" /></svg>
        )}
        {failed ? 'Try again' : 'Practise now'}
      </PendingButton>
      {failed ? null : <p className="m-0 text-center text-[16px] leading-[1.45] text-body">Jemma writes a short practice for you. It takes a minute or two.</p>}
      {error ? <p role="alert" className="m-0 text-center text-[14px] text-coral-text">{error}</p> : null}
    </section>
  )
}
