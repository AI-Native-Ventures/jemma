import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// P111: the one short screen after "Learner": "Which grade are you in?", the grade (Grade 1 to Grade 12), the country (South Africa first, the same list as
// the parent's form) and one button, "Start practising". The action is a stand-in: no browser, no server, no database.

const state = vi.hoisted(() => ({
  calls: [] as { grade: number; country: string }[],
  reply: undefined as { ok: false; message: string } | undefined,
  user: { id: 'u1' } as { id: string } | null,
  role: null as 'teacher' | 'parent' | 'learner' | null,
}))

vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`)
  },
  useRouter: () => ({ replace: () => undefined, refresh: () => undefined, push: () => undefined }),
}))
vi.mock('../app/(auth)/role/learner/actions', () => ({
  startLearner: async (input: { grade: number; country: string }) => {
    state.calls.push(input)
    return state.reply
  },
}))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServer: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.role ? { role: state.role } : null }) }) }) }),
  }),
}))

import LearnerStartPage from '../app/(auth)/role/learner/page'
import { LearnerStartForm } from '../app/(auth)/role/learner/LearnerStartForm'
import { COUNTRIES } from '../lib/subjects'

beforeEach(() => {
  state.calls = []
  state.reply = undefined
  state.user = { id: 'u1' }
  state.role = null
})

async function pageOf(page: Promise<React.ReactElement>) {
  const el = document.createElement('div')
  el.innerHTML = renderToString(await page)
  // The server adds one small script that replays a form sent before the page woke up: it is not words on the page.
  el.querySelectorAll('script, style').forEach((node) => node.remove())
  return el
}

describe('the grade screen', () => {
  it('asks "Which grade are you in?", with a way back to the role screen', async () => {
    const page = await pageOf(LearnerStartPage())
    expect(page.querySelector('h1')!.textContent).toBe('Which grade are you in?')
    expect(page.querySelector('a[href="/role"]')).toBeTruthy()
  })

  it('has the grade as a select, Grade 1 to Grade 12, and the country as a select with South Africa first', () => {
    render(<LearnerStartForm />)
    const grade = screen.getByLabelText('Grade') as HTMLSelectElement
    const gradeOptions = [...grade.options].map((o) => o.textContent)
    expect(gradeOptions).toEqual(['Pick your grade', ...Array.from({ length: 12 }, (_, i) => `Grade ${i + 1}`)])
    expect(grade.value).toBe('')
    const country = screen.getByLabelText('Country') as HTMLSelectElement
    expect([...country.options].map((o) => o.textContent)).toEqual(COUNTRIES.map((c) => c.name))
    expect(country.options[0]!.textContent).toBe('South Africa')
    expect(country.value).toBe('ZA')
  })

  it('has one button, "Start practising"', () => {
    render(<LearnerStartForm />)
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Start practising'])
  })

  it('asks for no name, no age and no email, and says nothing of a teacher, a school or a parent', async () => {
    const page = await pageOf(LearnerStartPage())
    expect(page.querySelectorAll('input[type="text"], input[type="email"], input[type="number"], input[type="date"]')).toHaveLength(0)
    expect(page.textContent).not.toMatch(/teacher|school|parent|\bage\b|birth/i)
    expect(page.textContent).not.toContain(String.fromCharCode(0x2014))
  })

  it('a missing grade is refused in plain words before the action is asked', async () => {
    render(<LearnerStartForm />)
    fireEvent.click(screen.getByRole('button', { name: 'Start practising' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toBe('Pick your grade, from 1 to 12.')
    expect(state.calls).toEqual([])
  })

  it('asks the action with the grade as a number and the country code', async () => {
    render(<LearnerStartForm />)
    fireEvent.change(screen.getByLabelText('Grade'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start practising' }))
    await waitFor(() => expect(state.calls).toEqual([{ grade: 5, country: 'ZA' }]))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('sends the chosen country', async () => {
    render(<LearnerStartForm />)
    fireEvent.change(screen.getByLabelText('Grade'), { target: { value: '12' } })
    fireEvent.change(screen.getByLabelText('Country'), { target: { value: 'KE' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start practising' }))
    await waitFor(() => expect(state.calls).toEqual([{ grade: 12, country: 'KE' }]))
  })

  it('shows a refusal of the action as its own words', async () => {
    state.reply = { ok: false, message: 'Could not start your Jemma. Try again.' }
    render(<LearnerStartForm />)
    fireEvent.change(screen.getByLabelText('Grade'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start practising' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Could not start your Jemma. Try again.')
  })

  it('a person who is not signed in goes to sign in; a person who already has a role goes home', async () => {
    state.user = null
    await expect(LearnerStartPage()).rejects.toThrow('REDIRECT /sign-in')
    state.user = { id: 'u1' }
    state.role = 'learner'
    await expect(LearnerStartPage()).rejects.toThrow('REDIRECT /k')
    state.role = 'parent'
    await expect(LearnerStartPage()).rejects.toThrow('REDIRECT /p')
  })
})
