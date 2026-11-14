import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// "Make a sign-in code for {name}" on the page of a child on their own (P99): the parent picks a 4-digit PIN, the server makes the code, and the card shows
// the code. A new code asks the parent first and says the old one stops working. The server action and the router are doubles.

const state = vi.hoisted(() => ({ calls: [] as [string, string][], answer: { ok: true, code: 'K7M2QX' } as { ok: boolean; code?: string; error?: string }, refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: state.refresh, push: vi.fn() }) }))
vi.mock('../app/p/[childId]/settings/actions', () => ({
  setChildPin: async (childId: string, pin: string) => {
    state.calls.push([childId, pin])
    return state.answer
  },
}))

import { SignInCard } from '../app/p/[childId]/SignInCard'

beforeEach(() => {
  cleanup()
  state.calls = []
  state.answer = { ok: true, code: 'K7M2QX' }
  state.refresh.mockClear()
})

const pinBox = () => screen.getByLabelText('Choose a 4-digit PIN') as HTMLInputElement

describe('making the first sign-in code', () => {
  it('says what it is for, with no code on the card and one button', () => {
    render(<SignInCard childId="child-1" name="Kagiso" code={null} />)
    expect(screen.getByRole('heading', { name: "Kagiso's sign-in" })).toBeTruthy()
    expect(screen.getByText(/Make a code so Kagiso can sign in on their own phone/)).toBeTruthy()
    expect(screen.queryByLabelText(/code is/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Make a sign-in code for Kagiso' })).toBeTruthy()
  })

  it('opens a sheet that asks for 4 digits (letters are dropped), and the button waits for all four', () => {
    render(<SignInCard childId="child-1" name="Kagiso" code={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Make a sign-in code for Kagiso' }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.change(pinBox(), { target: { value: '12ab3' } })
    expect(pinBox().value).toBe('123')
    expect((screen.getByRole('button', { name: 'Make the code' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(pinBox(), { target: { value: '1234' } })
    expect((screen.getByRole('button', { name: 'Make the code' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('asks the server for this child with the PIN, shows the code it makes and asks the page to look again', async () => {
    render(<SignInCard childId="child-1" name="Kagiso" code={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Make a sign-in code for Kagiso' }))
    fireEvent.change(pinBox(), { target: { value: '4321' } })
    fireEvent.click(screen.getByRole('button', { name: 'Make the code' }))
    await waitFor(() => expect(state.calls).toEqual([['child-1', '4321']]))
    expect((await screen.findByLabelText("Kagiso's code is K7M2QX")).textContent).toBe('K7M2QX')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(state.refresh).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Make a new code' })).toBeTruthy()
  })

  it('a refusal stays in the sheet, in the server’s words, and shows no code', async () => {
    state.answer = { ok: false, error: 'You can only change your own child.' }
    render(<SignInCard childId="child-1" name="Kagiso" code={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Make a sign-in code for Kagiso' }))
    fireEvent.change(pinBox(), { target: { value: '4321' } })
    fireEvent.click(screen.getByRole('button', { name: 'Make the code' }))
    expect(await screen.findByText('You can only change your own child.')).toBeTruthy()
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.queryByLabelText(/code is/)).toBeNull()
  })
})

describe('a code that was made before', () => {
  it('shows it, says where it is used, and the sheet for a new one says the old code stops working', () => {
    render(<SignInCard childId="child-1" name="Kagiso" code="K7M2QX" />)
    expect(screen.getByLabelText("Kagiso's code is K7M2QX")).toBeTruthy()
    expect(screen.getByText(/signs in on their own phone with this code and the PIN you chose/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Make a new code' }))
    expect(screen.getByText('Kagiso will sign in with the new code. The old code stops working.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Save new code' })).toBeTruthy()
  })

  it('speaks of no school and no teacher, and has no em dash', () => {
    render(<SignInCard childId="child-1" name="Kagiso" code={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Make a sign-in code for Kagiso' }))
    expect(document.body.textContent).not.toMatch(/school|teacher/i)
    expect(document.body.textContent).not.toContain(String.fromCharCode(0x2014))
  })
})
