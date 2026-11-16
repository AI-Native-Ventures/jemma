'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { backoffWait, isOffline } from './poll-backoff'
import { createPollScheduler } from './poll-scheduler'

/**
 * The one way a screen asks the server for fresh data every few seconds (`router.refresh()`), while `active`.
 *
 * One ask at a time: the refresh runs inside a transition, and the next wait of `ms` starts only after that transition is no longer pending
 * (the page has taken in the answer). A slow page is never asked again while it is still answering. It stops when `active` is false or the
 * screen goes away. The timing rules are in `createPollScheduler`.
 *
 * A refresh that fails never breaks the screen and never stops the poll (P152). When the browser is offline the ask is not made at all, and when
 * the ask itself throws the error is kept inside the poll; both count as a failure, and the wait grows 3 s, 6 s, 12 s, 24 s, 30 s (see
 * `backoffWait`) until an ask goes through, which puts it back to `ms`. (Next gives a refresh that fails on the way, in the page's own render, to
 * the nearest error boundary, which is where the app's `error.tsx` files take over: the hook cannot see that one.)
 */
export function useRefreshPoll(ms: number, active = true): void {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  // The scheduler lives as long as the screen, so an ask that is under way is remembered when `active` flips off and on again.
  const latest = useRef({ ms, router, startTransition })
  const busy = useRef(false)
  // Asks in a row that failed: none went out (offline) or the call threw.
  const failures = useRef(0)
  useEffect(() => {
    latest.current = { ms, router, startTransition }
  })
  const [scheduler] = useState(() =>
    createPollScheduler({
      wait: () => backoffWait(latest.current.ms, failures.current),
      refresh: () => {
        if (isOffline()) {
          failures.current += 1
          return
        }
        let failed = false as boolean
        latest.current.startTransition(() => {
          try {
            latest.current.router.refresh()
          } catch {
            // Kept here, inside the transition: an error thrown out of it would be given to the page's error boundary.
            failed = true
          }
        })
        failures.current = failed ? failures.current + 1 : 0
      },
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
