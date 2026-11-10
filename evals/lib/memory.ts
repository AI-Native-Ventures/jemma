import { execFile } from 'node:child_process'

/**
 * A guard for small machines. The runs are one after another already; this makes each run wait until the machine has
 * enough free memory. macOS only (`memory_pressure`); anywhere else it reads nothing and never waits.
 */

/** The system-wide free memory percentage from the last line of `memory_pressure`, or null when the text has none. */
export function parseFreePercent(text: string): number | null {
  const match = /System-wide memory free percentage:\s*(\d+)\s*%/i.exec(text)
  return match ? Number(match[1]) : null
}

export function readFreePercent(): Promise<number | null> {
  return new Promise((resolve) => {
    if (process.platform !== 'darwin') return resolve(null)
    execFile('memory_pressure', [], { timeout: 15_000 }, (_err, stdout) => resolve(parseFreePercent(String(stdout ?? '').split('\n').slice(-3).join('\n'))))
  })
}

export type MemoryWait = { waits: number; waitedMs: number; lastPercent: number | null }

/**
 * Starts only when the free percentage is `startAt` or more; otherwise sleeps `pauseMs` and looks again. A reading that
 * cannot be made (not a Mac) counts as fine. `read` and `sleep` are injected so a test needs no clock and no Mac.
 */
export async function waitForMemory(opts: {
  read: () => Promise<number | null>
  sleep: (ms: number) => Promise<void>
  startAt?: number
  pauseMs?: number
  log?: (line: string) => void
}): Promise<MemoryWait> {
  const startAt = opts.startAt ?? 30
  const pauseMs = opts.pauseMs ?? 60_000
  const log = opts.log ?? (() => {})
  let waits = 0
  for (;;) {
    const percent = await opts.read()
    if (percent === null || percent >= startAt) return { waits, waitedMs: waits * pauseMs, lastPercent: percent }
    waits++
    log(`only ${percent}% of memory is free (need ${startAt}%): waiting ${Math.round(pauseMs / 1000)} seconds`)
    await opts.sleep(pauseMs)
  }
}
