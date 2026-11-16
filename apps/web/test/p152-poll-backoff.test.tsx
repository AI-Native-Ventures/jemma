import { act, render } from '@testing-library/react'
import { Component, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// P152: a refresh that fails never stops the poll and never breaks the screen; the wait grows after each failure and goes back after a success.
// The router is a double, as in p89-use-refresh-poll. No database, no network, no browser.

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

import { MAX_BACKOFF_MS, backoffWait } from '@/lib/poll-backoff'
import { useRefreshPoll } from '@/lib/use-refresh-poll'

function Poll({ ms = 3000, active = true }: { ms?: number; active?: boolean }) {
  useRefreshPoll(ms, active)
  return <p>the screen</p>
}

/** Stands in for the page's error boundary: if the poll let an error out, this is what would show. */
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? <p>This page couldn&apos;t load</p> : this.props.children
  }
}

const tick = (ms: number) => act(async () => void vi.advanceTimersByTime(ms))
const boom = () => {
  throw new Error('Failed to fetch')
}
const fine = () => {}

let online = true
beforeEach(() => {
  vi.useFakeTimers()
  refresh.mockReset()
  online = true
  vi.spyOn(window.navigator, 'onLine', 'get').mockImplementation(() => online)
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('backoffWait', () => {
  it('is the screen\'s own wait with no failure, and doubles with each failure up to 30 s', () => {
    expect([0, 1, 2, 3, 4, 5, 9].map((n) => backoffWait(3000, n))).toEqual([3000, 6000, 12_000, 24_000, 30_000, 30_000, 30_000])
    expect([0, 1, 2, 3, 4, 5].map((n) => backoffWait(2000, n))).toEqual([2000, 4000, 8000, 16_000, 30_000, 30_000])
  })

  it('is never shorter than the screen\'s own wait, even when that is longer than 30 s', () => {
    expect(backoffWait(45_000, 0)).toBe(45_000)
    expect(backoffWait(45_000, 3)).toBe(45_000)
    expect(MAX_BACKOFF_MS).toBe(30_000)
  })
})

describe('useRefreshPoll after a failure', () => {
  it('keeps polling when every refresh throws, with a wait of 3 s, 6 s, 12 s, 24 s, then 30 s, and the screen stays up', async () => {
    refresh.mockImplementation(boom)
    const view = render(
      <Boundary>
        <Poll />
      </Boundary>,
    )
    let calls = 0
    for (const wait of [3000, 6000, 12_000, 24_000, 30_000, 30_000, 30_000]) {
      await tick(wait - 1)
      expect(refresh, `not before ${wait} ms`).toHaveBeenCalledTimes(calls)
      await tick(1)
      calls += 1
      expect(refresh, `at ${wait} ms`).toHaveBeenCalledTimes(calls)
    }
    expect(view.queryByText('the screen')).not.toBeNull()
    expect(view.queryByText(/couldn't load/)).toBeNull()
  })

  it('goes back to the screen\'s own wait after the first refresh that goes through', async () => {
    refresh.mockImplementation(boom)
    render(<Poll />)
    await tick(3000) // fails: next wait 6 s
    await tick(6000) // fails: next wait 12 s
    expect(refresh).toHaveBeenCalledTimes(2)
    refresh.mockImplementation(fine)
    await tick(12_000) // goes through
    expect(refresh).toHaveBeenCalledTimes(3)
    await tick(2999)
    expect(refresh).toHaveBeenCalledTimes(3)
    await tick(1)
    expect(refresh).toHaveBeenCalledTimes(4)
    await tick(3000)
    expect(refresh).toHaveBeenCalledTimes(5)
  })

  it('does not ask while the browser is offline, still waits (and backs off), and asks again when it is back', async () => {
    // An ask that is not made shows no sign of work, so the poll counts it as over after its 25 ms settle window: each wait here starts 25 ms late.
    const SETTLE = 25
    online = false
    render(<Poll />)
    await tick(3000) // offline: nothing sent, next wait 6 s
    await tick(6000 + SETTLE)
    await tick(12_000 + SETTLE) // third offline round: next wait 24 s
    expect(refresh).not.toHaveBeenCalled()
    online = true
    await tick(24_000 + SETTLE - 1)
    expect(refresh).not.toHaveBeenCalled() // the 24 s wait is still running
    await tick(1)
    expect(refresh).toHaveBeenCalledTimes(1)
    await tick(3000) // and back to 3 s
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('still stops when the screen goes away or turns inactive, after failures', async () => {
    refresh.mockImplementation(boom)
    const view = render(<Poll />)
    await tick(3000)
    expect(refresh).toHaveBeenCalledTimes(1)
    view.rerender(<Poll active={false} />)
    await tick(120_000)
    expect(refresh).toHaveBeenCalledTimes(1)
    view.unmount()
    await tick(120_000)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('a poll that works is as before: 3 s, 3 s, 3 s', async () => {
    refresh.mockImplementation(fine)
    render(<Poll />)
    for (let round = 1; round <= 4; round++) {
      await tick(3000)
      expect(refresh).toHaveBeenCalledTimes(round)
    }
  })
})
