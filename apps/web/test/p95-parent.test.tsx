import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LearnData } from '../lib/data/p25'

// The parent's Learn screen (P95): beside "Start, then hand {name} the phone" there is one more button, "Practise at home with {name}", which
// starts the hand-over with the workspace set to My own. It is there with a session tonight and with none, on the phone and on the laptop.
// A parent never sees the learner's private workspace as a second child. The data and the actions are doubles.

const state = vi.hoisted(() => ({ learn: null as unknown, matches: false, started: [] as string[] }))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/p/child-1/learn',
}))
vi.mock('@/lib/data/p25', async (orig) => ({ ...(await orig<typeof import('../lib/data/p25')>()), loadLearn: async () => state.learn }))
vi.mock('../app/p/[childId]/learn/handover/own-actions', () => ({
  startOwnPractice: async (childId: string) => {
    state.started.push(childId)
  },
}))

import ParentLearnPage from '../app/p/[childId]/learn/page'
import { OwnPracticeCard } from '../app/p/[childId]/learn/OwnPracticeCard'

const tonight = {
  id: 's1', plannedFor: '2026-11-16', topicId: 't1', topicName: 'Adding fractions with different denominators', shortName: 'Adding fractions', format: 'diagram' as const,
  minutes: 12, questions: 6, hasLesson: true, status: 'planned' as const, quickCheck: false, withPhrase: 'fraction bars', whyTonight: null,
}
const learn = (over: Partial<LearnData> = {}): LearnData => ({
  childFirstName: 'Amina',
  tonight,
  week: [tonight],
  helps: { family: 'fractions', rows: [{ format: 'reading', status: 'too_early', average: 0, sessions: 1 }] },
  ...over,
})
const page = async () => render(await ParentLearnPage({ params: Promise.resolve({ childId: 'child-1' }) }))

beforeEach(() => {
  state.learn = learn()
  state.started = []
  window.matchMedia = ((q: string) => ({ matches: state.matches, media: q, addEventListener: () => undefined, removeEventListener: () => undefined })) as unknown as typeof window.matchMedia
  state.matches = false
})

describe('the parent\'s Learn screen on the phone', () => {
  it('has the Start button as before and, beside it, "Practise at home with Amina"', async () => {
    await page()
    expect(screen.getByRole('link', { name: /Start, then hand Amina the phone/ }).getAttribute('href')).toBe('/p/child-1/learn/handover')
    expect(screen.getByRole('button', { name: 'Practise at home with Amina' })).toBeTruthy()
  })

  it('has the button when nothing is planned tonight too', async () => {
    state.learn = learn({ tonight: null, week: [] })
    await page()
    expect(screen.getByText(/Nothing is planned yet/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Practise at home with Amina' })).toBeTruthy()
  })

  it('the button is a submit button of a form (a server action), so the hand-over starts on the server', async () => {
    await page()
    const button = screen.getByRole('button', { name: 'Practise at home with Amina' }) as HTMLButtonElement
    expect(button.type).toBe('submit')
    expect(button.closest('form')).toBeTruthy()
  })

  it('says in plain words that it does not change the school record, and uses no he or she', async () => {
    await page()
    const card = screen.getByRole('region', { name: 'Practise at home' })
    expect(card.textContent).toMatch(/school record/)
    expect(card.textContent).not.toMatch(/\b(he|she|his|her)\b/i)
    expect(card.textContent).not.toContain('—')
  })

  it('shows only one copy of the button (the laptop\'s is not drawn on the phone)', async () => {
    await page()
    expect(screen.getAllByRole('button', { name: 'Practise at home with Amina' })).toHaveLength(1)
  })

  it('does not list a second child: the parent sees one learner', async () => {
    await page()
    expect(document.body.textContent).not.toMatch(/\(my own\)|my own\b/i)
  })
})

describe('the parent\'s Learn screen on the laptop', () => {
  it('has the same button once', async () => {
    state.matches = true
    await page()
    expect(screen.getAllByRole('button', { name: 'Practise at home with Amina' })).toHaveLength(1)
  })
})

describe('the card', () => {
  it('names the learner in its button and binds the action to this child', () => {
    render(<OwnPracticeCard childId="child-1" name="Neo" />)
    expect(screen.getByRole('button', { name: 'Practise at home with Neo' })).toBeTruthy()
  })

  it('the button is tall, has room at the sides and may take a second line (the P90 rule)', () => {
    render(<OwnPracticeCard childId="child-1" name="Neo" />)
    const classes = screen.getByRole('button', { name: 'Practise at home with Neo' }).className.split(/\s+/)
    expect(classes.some((c) => /^px-(5|6)$/.test(c))).toBe(true)
    expect(classes.some((c) => c.startsWith('min-h-'))).toBe(true)
    expect(classes.some((c) => /^h-\d|^h-\[/.test(c))).toBe(false)
  })
})
