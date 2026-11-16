import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AloneSummary } from '../lib/data/own-parent'

// A parent links to a learner who signed up alone (P114), the screens. On Me the learner's card "Link a parent" (a code, the line that says what to do with
// it, "Make a new code"); on Add a child the third way "My child has a code from their own Jemma" (one box, "Link my child"); on the child's page a learner
// who has a login of their own has no "Make a sign-in code" button (it would take the login away). The actions and the data are doubles.

const state = vi.hoisted(() => ({
  made: [] as string[],
  makeAnswer: { ok: true, code: 'K7M2QX' } as { ok: true; code: string } | { ok: false; message: string },
  linked: [] as { code: string }[],
  linkAnswer: { ok: false, message: 'That code is not right. Check it with your child.' } as { ok: false; message: string },
  summary: null as unknown,
}))

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/p/child-1',
}))
vi.mock('../app/k/me/parent-code-actions', () => ({
  makeMyParentCode: async () => {
    state.made.push('made')
    return state.makeAnswer
  },
}))
vi.mock('../app/p/add/link-actions', () => ({
  linkChildWithCode: async (input: { code: string }) => {
    state.linked.push(input)
    return state.linkAnswer
  },
}))
vi.mock('@/lib/auth', () => ({ requireRole: async () => ({ userId: 'parent-1', profile: { display_name: 'Zanele M' } }) }))
vi.mock('@/lib/data/own-parent', () => ({ getAloneSummary: async () => state.summary }))
vi.mock('@/lib/data/p23', () => ({ getProfile: async () => null }))
vi.mock('@/lib/data/p36', () => ({ getProfileExtras: async () => ({}) }))
vi.mock('@/lib/data/p52', () => ({ getSharedLongView: async () => null }))
vi.mock('@/lib/data/p22', async (orig) => ({ ...(await orig<typeof import('../lib/data/p22')>()), findClass: async () => null }))
vi.mock('../app/p/add/actions', () => ({ addChildAlone: vi.fn(), findClass: vi.fn(), requestLink: vi.fn() }))
vi.mock('../app/p/[childId]/learn/handover/own-actions', () => ({ startOwnPractice: async () => undefined }))
vi.mock('../app/p/[childId]/settings/actions', () => ({ setChildPin: async () => ({ ok: true, code: 'K7M2QX' }) }))

import { ParentCodeCard } from '../app/k/me/ParentCodeCard'
import { LinkChildCode, LINK_LABEL } from '../app/p/add/LinkChildCode'
import AddChildPage from '../app/p/add/page'
import ParentProfilePage from '../app/p/[childId]/page'

beforeEach(() => {
  cleanup()
  state.made = []
  state.makeAnswer = { ok: true, code: 'K7M2QX' }
  state.linked = []
  state.linkAnswer = { ok: false, message: 'That code is not right. Check it with your child.' }
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener: () => undefined, removeEventListener: () => undefined })) as unknown as typeof window.matchMedia
})

const body = () => document.body.textContent ?? ''

describe('"Link a parent" on Me', () => {
  it('with no code yet: says what a parent can do and has one button, "Make a code", and no code on the screen', () => {
    render(<ParentCodeCard initial={null} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Link a parent' })).toBeTruthy()
    expect(body()).toContain('A parent or guardian can follow how you practise, and practise with you.')
    expect(screen.getByRole('button', { name: 'Make a code' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Make a new code' })).toBeNull()
    expect(screen.queryByLabelText(/Your code for a parent is/)).toBeNull()
  })

  it('tapping "Make a code" asks for one and shows it with the line "Give this code to your parent or guardian. It works for 7 days." and "Make a new code"', async () => {
    render(<ParentCodeCard initial={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Make a code' }))
    await waitFor(() => expect(screen.getByLabelText('Your code for a parent is K7M2QX')).toBeTruthy())
    expect(screen.getByLabelText('Your code for a parent is K7M2QX').textContent).toBe('K7M2QX')
    expect(body()).toContain('Give this code to your parent or guardian. It works for 7 days.')
    // The button is still "Making your code" for a moment after the code shows, so wait for its last label.
    expect(await screen.findByRole('button', { name: 'Make a new code' })).toBeTruthy()
    expect(state.made).toEqual(['made'])
  })

  it('a code the learner already has is shown at once, and "Make a new code" replaces it', async () => {
    render(<ParentCodeCard initial="AB23CD" />)
    expect(screen.getByLabelText('Your code for a parent is AB23CD')).toBeTruthy()
    state.makeAnswer = { ok: true, code: 'ZZ89YY' }
    fireEvent.click(screen.getByRole('button', { name: 'Make a new code' }))
    await waitFor(() => expect(screen.getByLabelText('Your code for a parent is ZZ89YY')).toBeTruthy())
    expect(screen.queryByLabelText('Your code for a parent is AB23CD')).toBeNull()
    expect(await screen.findByRole('button', { name: 'Make a new code' })).toBeTruthy()
  })

  it('a refusal is said in words and the code on the screen stays', async () => {
    render(<ParentCodeCard initial="AB23CD" />)
    state.makeAnswer = { ok: false, message: 'Could not make a code. Try again.' }
    fireEvent.click(screen.getByRole('button', { name: 'Make a new code' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Could not make a code. Try again.'))
    expect(screen.getByLabelText('Your code for a parent is AB23CD')).toBeTruthy()
  })

  it('has no em dash', () => {
    render(<ParentCodeCard initial="AB23CD" />)
    expect(body()).not.toContain(String.fromCharCode(0x2014))
  })
})

describe('the third way on "Add a child"', () => {
  it('is one button under the class code form and "My child\'s school doesn\'t use Jemma", closed at first', async () => {
    render(await AddChildPage({ searchParams: Promise.resolve({}) }))
    const buttons = screen.getAllByRole('button').map((b) => b.textContent)
    const alone = buttons.indexOf("My child's school doesn't use Jemma")
    const code = buttons.indexOf('My child has a code from their own Jemma')
    expect(alone).toBeGreaterThan(-1)
    expect(code).toBeGreaterThan(alone)
    expect(LINK_LABEL).toBe('My child has a code from their own Jemma')
    expect(screen.getByRole('button', { name: LINK_LABEL }).getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByLabelText("Your child's code")).toBeNull()
  })

  it('opens a form with one box and "Link my child"', () => {
    render(<LinkChildCode />)
    fireEvent.click(screen.getByRole('button', { name: LINK_LABEL }))
    expect(screen.getByRole('button', { name: LINK_LABEL }).getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByLabelText("Your child's code")).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Link my child' })).toBeTruthy()
  })

  it('asks the action with the code as typed', async () => {
    render(<LinkChildCode />)
    fireEvent.click(screen.getByRole('button', { name: LINK_LABEL }))
    fireEvent.change(screen.getByLabelText("Your child's code"), { target: { value: 'k7m2qx' } })
    fireEvent.click(screen.getByRole('button', { name: 'Link my child' }))
    await waitFor(() => expect(state.linked).toEqual([{ code: 'k7m2qx' }]))
  })

  it('checks the empty box first, in words, and does not ask the server', () => {
    render(<LinkChildCode />)
    fireEvent.click(screen.getByRole('button', { name: LINK_LABEL }))
    fireEvent.click(screen.getByRole('button', { name: 'Link my child' }))
    expect(screen.getByRole('alert').textContent).toBe('Type the code your child gave you.')
    expect(state.linked).toEqual([])
  })

  it('says a refusal of the server in its own words and keeps what was typed', async () => {
    render(<LinkChildCode />)
    fireEvent.click(screen.getByRole('button', { name: LINK_LABEL }))
    fireEvent.change(screen.getByLabelText("Your child's code"), { target: { value: 'ZZZZZZ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Link my child' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('That code is not right. Check it with your child.'))
    expect((screen.getByLabelText("Your child's code") as HTMLInputElement).value).toBe('ZZZZZZ')
  })

  it('says nothing of a teacher or a school, and uses no em dash', () => {
    render(<LinkChildCode />)
    fireEvent.click(screen.getByRole('button', { name: LINK_LABEL }))
    expect(body()).not.toMatch(/teacher|school/i)
    expect(body()).not.toContain(String.fromCharCode(0x2014))
  })
})

const summary = (over: Partial<AloneSummary> = {}): AloneSummary => ({
  id: 'child-1',
  firstName: 'Neo',
  grade: 5,
  grades: [{ classId: 'c5', grade: 5, name: 'Grade 5 (my own)', caps: true, topics: 40, score: { right: 3, asked: 5 } }],
  loginCode: null,
  ...over,
})

describe('the page of the learner a parent linked with a code', () => {
  it('shows the child: the name, "Practising on their own", the grade and the practice button', async () => {
    state.summary = summary({ ownLogin: true })
    render(await ParentProfilePage({ params: Promise.resolve({ childId: 'child-1' }) }))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Neo')
    expect(screen.getByText('Practising on their own')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Practise at home with Neo' })).toBeTruthy()
  })

  it('has no "Make a sign-in code" button for a learner with a login of their own, and says why in one line', async () => {
    state.summary = summary({ ownLogin: true })
    render(await ParentProfilePage({ params: Promise.resolve({ childId: 'child-1' }) }))
    expect(screen.queryByRole('button', { name: /sign-in code/i })).toBeNull()
    expect(body()).toContain('Neo signs in with their own account, so there is no code for you to make.')
  })

  it('a child with no login of their own still has the button, as before', async () => {
    state.summary = summary()
    render(await ParentProfilePage({ params: Promise.resolve({ childId: 'child-1' }) }))
    expect(screen.getByRole('button', { name: 'Make a sign-in code for Neo' })).toBeTruthy()
    expect(body()).not.toContain('signs in with their own account')
  })
})
