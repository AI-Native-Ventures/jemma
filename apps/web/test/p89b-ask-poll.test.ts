import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startAskPoll } from '@/lib/poll-scheduler'

// A poll whose ask is a plain async call (a server action), not a router refresh. One ask at a time: the next wait starts only after the
// last ask has settled, answered or failed. Fake timers and promises the test settles by hand: no React, no browser, no server.

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

/** An ask that does not answer until the test says so, and counts how many are open at once. */
function slowAsks() {
  const open: Array<{ resolve: () => void; reject: (e: Error) => void }> = []
  let running = 0
  let most = 0
  const ask = vi.fn(
    () =>
      new Promise<void>((resolve, reject) => {
        running++
        most = Math.max(most, running)
        open.push({
          resolve: () => (running--, resolve()),
          reject: (e) => (running--, reject(e)),
        })
      }),
  )
  return { ask, open, most: () => most }
}

/** Let the promise callbacks run (an ask settling), without moving the clock. */
const settle = () => vi.advanceTimersByTimeAsync(0)

describe('startAskPoll', () => {
  it('asks after the wait and not before', async () => {
    const { ask } = slowAsks()
    startAskPoll(3000, ask)
    await vi.advanceTimersByTimeAsync(2999)
    expect(ask).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(ask).toHaveBeenCalledTimes(1)
  })

  it('with a slow answer, never asks again while the last ask is still waiting', async () => {
    const { ask, most } = slowAsks()
    startAskPoll(3000, ask)
    await vi.advanceTimersByTimeAsync(3000)
    // A minute goes by (20 waits) and the first answer is still not back.
    await vi.advanceTimersByTimeAsync(60_000)
    expect(ask).toHaveBeenCalledTimes(1)
    expect(most()).toBe(1)
  })

  it('starts the next wait of the full length only after the answer is back', async () => {
    const { ask, open } = slowAsks()
    startAskPoll(3000, ask)
    await vi.advanceTimersByTimeAsync(3000)
    await vi.advanceTimersByTimeAsync(20_000)
    open[0]!.resolve()
    await settle()
    await vi.advanceTimersByTimeAsync(2999)
    expect(ask).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(ask).toHaveBeenCalledTimes(2)
  })

  it('keeps asking, never two at once, when each answer takes a while', async () => {
    const { ask, open, most } = slowAsks()
    startAskPoll(3000, ask)
    for (let round = 1; round <= 10; round++) {
      await vi.advanceTimersByTimeAsync(3000)
      expect(ask).toHaveBeenCalledTimes(round)
      await vi.advanceTimersByTimeAsync(5000)
      open[round - 1]!.resolve()
      await settle()
    }
    expect(most()).toBe(1)
  })

  it('an ask that fails is over: the poll goes on after the wait', async () => {
    const { ask, open } = slowAsks()
    startAskPoll(3000, ask)
    await vi.advanceTimersByTimeAsync(3000)
    open[0]!.reject(new Error('offline'))
    await settle()
    await vi.advanceTimersByTimeAsync(3000)
    expect(ask).toHaveBeenCalledTimes(2)
  })

  it('an ask that throws before it returns anything is over too', async () => {
    const ask = vi.fn(() => {
      throw new Error('no connection')
    })
    startAskPoll(3000, ask as unknown as () => Promise<void>)
    await vi.advanceTimersByTimeAsync(3000)
    expect(ask).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(3000)
    expect(ask).toHaveBeenCalledTimes(2)
  })

  it('stop while waiting means no ask', async () => {
    const { ask } = slowAsks()
    const stop = startAskPoll(3000, ask)
    await vi.advanceTimersByTimeAsync(1000)
    stop()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(ask).not.toHaveBeenCalled()
  })

  it('stop while an ask is waiting means no next ask, even when it answers', async () => {
    const { ask, open } = slowAsks()
    const stop = startAskPoll(3000, ask)
    await vi.advanceTimersByTimeAsync(3000)
    stop()
    open[0]!.resolve()
    await settle()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(ask).toHaveBeenCalledTimes(1)
  })
})
