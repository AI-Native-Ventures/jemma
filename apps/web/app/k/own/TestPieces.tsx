'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { PendingButton } from '@/components/ui/Button'
import { IconLabel } from '@/components/ui/IconLabel'
import { useRefreshPoll } from '@/lib/use-refresh-poll'
import { retryOwnTest } from './actions'

/** While Jemma works on something of the learner's: the screen looks again 3 seconds after the last answer came back (the way the practice card does). */
export function Poll({ active }: { active: boolean }) {
  useRefreshPoll(3000, active)
  return null
}

const bigButton =
  'flex min-h-[68px] w-full cursor-pointer items-center justify-center gap-3 rounded-20 border-0 bg-gold px-5 py-3 text-center text-[20px] font-bold text-balance text-ink sm:text-[22px] disabled:opacity-60'

/** "Take the photos again" on a test Jemma could not read: the same photos are read again. A refusal is said in plain words under the button. */
export function RetryTest({ paperId }: { paperId: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  return (
    <>
      <PendingButton
        type="button"
        pending={pending}
        onClick={() =>
          start(async () => {
            const res = await retryOwnTest(paperId)
            setError(res.ok ? null : res.message)
            router.refresh()
          })
        }
        className={bigButton}
      >
        <IconLabel
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 12a8 8 0 1 1-2.34-5.66" />
              <path d="M20 4v4.5h-4.5" />
            </svg>
          }
        >
          Take the photos again
        </IconLabel>
      </PendingButton>
      {error ? <p role="alert" className="m-0 text-center text-[14px] text-red-text">{error}</p> : null}
    </>
  )
}
