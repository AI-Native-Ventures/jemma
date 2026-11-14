import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The lesson screen while Jemma reads the child's photo: it asks the server where the paper stands every 3 seconds, but never asks again while
// the last ask is still waiting for its answer. The server actions and the router are stand-ins: no server, no browser.

const actions = vi.hoisted(() => ({
  beginSession: vi.fn(),
  answer: vi.fn(),
  finishSession: vi.fn(),
  paperProgress: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/app/k/session/[sessionId]/actions', () => actions)

import { SessionFlow } from '@/app/k/session/[sessionId]/SessionFlow'

type Progress = 'none' | 'reading' | 'failed' | 'done'

const lesson = {
  title: 'Equivalent fractions',
  format: 'reading' as const,
  minutes: 10,
  topicName: 'Equivalent fractions',
  warmupCount: 0,
  tryCount: 5,
  first: { position: 1, phase: 'try' as const, index: 1, of: 5, prompt: 'Complete: 1/2 = ?/4', render: 'text' as const, answerKind: 'fraction' as const },
  paper: [],
}

/** `paperProgress` answers only when the test says so. */
let open: Array<{ resolve: (p: Progress) => void; reject: (e: Error) => void }> = []
let running = 0
let most = 0
function slowServer() {
  actions.paperProgress.mockImplementation(
    () =>
      new Promise<Progress>((resolve, reject) => {
        running++
        most = Math.max(most, running)
        open.push({
          resolve: (p) => (running--, resolve(p)),
          reject: (e) => (running--, reject(e)),
        })
      }),
  )
}

const tick = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)))
const answer = (n: number, p: Progress) => act(async () => void open[n]!.resolve(p))

/** The screen as it is when the child already sent a photo: Jemma is reading it. */
async function reading() {
  const view = render(<SessionFlow sessionId="s1" firstName="Amina" warmup={[]} tryCount={5} topic="Equivalent fractions" />)
  await tick(0)
  return view
}

beforeEach(() => {
  vi.useFakeTimers()
  open = []
  running = 0
  most = 0
  for (const fn of Object.values(actions)) fn.mockReset()
  actions.beginSession.mockResolvedValue({ lesson, paper: 'reading' })
  actions.finishSession.mockResolvedValue({ missed: [], stage: null, minutes: 9, topicName: 'Equivalent fractions', next: null })
  slowServer()
})
afterEach(() => vi.useRealTimers())

describe('SessionFlow while Jemma reads the photo', () => {
  it('asks where the paper stands after 3 seconds, and not before', async () => {
    await reading()
    await tick(2999)
    expect(actions.paperProgress).not.toHaveBeenCalled()
    await tick(1)
    expect(actions.paperProgress).toHaveBeenCalledTimes(1)
    expect(actions.paperProgress).toHaveBeenCalledWith('s1')
  })

  it('with a slow server, never asks again while the last ask is waiting for its answer', async () => {
    await reading()
    await tick(3000)
    // A minute goes by and the server has not answered the first ask.
    await tick(60_000)
    expect(actions.paperProgress).toHaveBeenCalledTimes(1)
    expect(most).toBe(1)
  })

  it('asks the next time 3 seconds after the answer came back', async () => {
    await reading()
    await tick(3000)
    await tick(20_000)
    await answer(0, 'reading')
    await tick(2999)
    expect(actions.paperProgress).toHaveBeenCalledTimes(1)
    await tick(1)
    expect(actions.paperProgress).toHaveBeenCalledTimes(2)
    expect(most).toBe(1)
  })

  it('an ask that fails (the connection) is asked again 3 seconds later', async () => {
    await reading()
    await tick(3000)
    await act(async () => void open[0]!.reject(new Error('offline')))
    await tick(3000)
    expect(actions.paperProgress).toHaveBeenCalledTimes(2)
  })

  it('a closed session shows the results, once, and nothing is asked after that', async () => {
    await reading()
    await tick(3000)
    await answer(0, 'done')
    await tick(0)
    expect(actions.finishSession).toHaveBeenCalledTimes(1)
    await tick(60_000)
    expect(actions.paperProgress).toHaveBeenCalledTimes(1)
  })

  it('a read that failed shows what to do, and nothing is asked after that', async () => {
    await reading()
    await tick(3000)
    await answer(0, 'failed')
    await tick(60_000)
    expect(actions.paperProgress).toHaveBeenCalledTimes(1)
    expect(actions.finishSession).not.toHaveBeenCalled()
    expect(screen.queryByText(/reading your answers/i)).toBeNull()
  })

  it('stops asking when the screen goes away, also while an ask is waiting', async () => {
    const view = await reading()
    await tick(3000)
    view.unmount()
    await act(async () => void open[0]!.resolve('reading'))
    await tick(60_000)
    expect(actions.paperProgress).toHaveBeenCalledTimes(1)
  })

  it('a session with no photo sent does not ask at all', async () => {
    actions.beginSession.mockResolvedValue({ lesson, paper: 'none' })
    await reading()
    await tick(60_000)
    expect(actions.paperProgress).not.toHaveBeenCalled()
  })
})
