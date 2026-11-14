import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPollScheduler } from '@/lib/poll-scheduler'

// The pure part of "ask the server again": when the next ask may start. No React, no browser, no router. Fake timers stand in for the clock.
// An ask is busy from the moment it starts until the test calls `finish()` (the hook does this when the transition is no longer pending).

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

function make(ms = 3000) {
  let busy = false
  const refresh = vi.fn(() => {
    busy = true
  })
  const scheduler = createPollScheduler({ wait: () => ms, refresh, isBusy: () => busy })
  const finish = () => {
    busy = false
    scheduler.finished()
  }
  return { scheduler, refresh, finish }
}

describe('createPollScheduler', () => {
  it('asks once after the wait, and not before', () => {
    const { scheduler, refresh } = make(3000)
    scheduler.start()
    vi.advanceTimersByTime(2999)
    expect(refresh).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('with a refresh slower than the wait, no second refresh starts before the first has finished', () => {
    const { scheduler, refresh } = make(3000)
    scheduler.start()
    vi.advanceTimersByTime(3000)
    expect(refresh).toHaveBeenCalledTimes(1)
    // The page is slow: ten waits go by and the first answer has not come back.
    vi.advanceTimersByTime(30_000)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('starts the next wait of the full length only when the last refresh has finished', () => {
    const { scheduler, refresh, finish } = make(3000)
    scheduler.start()
    vi.advanceTimersByTime(3000)
    vi.advanceTimersByTime(7000)
    finish()
    vi.advanceTimersByTime(2999)
    expect(refresh).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('keeps asking, one at a time, while each refresh finishes', () => {
    const { scheduler, refresh, finish } = make(2000)
    scheduler.start()
    for (let round = 1; round <= 5; round++) {
      vi.advanceTimersByTime(2000)
      expect(refresh).toHaveBeenCalledTimes(round)
      finish()
    }
  })

  it('a finished that arrives with nothing in flight starts no second wait', () => {
    const { scheduler, refresh, finish } = make(1000)
    scheduler.start()
    finish()
    finish()
    vi.advanceTimersByTime(1000)
    expect(refresh).toHaveBeenCalledTimes(1)
    finish()
    finish()
    vi.advanceTimersByTime(1000)
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('starting twice does not make two waits', () => {
    const { scheduler, refresh } = make(1000)
    scheduler.start()
    scheduler.start()
    vi.advanceTimersByTime(1000)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('stop while waiting means no refresh at all', () => {
    const { scheduler, refresh } = make(1000)
    scheduler.start()
    vi.advanceTimersByTime(500)
    scheduler.stop()
    vi.advanceTimersByTime(10_000)
    expect(refresh).not.toHaveBeenCalled()
  })

  it('stop while a refresh is in flight means no next wait, even when that refresh finishes', () => {
    const { scheduler, refresh, finish } = make(1000)
    scheduler.start()
    vi.advanceTimersByTime(1000)
    expect(refresh).toHaveBeenCalledTimes(1)
    scheduler.stop()
    finish()
    vi.advanceTimersByTime(10_000)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('start again while the old refresh is still in flight waits for that refresh to finish', () => {
    const { scheduler, refresh, finish } = make(1000)
    scheduler.start()
    vi.advanceTimersByTime(1000)
    scheduler.stop()
    scheduler.start()
    vi.advanceTimersByTime(10_000)
    expect(refresh).toHaveBeenCalledTimes(1)
    finish()
    vi.advanceTimersByTime(1000)
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('start after a stop that came while waiting begins a fresh wait', () => {
    const { scheduler, refresh } = make(1000)
    scheduler.start()
    vi.advanceTimersByTime(900)
    scheduler.stop()
    scheduler.start()
    vi.advanceTimersByTime(999)
    expect(refresh).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('an ask that cannot even start is over at once, so the polling does not stay stuck', () => {
    const refresh = vi.fn()
    refresh.mockImplementationOnce(() => {
      throw new Error('no router')
    })
    const scheduler = createPollScheduler({ wait: () => 1000, refresh, isBusy: () => false })
    scheduler.start()
    expect(() => vi.advanceTimersByTime(1000)).toThrow('no router')
    expect(refresh).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1000)
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('reads the wait again for every wait', () => {
    let ms = 1000
    let busy = false
    const refresh = vi.fn(() => {
      busy = true
    })
    const scheduler = createPollScheduler({ wait: () => ms, refresh, isBusy: () => busy })
    scheduler.start()
    vi.advanceTimersByTime(1000)
    ms = 5000
    busy = false
    scheduler.finished()
    vi.advanceTimersByTime(4999)
    expect(refresh).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    expect(refresh).toHaveBeenCalledTimes(2)
  })
})

describe('the settle window', () => {
  it('an ask that is never busy is over after the window, so the polling goes on and never waits for a finished that does not come', () => {
    const refresh = vi.fn()
    const scheduler = createPollScheduler({ wait: () => 1000, refresh, isBusy: () => false, settleMs: 25 })
    scheduler.start()
    vi.advanceTimersByTime(1000)
    expect(refresh).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1024)
    expect(refresh).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    expect(refresh).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(1025)
    expect(refresh).toHaveBeenCalledTimes(3)
  })

  it('an ask that is busy at the end of the window is not over: nothing more is asked until finished', () => {
    const { scheduler, refresh, finish } = make(1000)
    scheduler.start()
    vi.advanceTimersByTime(1000)
    vi.advanceTimersByTime(60_000)
    expect(refresh).toHaveBeenCalledTimes(1)
    finish()
    vi.advanceTimersByTime(1000)
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('a screen that shows the ask as busy late (after the window) still gets no second ask while it is busy', () => {
    let busy = false
    const refresh = vi.fn(() => {
      setTimeout(() => {
        busy = true
      }, 100)
    })
    const scheduler = createPollScheduler({ wait: () => 1000, refresh, isBusy: () => busy, settleMs: 25 })
    scheduler.start()
    vi.advanceTimersByTime(1000)
    expect(refresh).toHaveBeenCalledTimes(1)
    // The window ended before the busy state showed, so the next wait began. When it ends the ask is busy: no second ask.
    vi.advanceTimersByTime(30_000)
    expect(refresh).toHaveBeenCalledTimes(1)
    busy = false
    scheduler.finished()
    vi.advanceTimersByTime(1000)
    expect(refresh).toHaveBeenCalledTimes(2)
  })
})
