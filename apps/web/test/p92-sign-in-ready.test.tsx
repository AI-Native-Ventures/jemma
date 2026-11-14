import { act, fireEvent, render, screen } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

// P92: the learner's PIN keypad is never dead. A tap made before the page has hydrated used to be lost. Now the keypad and the Sign in button
// are drawn disabled (and dimmed) with the line "Getting ready..." until the form has mounted, and then they wake up. react-dom only: no
// browser, no server, no database (the sign-in action is mocked and never called).

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: () => undefined, refresh: () => undefined }) }))
vi.mock('@/lib/auth', () => ({ signInChild: async () => ({ ok: true }) }))

import { SignInForm } from '../app/k/sign-in/SignInForm'

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']

/** The page as the server sends it: the HTML string, before any script has run. */
function serverPage() {
  const el = document.createElement('div')
  el.innerHTML = renderToString(<SignInForm />)
  return el
}

const key = (root: ParentNode, name: string) => [...root.querySelectorAll('button')].find((b) => b.textContent === name || b.getAttribute('aria-label') === name) as HTMLButtonElement | undefined

afterEach(() => vi.restoreAllMocks())

describe('sign-in keypad before the page is ready (the server render)', () => {
  it('every digit key, the Delete key and Sign in are disabled', () => {
    const page = serverPage()
    for (const d of DIGITS) expect(key(page, d)?.disabled, `key ${d}`).toBe(true)
    expect(key(page, 'Delete')?.disabled, 'Delete').toBe(true)
    expect(key(page, 'Sign in')?.disabled, 'Sign in').toBe(true)
    // Nothing on the keypad is left active.
    expect([...page.querySelectorAll('button')].filter((b) => !b.disabled)).toEqual([])
  })

  it('says "Getting ready..." and not yet "0 of 4 digits typed"', () => {
    const page = serverPage()
    const status = page.querySelector('[role="status"]')!
    expect(status.textContent).toBe('Getting ready...')
    expect(page.textContent).not.toContain('digits typed')
  })

  it('shows the dimmed look of the kit (disabled:opacity-50) on the keys and on Sign in', () => {
    const page = serverPage()
    for (const d of DIGITS) expect(key(page, d)!.className, `key ${d}`).toContain('disabled:opacity-50')
    expect(key(page, 'Delete')!.className).toContain('disabled:opacity-50')
    expect(key(page, 'Sign in')!.className).toContain('disabled:opacity-50')
  })

  it('the keys are still found by their digit, and the code box is untouched', () => {
    const page = serverPage()
    expect(page.querySelector('input#code')).not.toBeNull()
    expect(page.querySelector('input#code')!.hasAttribute('disabled')).toBe(false)
    expect(page.querySelector('label[for="code"]')!.textContent).toBe('Your code')
  })
})

describe('sign-in keypad after the page has mounted', () => {
  it('every key and Sign in are enabled and the line reads "0 of 4 digits typed"', () => {
    render(<SignInForm />)
    // A string name matches the whole name (so "2" finds only the key 2).
    for (const d of DIGITS) expect((screen.getByRole('button', { name: d }) as HTMLButtonElement).disabled, `key ${d}`).toBe(false)
    expect((screen.getByRole('button', { name: 'Delete' }) as HTMLButtonElement).disabled).toBe(false)
    expect((screen.getByRole('button', { name: 'Sign in' }) as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByRole('status').textContent).toBe('0 of 4 digits typed')
    expect(screen.queryByText('Getting ready...')).toBeNull()
  })

  it('a tap now counts: 2 and 4 make "2 of 4 digits typed", Delete takes one back', () => {
    render(<SignInForm />)
    fireEvent.click(screen.getByRole('button', { name: '2' }))
    fireEvent.click(screen.getByRole('button', { name: '4' }))
    expect(screen.getByRole('status').textContent).toBe('2 of 4 digits typed')
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByRole('status').textContent).toBe('1 of 4 digits typed')
  })

  it('a page hydrated from the server HTML wakes up with no mismatch warning', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const container = document.createElement('div')
    document.body.appendChild(container)
    container.innerHTML = renderToString(<SignInForm />)
    expect(container.querySelector('[role="status"]')!.textContent).toBe('Getting ready...')
    await act(async () => {
      render(<SignInForm />, { container, hydrate: true })
    })
    expect(container.querySelector('[role="status"]')!.textContent).toBe('0 of 4 digits typed')
    expect([...container.querySelectorAll('button')].filter((b) => b.disabled)).toEqual([])
    expect(error).not.toHaveBeenCalled()
    container.remove()
  })
})
