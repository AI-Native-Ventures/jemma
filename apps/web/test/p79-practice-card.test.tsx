import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The card on the learner's home for each state of "Practise now". The actions and the router are doubles: no server, no browser.

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('../app/k/actions', () => ({
  startPractice: vi.fn(async () => ({ ok: true })),
  retryPractice: vi.fn(async () => ({ ok: true })),
}))

import { PracticeCard } from '../app/k/PracticeCard'
import { retryPractice, startPractice } from '../app/k/actions'

beforeEach(() => {
  refresh.mockClear()
  vi.mocked(startPractice).mockClear()
  vi.mocked(retryPractice).mockClear()
})
afterEach(() => vi.useRealTimers())

describe('ready', () => {
  it('has one button, "Practise now", and says what happens', () => {
    render(<PracticeCard state="ready" />)
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Practise now' })).toBeTruthy()
    expect(screen.getByText('Jemma writes a short practice for you. It takes about a minute.')).toBeTruthy()
  })

  it('a tap asks for a practice, shows it is working, and then asks the screen to refresh', async () => {
    let finish: (v: { ok: true }) => void = () => {}
    vi.mocked(startPractice).mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)))
    render(<PracticeCard state="ready" />)
    fireEvent.click(screen.getByRole('button', { name: 'Practise now' }))
    expect(startPractice).toHaveBeenCalledTimes(1)
    expect(retryPractice).not.toHaveBeenCalled()
    // while it works the button shows a spinner (its name then has "Working" after it) and cannot be tapped again
    await vi.waitFor(() => expect(screen.getByRole('button', { name: /^Practise now/ }).getAttribute('aria-busy')).toBe('true'))
    expect((screen.getByRole('button', { name: /^Practise now/ }) as HTMLButtonElement).disabled).toBe(true)
    await act(async () => finish({ ok: true }))
    await vi.waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('an answer that is not ok is said in plain words under the button', async () => {
    vi.mocked(startPractice).mockResolvedValueOnce({ ok: false, message: 'Jemma could not be reached. Try again in a minute.' } as never)
    render(<PracticeCard state="ready" />)
    fireEvent.click(screen.getByRole('button', { name: 'Practise now' }))
    expect(await screen.findByText('Jemma could not be reached. Try again in a minute.')).toBeTruthy()
  })
})

describe('writing', () => {
  it('says Jemma is writing the practice, has no button, and asks the screen to refresh every 3 seconds', () => {
    vi.useFakeTimers()
    render(<PracticeCard state="writing" />)
    expect(screen.getByRole('heading', { name: 'Jemma is writing your practice.' })).toBeTruthy()
    expect(screen.getByText('About a minute. You can wait here.')).toBeTruthy()
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
      const { unmount } = render(<PracticeCard state={state} />)
      vi.advanceTimersByTime(10_000)
      unmount()
    }
    expect(refresh).not.toHaveBeenCalled()
    const writing = render(<PracticeCard state="writing" />)
    writing.unmount()
    vi.advanceTimersByTime(10_000)
    expect(refresh).not.toHaveBeenCalled()
  })
})

describe('failed', () => {
  it('says the practice could not be written and has one button, "Try again", which retries', async () => {
    render(<PracticeCard state="failed" />)
    expect(screen.getByRole('heading', { name: 'Jemma could not write your practice.' })).toBeTruthy()
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Practise now' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(retryPractice).toHaveBeenCalledTimes(1)
    expect(startPractice).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(refresh).toHaveBeenCalled())
  })
})

describe('none', () => {
  it('is one plain line and no button', () => {
    render(<PracticeCard state="none" />)
    expect(screen.getByText('Practice starts after your teacher marks a test.')).toBeTruthy()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })
})
