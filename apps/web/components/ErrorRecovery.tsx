'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import {
  GIVE_UP_AFTER_MS,
  RECOVERY_HELP,
  RECOVERY_TITLE,
  RECOVERY_WAITING,
  classifyError,
  claimReload,
  homeFor,
  nextRetryDelay,
  noteManualTry,
  noteTry,
} from '@/lib/error-recovery'
import { reloadPage } from '@/lib/reload-page'
import { isOffline } from '@/lib/poll-backoff'

/** What Next gives an error screen. `retry` asks the server again and renders the segment again (Next 16.3 and later); `reset` only renders it again. */
export type ErrorScreenProps = { error: unknown; reset: () => void; retry?: () => void }

export type Recovery = {
  /** `waiting`: a try is coming or under way, show a quiet "Reconnecting". `card`: the tries are used up (or there is no point), show the buttons. */
  phase: 'waiting' | 'card'
  /** The child tapped Try again and it has not come back yet. */
  busy: boolean
  tryAgain: () => void
}

/**
 * The behaviour of every error screen (P152). On an error that looks like a lost connection (see `classifyError`) it tries again by itself,
 * after 1 s, then 3 s, then 3 s, and only when those are used up (or a try does not come back in 8 s) does it let the card show. A script that
 * could not be loaded (the page is from before a new version went out) reloads the whole page once instead. Any other error shows the card at once.
 * The count of tries is kept outside the component (`error-recovery.ts`): the screen is built again each time a try fails.
 */
export function useErrorRecovery({ error, reset, retry }: ErrorScreenProps): Recovery {
  const [phase, setPhase] = useState<Recovery['phase']>(() => (classifyError(error) === 'other' ? 'card' : 'waiting'))
  const [busy, setBusy] = useState(false)
  // The newest functions, so a timer set earlier calls the current ones and the effect below runs once per error.
  const act = useRef({ reset, retry })
  useEffect(() => {
    act.current = { reset, retry }
  })
  const run = () => (act.current.retry ?? act.current.reset)()
  const busyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (busyTimer.current) clearTimeout(busyTimer.current)
    },
    [],
  )

  useEffect(() => {
    const kind = classifyError(error, isOffline())
    if (kind === 'chunk' && claimReload(Date.now())) {
      setPhase('waiting')
      reloadPage()
      return
    }
    const delay = kind === 'other' ? null : nextRetryDelay(Date.now())
    if (delay === null) {
      setPhase('card')
      return
    }
    setPhase('waiting')
    let giveUp: ReturnType<typeof setTimeout> | undefined
    const timer = setTimeout(() => {
      noteTry(Date.now())
      run()
      giveUp = setTimeout(() => setPhase('card'), GIVE_UP_AFTER_MS)
    }, delay)
    return () => {
      clearTimeout(timer)
      if (giveUp) clearTimeout(giveUp)
    }
  }, [error])

  const tryAgain = () => {
    noteManualTry(Date.now())
    setBusy(true)
    run()
    busyTimer.current = setTimeout(() => setBusy(false), GIVE_UP_AFTER_MS)
  }

  return { phase, busy, tryAgain }
}

const card = 'flex w-full max-w-[460px] flex-col rounded-[26px] border border-line bg-card p-5 shadow-[0_8px_24px_rgba(31,29,54,0.06)]'

/** The same coral ring the lesson-loading screen turns while Jemma works. */
function Ring() {
  return (
    <svg aria-hidden="true" width="36" height="36" viewBox="0 0 28 28" className="motion-safe:animate-spin">
      <circle cx="14" cy="14" r="11" fill="none" stroke="#EEEDF5" strokeWidth="3.5" />
      <path d="M14 3a11 11 0 0 1 11 11" fill="none" stroke="#FF6A4D" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  )
}

/**
 * The body of an `error.tsx` (P152): the quiet "Reconnecting" while it tries again by itself, then a calm card with Try again and Go to home.
 * `home` is the page that is home in that part of the app; without it the part is read from the address (the root `error.tsx` has no part of its own).
 * Phone first: the buttons are the width of the card and at least 56 px high.
 */
export function ErrorRecovery({ home, ...props }: ErrorScreenProps & { home?: string }) {
  const pathname = usePathname()
  const { phase, busy, tryAgain } = useErrorRecovery(props)
  const homeHref = home ?? homeFor(pathname)

  return (
    <div className="flex w-full justify-center px-5 py-10 sm:py-16">
      {phase === 'waiting' ? (
        <section role="status" aria-live="polite" className={`${card} items-center gap-3 text-center`}>
          <Ring />
          <p className="m-0 text-[17px] leading-[1.45] text-body">{RECOVERY_WAITING}</p>
        </section>
      ) : (
        <section role="alert" aria-labelledby="recovery-title" className={`${card} gap-4`}>
          <h2 id="recovery-title" className="m-0 text-[24px] leading-[1.2] font-bold tracking-[-0.01em] text-pretty">{RECOVERY_TITLE}</h2>
          <p className="m-0 text-[17px] leading-[1.45] text-body">{RECOVERY_HELP}</p>
          <Button variant="coral" size="lg" pending={busy} onClick={tryAgain} className="!h-auto min-h-14 !px-5 py-3 text-center">
            Try again
          </Button>
          <a
            href={homeHref}
            className="flex min-h-14 items-center justify-center rounded-18 border-[1.5px] border-ink bg-card px-5 py-3 text-center text-[19px] leading-[normal] font-semibold text-ink no-underline"
          >
            Go to home
          </a>
        </section>
      )}
    </div>
  )
}
