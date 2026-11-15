import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// "My child's school doesn't use Jemma" (P99): under the class-code form one button opens a short form (first name, grade 1 to 12, country with South
// Africa first). It asks the server action with the name, the grade as a number and the country code, says a refusal in words, and checks the two things
// a parent can forget (the name, the grade) before it asks. The action and the router are doubles.

const state = vi.hoisted(() => ({ calls: [] as { firstName: string; grade: number; country: string }[], answer: { ok: true } as { ok: boolean; message?: string } }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('../app/p/add/actions', () => ({
  addChildAlone: async (input: { firstName: string; grade: number; country: string }) => {
    state.calls.push(input)
    return state.answer
  },
  findClass: vi.fn(),
  requestLink: vi.fn(),
}))

import { AddChildForm } from '../app/p/add/AddChildForm'
import { AloneForm } from '../app/p/add/AloneForm'
import { COUNTRIES } from '../lib/subjects'

beforeEach(() => {
  cleanup()
  state.calls = []
  state.answer = { ok: false, message: 'x' }
})

const open = () => fireEvent.click(screen.getByRole('button', { name: "My child's school doesn't use Jemma" }))

describe('the way in for a child whose school does not use Jemma', () => {
  it('is one button, closed at first, and opens the form when tapped', () => {
    render(<AloneForm />)
    const button = screen.getByRole('button', { name: "My child's school doesn't use Jemma" })
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByLabelText("Your child's first name")).toBeNull()
    fireEvent.click(button)
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByLabelText("Your child's first name")).toBeTruthy()
    expect(screen.getByLabelText('Grade')).toBeTruthy()
    expect(screen.getByLabelText('Country')).toBeTruthy()
  })

  it('has a grade select from 1 to 12 and a country select with South Africa first, then every country the app knows', () => {
    render(<AloneForm />)
    open()
    const grades = within(screen.getByLabelText('Grade')).getAllByRole('option').map((o) => o.textContent)
    expect(grades).toEqual(['Pick a grade', ...Array.from({ length: 12 }, (_, i) => `Grade ${i + 1}`)])
    const countries = within(screen.getByLabelText('Country')).getAllByRole('option').map((o) => o.textContent)
    expect(countries[0]).toBe('South Africa')
    expect(countries).toEqual(COUNTRIES.map((c) => c.name))
    expect((screen.getByLabelText('Country') as HTMLSelectElement).value).toBe('ZA')
  })

  it('asks the action with the name, the grade as a number and the country code', async () => {
    render(<AloneForm />)
    open()
    fireEvent.change(screen.getByLabelText("Your child's first name"), { target: { value: 'Kagiso' } })
    fireEvent.change(screen.getByLabelText('Grade'), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText('Country'), { target: { value: 'KE' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Kagiso' }))
    await waitFor(() => expect(state.calls).toEqual([{ firstName: 'Kagiso', grade: 5, country: 'KE' }]))
  })

  it('says a refusal of the server in its own words and keeps what was typed', async () => {
    state.answer = { ok: false, message: 'Keep the name under 40 letters.' }
    render(<AloneForm />)
    open()
    fireEvent.change(screen.getByLabelText("Your child's first name"), { target: { value: 'Kagiso' } })
    fireEvent.change(screen.getByLabelText('Grade'), { target: { value: '8' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Kagiso' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Keep the name under 40 letters.')
    expect((screen.getByLabelText("Your child's first name") as HTMLInputElement).value).toBe('Kagiso')
  })

  it('checks the name and the grade before it asks the server, one at a time', async () => {
    render(<AloneForm />)
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Add your child' }))
    expect(screen.getByRole('alert').textContent).toBe('Type your child’s first name.')
    fireEvent.change(screen.getByLabelText("Your child's first name"), { target: { value: 'Kagiso' } })
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Add Kagiso' }))
    expect(screen.getByRole('alert').textContent).toBe('Pick a grade from 1 to 12.')
    expect(state.calls).toEqual([])
  })

  it('every button has room: no fixed height without room at the sides, and the words may take a second line', () => {
    render(<AloneForm />)
    open()
    for (const button of screen.getAllByRole('button')) {
      expect(button.className).toMatch(/min-h-14/)
      expect(button.className).toMatch(/px-5/)
      expect(button.className).toMatch(/text-balance/)
      expect(button.className).not.toMatch(/(^|\s)h-\[/)
    }
  })

  it('speaks of no teacher and no class, and has no em dash', () => {
    render(<AloneForm />)
    open()
    expect(document.body.textContent).not.toMatch(/teacher|class code/i)
    expect(document.body.textContent).not.toContain(String.fromCharCode(0x2014))
  })

  it('on the add-a-child page it sits under the class-code form, which is still there', () => {
    render(<AddChildForm code="" child="" surname="" needsSurname={false} found={null} error={null} />)
    const classCode = screen.getByLabelText('Class code')
    const alone = screen.getByRole('button', { name: "My child's school doesn't use Jemma" })
    // The old link under the Link button went to this very page and did nothing: it is gone (P99b), and the button under "Or" is the way.
    expect(screen.queryByRole('link', { name: 'No code? Add your child yourself' })).toBeNull()
    expect(classCode.compareDocumentPosition(alone) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
