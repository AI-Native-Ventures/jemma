'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { createPollScheduler } from './poll-scheduler'

/**
 * The one way a screen asks the server for fresh data every few seconds (`router.refresh()`), while `active`.
 *
 * One ask at a time: the refresh runs inside a transition, and the next wait of `ms` starts only after that transition is no longer pending
 * (the page has taken in the answer). A slow page is never asked again while it is still answering. It stops when `active` is false or the
 * screen goes away. The timing rules are in `createPollScheduler`.
 */
export function useRefreshPoll(ms: number, active = true): void {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  // The scheduler lives as long as the screen, so an ask that is under way is remembered when `active` flips off and on again.
  const latest = useRef({ ms, router, startTransition })
  const busy = useRef(false)
  useEffect(() => {
    latest.current = { ms, router, startTransition }
  })
  const [scheduler] = useState(() =>
    createPollScheduler({
      wait: () => latest.current.ms,
      refresh: () => latest.current.startTransition(() => latest.current.router.refresh()),
      isBusy: () => busy.current,
    }),
  )

  useEffect(() => {
    if (!active) return
    scheduler.start()
    return () => scheduler.stop()
  }, [active, scheduler])

  // The ask is over when the transition stops being pending.
  useEffect(() => {
    const wasPending = busy.current
    busy.current = pending
    if (wasPending && !pending) scheduler.finished()
  }, [pending, scheduler])
}
