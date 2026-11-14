import { act, render } from '@testing-library/react'
import { Suspense, use, useState, type ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The hook that every screen which asks the server again uses. The router is a double. A "slow server" is made the way Next makes one: the
// refresh is an update inside the transition that suspends until the answer arrives, so the transition stays pending until then.

let answers: Array<() => void> = []
let startAnswer: (p: Promise<void>) => void = () => {}
const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

import { useRefreshPoll } from '@/lib/use-refresh-poll'

/** Stands in for the page below the router: it suspends on the newest answer until `answers[n]()` is called. */
function Page() {
  const [answer, setAnswer] = useState<Promise<void> | null>(null)
  startAnswer = setAnswer
  if (answer) use(answer)
  return null
}

function Poll({ ms, active }: { ms: number; active: boolean }) {
  useRefreshPoll(ms, active)
  return (
    <Suspense fallback={null}>
      <Page />
    </Suspense>
  )
}

/** A refresh that does not answer until the test lets it. */
const slowRefresh = () => {
  startAnswer(new Promise<void>((resolve) => answers.push(resolve)))
}
/** A refresh that answers at once. */
const fastRefresh = () => {}

const tick = (ms: number) => act(async () => void vi.advanceTimersByTime(ms))
const rerender = (view: { rerender: (ui: ReactElement) => void }, ui: ReactElement) => act(async () => view.rerender(ui))
const answer = (n: number) => act(async () => answers[n]!())

beforeEach(() => {
  vi.useFakeTimers()
  answers = []
  refresh.mockReset()
})
afterEach(() => vi.useRealTimers())

describe('useRefreshPoll', () => {
  it('refreshes after the wait and not before', async () => {
    refresh.mockImplementation(fastRefresh)
    render(<Poll ms={3000} active />)
    await tick(2999)
    expect(refresh).not.toHaveBeenCalled()
    await tick(1)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('keeps refreshing, once per wait, when the server answers at once', async () => {
    refresh.mockImplementation(fastRefresh)
    render(<Poll ms={3000} active />)
    for (let round = 1; round <= 4; round++) {
      await tick(3000)
      expect(refresh).toHaveBeenCalledTimes(round)
    }
  })

  it('with a slow server, never starts a second refresh while the first is still waiting for its answer', async () => {
    refresh.mockImplementation(slowRefresh)
    render(<Poll ms={3000} active />)
    await tick(3000)
    expect(refresh).toHaveBeenCalledTimes(1)
    // Ten more waits go by (30 s) and the answer is still not back.
    for (let i = 0; i < 10; i++) await tick(3000)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('starts the next wait only after the answer is back, and then waits the full time', async () => {
    refresh.mockImplementation(slowRefresh)
    render(<Poll ms={3000} active />)
    await tick(3000)
    await tick(20_000)
    await answer(0)
    await tick(2999)
    expect(refresh).toHaveBeenCalledTimes(1)
    await tick(1)
    expect(refresh).toHaveBeenCalledTimes(2)
    await tick(20_000)
    expect(refresh).toHaveBeenCalledTimes(2)
    await answer(1)
    await tick(3000)
    expect(refresh).toHaveBeenCalledTimes(3)
  })

  it('does nothing while inactive', async () => {
    refresh.mockImplementation(fastRefresh)
    render(<Poll ms={1000} active={false} />)
    await tick(10_000)
    expect(refresh).not.toHaveBeenCalled()
  })

  it('starts when it becomes active and stops when it becomes inactive', async () => {
    refresh.mockImplementation(fastRefresh)
    const view = render(<Poll ms={1000} active={false} />)
    await tick(5000)
    expect(refresh).not.toHaveBeenCalled()
    view.rerender(<Poll ms={1000} active />)
    await tick(1000)
    expect(refresh).toHaveBeenCalledTimes(1)
    view.rerender(<Poll ms={1000} active={false} />)
    await tick(10_000)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('stops when the screen goes away, also while a refresh is waiting for its answer', async () => {
    refresh.mockImplementation(slowRefresh)
    const view = render(<Poll ms={1000} active />)
    await tick(1000)
    expect(refresh).toHaveBeenCalledTimes(1)
    view.unmount()
    await tick(10_000)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('stops when the screen goes away while it is waiting', async () => {
    refresh.mockImplementation(fastRefresh)
    const view = render(<Poll ms={1000} active />)
    await tick(500)
    view.unmount()
    await tick(10_000)
    expect(refresh).not.toHaveBeenCalled()
  })

  it('goes inactive while a refresh is waiting and active again: no second refresh until the first answer is back', async () => {
    refresh.mockImplementation(slowRefresh)
    const view = render(<Poll ms={1000} active />)
    await tick(1000)
    await rerender(view, <Poll ms={1000} active={false} />)
    await rerender(view, <Poll ms={1000} active />)
    await tick(10_000)
    expect(refresh).toHaveBeenCalledTimes(1)
    await answer(0)
    await tick(1000)
    expect(refresh).toHaveBeenCalledTimes(2)
  })
})
