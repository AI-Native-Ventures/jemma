'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { ErrorRetry } from '@/components/blocks'
import { Button } from '@/components/ui'
import { updateLongView, updateOnOpen } from './actions'

/** How often the screen looks again while an update runs. */
const POLL_MS = 4000

/**
 * The bottom of the screen: the update button, when it last ran, and what to do when it failed.
 * While an update runs the button shows the kit's pending state and the screen looks again every few seconds.
 */
export function UpdateBar({ childId, state, lastUpdated }: { childId: string; state: 'idle' | 'running' | 'failed'; lastUpdated: string | null }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [looking, look] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const running = state === 'running'

  // One look at a time: the next one is planned only after the screen has taken in the last answer.
  // (Looks that overlap would queue up behind each other, and a slow server would never get to show the result.)
  useEffect(() => {
    if (!running || looking) return
    const timer = setTimeout(() => look(() => router.refresh()), POLL_MS)
    return () => clearTimeout(timer)
  }, [running, looking, router])

  const update = () => {
    setError(null)
    start(async () => {
      const r = await updateLongView(childId)
      if (!r.ok) setError(r.reason)
      router.refresh()
    })
  }

  return (
    <section aria-label="Update the Long view" className="flex flex-col gap-3">
      {state === 'failed' ? (
        <ErrorRetry title="The update did not finish" body="Nothing was lost. What you see is from the last update that worked." onRetry={update} />
      ) : null}
      <Button variant="secondary" size="sm" pending={running || pending} disabled={running || pending} onClick={update}>
        Update the Long view
      </Button>
      {running ? <p className="m-0 text-[14px] leading-[1.4] text-body">Jemma is looking at the records again. This can take a minute or two.</p> : null}
      {error ? (
        <p role="alert" className="m-0 text-[14px] leading-[1.4] font-semibold text-coral-text">
          {error}
        </p>
      ) : null}
      <p className="m-0 text-[14px] leading-[1.4] text-body">{lastUpdated ? `Last updated ${lastUpdated}` : 'Not updated yet'}</p>
    </section>
  )
}

/**
 * Renders nothing. When the screen opens for a learner with no pattern yet, it asks for one update, once.
 * The server checks again before it sends anything.
 */
export function OpenUpdate({ childId }: { childId: string }) {
  const router = useRouter()
  const asked = useRef(false)
  useEffect(() => {
    if (asked.current) return
    asked.current = true
    updateOnOpen(childId).then((r) => {
      if (r.ok) router.refresh()
    })
  }, [childId, router])
  return null
}
