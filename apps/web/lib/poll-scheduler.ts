/**
 * When a screen that asks the server again every few seconds may ask next. Pure: no React, no router, no browser.
 *
 * The rule is one ask at a time. The wait for the next ask starts only after the last ask has finished, so a slow page is never asked
 * again while it is still answering (asks that overlap queue up behind each other, and the screen can stay stuck for a minute).
 *
 * `refresh` starts one ask. `isBusy()` says whether an ask is still under way (for the hook: the transition is pending). The owner calls
 * `finished()` when `isBusy()` goes from true to false.
 *
 * A screen cannot show an ask as busy the moment it starts it, so the scheduler gives it a short settle window. If nothing is busy after
 * that window, the ask is over (it answered at once, or it never started) and the next wait starts: the polling cannot stay stuck on a
 * `finished()` that never comes. And whenever a wait ends while `isBusy()` is true, no ask is made: it waits for `finished()`.
 * `start()`, `stop()` and `finished()` can be called any number of times.
 */
export type PollScheduler = {
  /** Wait, then ask. Safe to call again while already waiting. If an ask is still under way, the wait starts when it has finished. */
  start(): void
  /** Stop waiting. An ask already under way is left to finish, and no further wait starts until `start()`. */
  stop(): void
  /** The ask that `refresh` started is over: start the next wait (if started). */
  finished(): void
}

/**
 * A poll whose ask is a plain async call (for example a server action), not a router refresh: `ask` is called every `ms`, one ask at a time.
 * The next wait of `ms` starts only after the last ask has settled, answered or failed (the caller handles its own errors; a failed ask is
 * simply over). Returns the function that stops it: no new ask after that, and an ask still waiting is left to settle.
 */
export function startAskPoll(ms: number, ask: () => Promise<void>): () => void {
  let busy = false
  const scheduler: PollScheduler = createPollScheduler({
    wait: () => ms,
    isBusy: () => busy,
    refresh: () => {
      busy = true
      void (async () => {
        try {
          await ask()
        } catch {
          // Over, not retried at once: the next wait starts below.
        } finally {
          busy = false
          scheduler.finished()
        }
      })()
    },
  })
  scheduler.start()
  return () => scheduler.stop()
}

/** How long a new ask has to show up as busy. A browser shows it within a frame or two. */
export const SETTLE_MS = 25

export function createPollScheduler(options: {
  wait: () => number
  refresh: () => void
  isBusy: () => boolean
  settleMs?: number
}): PollScheduler {
  const settleMs = options.settleMs ?? SETTLE_MS
  let running = false
  let inFlight = false
  let timer: ReturnType<typeof setTimeout> | null = null

  const arm = () => {
    if (!running || inFlight || timer !== null) return
    timer = setTimeout(fire, options.wait())
  }
  const settle = () => {
    // Still not busy after the settle window: the ask is over, whether or not the owner said so.
    if (inFlight && !options.isBusy()) {
      inFlight = false
      arm()
    }
  }
  const fire = () => {
    timer = null
    if (!running || inFlight) return
    inFlight = true
    // An ask is under way already (the owner has not said so yet): do not start another, wait for `finished()`.
    if (options.isBusy()) return
    try {
      options.refresh()
    } catch (error) {
      // An ask that could not even start is over: do not stay "in flight" for ever. The error is not hidden.
      inFlight = false
      arm()
      throw error
    }
    setTimeout(settle, settleMs)
  }

  return {
    start() {
      running = true
      arm()
    },
    stop() {
      running = false
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
    },
    finished() {
      inFlight = false
      arm()
    },
  }
}
