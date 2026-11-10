import type { JemmaDb } from '../../packages/profiling/src/db'
import { median } from './checks'

/**
 * The database round trip, measured so that a slow line shows up in the results instead of hiding in the run times.
 * Three small reads through the same client the harness uses; the median is saved in each result file as `dbRoundTripMs`.
 */
export const ROUND_TRIP_READS = 3

/** One small read: the id of one school. A failed read throws, so a dead line is not mistaken for a fast one. */
export async function readOneSchool(admin: JemmaDb): Promise<void> {
  const { error } = await admin.from('schools').select('id').limit(1)
  if (error) throw new Error(`the round trip read failed: ${error.message}`)
}

/** Median milliseconds of `reads` calls of `read`. `now` is the clock (injected in tests). */
export async function measureRoundTrip(read: () => Promise<void>, reads = ROUND_TRIP_READS, now: () => number = () => performance.now()): Promise<number> {
  const times: number[] = []
  for (let i = 0; i < reads; i++) {
    const start = now()
    await read()
    times.push(now() - start)
  }
  return Math.round(median(times))
}

export type CalmLine = { medianMs: number; waitedMs: number; measurements: number[]; startedAnyway: boolean }

/**
 * Before the real runs: measure the round trip. When the median is above `limitMs`, wait `pauseMs` and measure again,
 * for at most `maxWaitMs` in all, and then go on anyway. A line that stays slow is reported, never hidden.
 * `measure` and `sleep` are injected so a test needs no clock.
 */
export async function waitForCalmLine(opts: {
  measure: () => Promise<number>
  sleep: (ms: number) => Promise<void>
  limitMs?: number
  pauseMs?: number
  maxWaitMs?: number
  log?: (line: string) => void
}): Promise<CalmLine> {
  const limitMs = opts.limitMs ?? 3_000
  const pauseMs = opts.pauseMs ?? 10 * 60_000
  const maxWaitMs = opts.maxWaitMs ?? 60 * 60_000
  const log = opts.log ?? (() => {})
  const measurements: number[] = []
  let waitedMs = 0
  for (;;) {
    const medianMs = await opts.measure()
    measurements.push(medianMs)
    if (medianMs <= limitMs) {
      log(`database round trip ${medianMs} ms: fine, starting`)
      return { medianMs, waitedMs, measurements, startedAnyway: false }
    }
    if (waitedMs + pauseMs > maxWaitMs) {
      log(`database round trip ${medianMs} ms is still above ${limitMs} ms after waiting ${Math.round(waitedMs / 60_000)} minutes: starting anyway`)
      return { medianMs, waitedMs, measurements, startedAnyway: true }
    }
    log(`database round trip ${medianMs} ms is above ${limitMs} ms: waiting ${Math.round(pauseMs / 60_000)} minutes and measuring again`)
    await opts.sleep(pauseMs)
    waitedMs += pauseMs
  }
}
