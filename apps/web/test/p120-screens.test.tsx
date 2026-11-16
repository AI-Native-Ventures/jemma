import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// P120: the hand-back screen (where the hold goes, "See your answers"), "Your practice" on My maths and one finished practice read again. Server parts are
// called as functions and drawn with react-dom; the data, the router and the actions are stand-ins: no browser, no server, no database.

const state = vi.hoisted(() => ({
  handback: null as unknown,
  next: null as unknown,
  result: null as unknown,
  pushed: [] as string[],
  held: 0,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: (to: string) => state.pushed.push(to), replace: () => undefined, refresh: () => undefined }),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
vi.mock('@/lib/data/p27', () => ({ getHandback: async () => state.handback }))
vi.mock('@/lib/data/p120', () => ({
  getHandbackNext: async () => state.next,
  getPastResult: async () => {
    if (!state.result) throw new Error('NEXT_NOT_FOUND')
    return state.result
  },
}))
vi.mock('../app/k/done/actions', () => ({
  handBackToDemoParent: async () => {
    state.held += 1
  },
}))

import HandbackPage from '../app/k/done/page'
import { HoldToOpen } from '../app/k/done/HoldToOpen'
import { PastPractice } from '../app/k/PastPractice'
import PastResultsPage from '../app/k/session/[sessionId]/results/page'
import { Results } from '../app/k/session/_parts/Results'
import { practiceRows } from '../lib/past-practice'

const hand = { firstName: 'Amina', minutes: 10, relation: 'your mum', parentName: 'Thandi', alone: false }

beforeEach(() => {
  state.handback = hand
  state.next = { target: { kind: 'home', href: '/k' }, seeAnswersHref: '/k/session/s1/results?from=done' }
  state.result = null
  state.pushed = []
  state.held = 0
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('the hand-back screen', () => {
  it('a learner with nobody to hand the phone to gets "Back to my Jemma" and no hold, and is not asked to pass the phone', async () => {
    render(await HandbackPage())
    expect(screen.getByRole('link', { name: 'Back to my Jemma' }).getAttribute('href')).toBe('/k')
    expect(screen.queryByRole('button')).toBeNull()
    expect(document.body.textContent).not.toMatch(/pass the phone|For Thandi/i)
    expect(document.body.innerHTML).not.toContain('/demo/switch')
  })

  it('a grown-up with the phone gets the hold, and the hold opens their own page for the practice', async () => {
    state.next = { target: { kind: 'open', href: '/p/c1/sessions/s1' }, seeAnswersHref: '/k/session/s1/results?from=done' }
    vi.useFakeTimers()
    render(await HandbackPage())
    expect(document.body.textContent).toContain('Now pass the phone back to your mum.')
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('For Thandi')
    expect(screen.queryByRole('link', { name: 'Back to my Jemma' })).toBeNull()
    fireEvent.pointerDown(screen.getByRole('button'))
    act(() => void vi.advanceTimersByTime(2000))
    expect(state.pushed).toEqual(['/p/c1/sessions/s1'])
    expect(state.held).toBe(0)
  })

  it("in a demo copy the hold runs the switch to the made-up grown-up, and goes nowhere by itself", async () => {
    state.next = { target: { kind: 'demo-parent', href: '/p/c1/sessions/s1' }, seeAnswersHref: null }
    vi.useFakeTimers()
    render(await HandbackPage())
    fireEvent.pointerDown(screen.getByRole('button'))
    await act(async () => void vi.advanceTimersByTime(2000))
    expect(state.held).toBe(1)
    expect(state.pushed).toEqual([])
  })

  it('an early lift of the finger opens nothing', async () => {
    state.next = { target: { kind: 'demo-parent', href: '/p/c1/sessions/s1' }, seeAnswersHref: null }
    vi.useFakeTimers()
    render(await HandbackPage())
    const hold = screen.getByRole('button')
    fireEvent.pointerDown(hold)
    act(() => void vi.advanceTimersByTime(1500))
    fireEvent.pointerUp(hold)
    act(() => void vi.advanceTimersByTime(2000))
    expect(state.held).toBe(0)
    expect(state.pushed).toEqual([])
  })

  it('offers "See your answers" for the practice just finished, and none when there is none', async () => {
    render(await HandbackPage())
    expect(screen.getByRole('link', { name: 'See your answers' }).getAttribute('href')).toBe('/k/session/s1/results?from=done')
    cleanup()
    state.next = { target: { kind: 'home', href: '/k' }, seeAnswersHref: null }
    render(await HandbackPage())
    expect(screen.queryByRole('link', { name: 'See your answers' })).toBeNull()
  })

  it('says nothing about a teacher or a school, and has no em dash', async () => {
    render(await HandbackPage())
    expect(document.body.textContent).not.toMatch(/teacher|school/i)
    expect(document.body.textContent).not.toContain(String.fromCharCode(0x2014))
  })

  it('has no link to the demo list of people in any of the cases', async () => {
    for (const target of [{ kind: 'home', href: '/k' }, { kind: 'open', href: '/p/c1' }, { kind: 'demo-parent', href: '/p/c1' }]) {
      state.next = { target, seeAnswersHref: null }
      render(await HandbackPage())
      expect(document.body.innerHTML).not.toContain('/demo/switch')
      cleanup()
    }
  })
})

describe('HoldToOpen', () => {
  it('with an address it goes there after two seconds', () => {
    vi.useFakeTimers()
    render(<HoldToOpen href="/p/c1" />)
    fireEvent.pointerDown(screen.getByRole('button'))
    act(() => void vi.advanceTimersByTime(1999))
    expect(state.pushed).toEqual([])
    act(() => void vi.advanceTimersByTime(1))
    expect(state.pushed).toEqual(['/p/c1'])
  })
})

describe('"Your practice" on My maths', () => {
  const rows = practiceRows([
    { id: 'old', topic_name: 'Fractions', finished_at: '2026-11-10T09:00:00.000+00:00', planned_for: '2026-11-10', right: 2, question_count: 5 },
    { id: 'new', topic_name: 'Algebraic expressions', finished_at: '2026-11-16T10:20:00.000+00:00', planned_for: '2026-11-16', right: 0, question_count: 5 },
  ])

  it('lists the practices newest first, each with its topic, its day and its count, and opens that practice', () => {
    render(<PastPractice rows={rows} />)
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Your practice')
    const links = screen.getAllByRole('link')
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/k/session/new/results', '/k/session/old/results'])
    expect(links[0]!.textContent).toContain('Algebraic expressions')
    expect(links[0]!.textContent).toContain('Mon 16 Nov · 0 of 5 right')
    expect(links[1]!.textContent).toContain('Fractions')
    expect(links[1]!.textContent).toContain('Tue 10 Nov · 2 of 5 right')
  })

  it('shows nothing until there is a finished practice', () => {
    const { container } = render(<PastPractice rows={[]} />)
    expect(container.innerHTML).toBe('')
  })

  it('its rows are tall and have room at the sides, and it has no em dash and no teacher or school', () => {
    render(<PastPractice rows={rows} />)
    const classes = screen.getAllByRole('link')[0]!.className.split(/\s+/)
    expect(classes.some((c) => c.startsWith('min-h-'))).toBe(true)
    expect(document.body.textContent).not.toMatch(/teacher|school/i)
    expect(document.body.textContent).not.toContain(String.fromCharCode(0x2014))
  })
})

const missed = {
  n: 2,
  prompt: '3x + 12',
  render: 'text' as const,
  wrote: '3x + 12 + 0',
  right: '3x + 12',
  why: 'Adding nothing changes nothing.',
  rightWay: 'Leave it as 3x + 12.',
}
const result = { firstName: 'Amina', topic: 'Algebraic expressions', day: 'Mon 16 Nov', score: '4 of 5 right', missed: [missed], hasAnswers: true }

describe('one finished practice, read again', () => {
  it('shows what was written, the right answer, why and the right way, under the topic, the day and the count', async () => {
    state.result = result
    render(await PastResultsPage({ params: Promise.resolve({ sessionId: 's1' }) }))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Algebraic expressions')
    expect(document.body.textContent).toContain('Mon 16 Nov · 4 of 5 right')
    expect(document.body.textContent).toContain('You wrote')
    expect(document.body.textContent).toContain('Right answer')
    expect(document.body.textContent).toContain('Why:')
    expect(document.body.textContent).toContain('Adding nothing changes nothing.')
    expect(document.body.textContent).toContain('The right way')
    expect(document.body.textContent).not.toContain('You finished')
  })

  it('has no button that changes anything: a read-only screen with one way back', async () => {
    state.result = result
    render(await PastResultsPage({ params: Promise.resolve({ sessionId: 's1' }) }))
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByRole('link', { name: 'Back to My maths' }).getAttribute('href')).toBe('/k/maths')
  })

  it('from the hand-back screen the way back is the hand-back screen', async () => {
    state.result = result
    render(await PastResultsPage({ params: Promise.resolve({ sessionId: 's1' }), searchParams: Promise.resolve({ from: 'done' }) }))
    expect(screen.getByRole('link', { name: 'Back' }).getAttribute('href')).toBe('/k/done')
  })

  it('a practice with every answer right says there is nothing to go over', async () => {
    state.result = { ...result, score: '5 of 5 right', missed: [] }
    render(await PastResultsPage({ params: Promise.resolve({ sessionId: 's1' }) }))
    expect(document.body.textContent).toContain('There is nothing to go over this time.')
  })

  it('a practice with no saved answers says so', async () => {
    state.result = { ...result, missed: [], hasAnswers: false }
    render(await PastResultsPage({ params: Promise.resolve({ sessionId: 's1' }) }))
    expect(document.body.textContent).toContain('Jemma has no saved answers for this practice.')
    expect(document.body.textContent).not.toContain('nothing to go over')
  })

  it("a practice that is not the learner's own is not found", async () => {
    state.result = null
    await expect(PastResultsPage({ params: Promise.resolve({ sessionId: 'theirs' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('has no teacher or school and no em dash', async () => {
    state.result = result
    render(await PastResultsPage({ params: Promise.resolve({ sessionId: 's1' }) }))
    expect(document.body.textContent).not.toMatch(/teacher|school/i)
    expect(document.body.textContent).not.toContain(String.fromCharCode(0x2014))
  })
})

describe('the results screen after a practice is as it was', () => {
  it('greets the learner and has no extra line', () => {
    render(<Results firstName="Amina" missed={[missed]} />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('You finished, Amina!')
    expect(document.querySelector('[data-note]')).toBeNull()
  })
})
