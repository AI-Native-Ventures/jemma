import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MyMathsSuggestion } from '@jemma/profiling/logic'

// The card on the learner's home for each state of practising: the first suggestion of "My maths" with a Practise button and a link to choose
// something else, Jemma writing it, the failed state with a retry, and one line when there is nothing to practise. The actions and the router
// are doubles: no server, no browser.

const refresh = vi.fn()
const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push }) }))
vi.mock('../app/k/actions', () => ({
  startPractice: vi.fn(async () => ({ ok: true })),
  retryPractice: vi.fn(async () => ({ ok: true })),
}))

import { PracticeCard } from '../app/k/PracticeCard'
import { retryPractice, startPractice } from '../app/k/actions'

const suggestion = (over: Partial<MyMathsSuggestion> = {}): MyMathsSuggestion => ({
  topicId: 't-add', topicName: 'Adding fractions', family: 'fractions', why: 'new', reason: 'To fix', score: { right: 2, asked: 6 }, ...over,
})

beforeEach(() => {
  refresh.mockClear()
  push.mockClear()
  vi.mocked(startPractice).mockClear()
  vi.mocked(retryPractice).mockClear()
})
afterEach(() => vi.useRealTimers())

describe('ready', () => {
  it('shows the first suggestion with its reason and its own count, one Practise button, and a link to choose something else', () => {
    render(<PracticeCard state="ready" suggestion={suggestion()} />)
    expect(screen.getByRole('heading', { name: 'Adding fractions' })).toBeTruthy()
    expect(screen.getByText('Suggested for you')).toBeTruthy()
    expect(screen.getByText(/To fix\s+·\s+2 of 6 right/)).toBeTruthy()
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Practise Adding fractions' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Practise now/ })).toBeNull()
    expect(screen.getByRole('link', { name: 'Choose something else' }).getAttribute('href')).toBe('/k/maths')
  })

  it('says "No score yet" for a suggestion nothing was asked on, never a percent', () => {
    render(<PracticeCard state="ready" suggestion={suggestion({ score: { right: 0, asked: 0 }, reason: 'A good next step' })} />)
    expect(screen.getByText(/A good next step\s+·\s+No score yet/)).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/%/)
  })

  it('a tap asks for a practice on that topic (the choice), shows it is working, then sends the learner to today', async () => {
    let finish: (v: { ok: true }) => void = () => {}
    vi.mocked(startPractice).mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)))
    render(<PracticeCard state="ready" suggestion={suggestion()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Practise Adding fractions' }))
    expect(startPractice).toHaveBeenCalledWith({ topicId: 't-add', topicName: 'Adding fractions' })
    expect(retryPractice).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Practise Adding fractions' }).getAttribute('aria-busy')).toBe('true'))
    expect((screen.getByRole('button', { name: 'Practise Adding fractions' }) as HTMLButtonElement).disabled).toBe(true)
    await act(async () => finish({ ok: true }))
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith('/k'))
    expect(refresh).toHaveBeenCalled()
  })

  it('a suggestion that is a strand has no topic id, and it is still asked for by its name', () => {
    render(<PracticeCard state="ready" suggestion={suggestion({ topicId: null, topicName: 'Fractions', why: 'history', reason: 'A good next step' })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Practise Fractions' }))
    expect(startPractice).toHaveBeenCalledWith({ topicId: undefined, topicName: 'Fractions' })
  })

  it('an answer that is not ok is said in plain words under the button, and the learner stays', async () => {
    vi.mocked(startPractice).mockResolvedValueOnce({ ok: false, message: 'Jemma could not be reached. Try again in a minute.' } as never)
    render(<PracticeCard state="ready" suggestion={suggestion()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Practise Adding fractions' }))
    expect(await screen.findByText('Jemma could not be reached. Try again in a minute.')).toBeTruthy()
    expect(push).not.toHaveBeenCalled()
  })

  it('with nothing to suggest it is the plain line and a link to My maths, and no button', () => {
    render(<PracticeCard state="ready" suggestion={null} />)
    expect(screen.getByText('Practice starts after your teacher marks a test.')).toBeTruthy()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.getByRole('link', { name: 'See my maths' }).getAttribute('href')).toBe('/k/maths')
  })
})

describe('writing', () => {
  it('says Jemma is writing the practice, has no button, and asks the screen to refresh every 3 seconds', () => {
    vi.useFakeTimers()
    render(<PracticeCard state="writing" suggestion={null} />)
    expect(screen.getByRole('heading', { name: 'Jemma is writing your practice.' })).toBeTruthy()
    expect(screen.getByText('A minute or two. You can wait here.')).toBeTruthy()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(refresh).not.toHaveBeenCalled()
    vi.advanceTimersByTime(2900)
    expect(refresh).not.toHaveBeenCalled()
    vi.advanceTimersByTime(200)
    expect(refresh).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(6000)
    expect(refresh).toHaveBeenCalledTimes(3)
  })

  it('the other states do not poll, and the polling stops when the card goes away', () => {
    vi.useFakeTimers()
    for (const state of ['ready', 'failed', 'none'] as const) {
      const { unmount } = render(<PracticeCard state={state} suggestion={state === 'ready' ? suggestion() : null} />)
      vi.advanceTimersByTime(10_000)
      unmount()
    }
    expect(refresh).not.toHaveBeenCalled()
    const writing = render(<PracticeCard state="writing" suggestion={null} />)
    writing.unmount()
    vi.advanceTimersByTime(10_000)
    expect(refresh).not.toHaveBeenCalled()
  })
})

describe('failed', () => {
  it('says the practice could not be written and has one button, "Try again", which retries', async () => {
    render(<PracticeCard state="failed" suggestion={null} />)
    expect(screen.getByRole('heading', { name: 'Jemma could not write your practice.' })).toBeTruthy()
    expect(screen.getAllByRole('button')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(retryPractice).toHaveBeenCalledTimes(1)
    expect(startPractice).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(refresh).toHaveBeenCalled())
  })
})

describe('none', () => {
  it('is one plain line, a link to My maths and no button', () => {
    render(<PracticeCard state="none" suggestion={null} />)
    expect(screen.getByText('Practice starts after your teacher marks a test.')).toBeTruthy()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.getByRole('link', { name: 'See my maths' }).getAttribute('href')).toBe('/k/maths')
  })
})
