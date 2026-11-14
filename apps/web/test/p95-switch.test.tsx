import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The switch at the top of the learner's home and of My maths: "My school" and "My own", the current one filled and marked (aria-pressed), and
// one line under it in My own. A tap calls `setWorkspace` and the screen stays where it is. The action and the router are doubles.

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }))
vi.mock('../app/k/own-actions', () => ({ setWorkspace: vi.fn(async () => ({ ok: true })), addMyGrade: vi.fn() }))

import { setWorkspace } from '../app/k/own-actions'
import { WorkspaceSwitch } from '../app/k/WorkspaceSwitch'

beforeEach(() => {
  refresh.mockClear()
  vi.mocked(setWorkspace).mockReset()
  vi.mocked(setWorkspace).mockResolvedValue({ ok: true })
})

describe('the switch in My school', () => {
  it('shows two buttons, My school and My own, with My school the one pressed', () => {
    render(<WorkspaceSwitch current="school" />)
    const group = screen.getByRole('group', { name: 'Where you practise' })
    const buttons = group.querySelectorAll('button')
    expect([...buttons].map((b) => b.textContent)).toEqual(['My school', 'My own'])
    expect(screen.getByRole('button', { name: 'My school' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'My own' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('says nothing about "your own practice" in My school', () => {
    render(<WorkspaceSwitch current="school" />)
    expect(screen.queryByText(/own practice/i)).toBeNull()
    expect(screen.queryByText(/Nothing here goes to your school/)).toBeNull()
  })

  it('the filled button is the pressed one and the other one is an outline', () => {
    render(<WorkspaceSwitch current="school" />)
    expect(screen.getByRole('button', { name: 'My school' }).className).toContain('bg-ink')
    expect(screen.getByRole('button', { name: 'My own' }).className).not.toContain('bg-ink')
  })
})

describe('the switch in My own', () => {
  it('has My own pressed and the one short line under it', () => {
    render(<WorkspaceSwitch current="own" />)
    expect(screen.getByRole('button', { name: 'My own' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'My school' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByText('Your own practice. Nothing here goes to your school.')).toBeTruthy()
    expect(screen.getAllByText(/Nothing here goes to your school/)).toHaveLength(1)
  })

  it('the two buttons are equal: the same size, the same room at the sides, the same grid cell width', () => {
    render(<WorkspaceSwitch current="own" />)
    const strip = (el: HTMLElement) => el.className.split(/\s+/).filter((c) => !/^(bg-|text-white|text-ink|border)/.test(c)).sort()
    expect(strip(screen.getByRole('button', { name: 'My school' }))).toEqual(strip(screen.getByRole('button', { name: 'My own' })))
    const group = screen.getByRole('group', { name: 'Where you practise' })
    expect(group.className).toContain('grid-cols-2')
  })

  it('the buttons have room at the sides and a minimum height, never a fixed one', () => {
    render(<WorkspaceSwitch current="own" />)
    for (const name of ['My school', 'My own']) {
      const classes = screen.getByRole('button', { name }).className.split(/\s+/)
      expect(classes.some((c) => /^px-(5|6)$/.test(c))).toBe(true)
      expect(classes.some((c) => c.startsWith('min-h-'))).toBe(true)
      expect(classes.some((c) => /^h-/.test(c))).toBe(false)
    }
  })
})

describe('a tap', () => {
  it('on the other workspace calls setWorkspace with its word and looks again, on the same screen', async () => {
    render(<WorkspaceSwitch current="school" />)
    fireEvent.click(screen.getByRole('button', { name: 'My own' }))
    expect(setWorkspace).toHaveBeenCalledWith('own')
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('from My own to My school calls setWorkspace("school")', async () => {
    render(<WorkspaceSwitch current="own" />)
    fireEvent.click(screen.getByRole('button', { name: 'My school' }))
    expect(setWorkspace).toHaveBeenCalledWith('school')
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('on the workspace that is already on screen does nothing', () => {
    render(<WorkspaceSwitch current="school" />)
    fireEvent.click(screen.getByRole('button', { name: 'My school' }))
    expect(setWorkspace).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('shows it is working and blocks a second tap while the action runs', async () => {
    let finish: (v: { ok: true }) => void = () => {}
    vi.mocked(setWorkspace).mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)))
    render(<WorkspaceSwitch current="school" />)
    fireEvent.click(screen.getByRole('button', { name: 'My own' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'My own' }).getAttribute('aria-busy')).toBe('true'))
    expect((screen.getByRole('button', { name: 'My own' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'My school' }) as HTMLButtonElement).disabled).toBe(true)
    finish({ ok: true })
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('a refusal is said in the action\'s plain words and the screen is not refreshed', async () => {
    vi.mocked(setWorkspace).mockResolvedValueOnce({ ok: false, message: 'Could not open My own. Try again.' })
    render(<WorkspaceSwitch current="school" />)
    fireEvent.click(screen.getByRole('button', { name: 'My own' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Could not open My own. Try again.')
    expect(refresh).not.toHaveBeenCalled()
  })
})
