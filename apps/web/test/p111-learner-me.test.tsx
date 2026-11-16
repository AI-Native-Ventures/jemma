import { cleanup, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// P111: Me, "I'm done for today" and the hand-back screen for a learner who signed up alone. Such a learner has a real email and a password, so the sign-out
// goes back to the email and password sign-in (not to the code and PIN screen), the line "A grown-up can change your PIN." is not shown (there is no PIN),
// and when a practice is over the screen does not ask the learner to pass the phone back to a grown-up: it offers the way back to the home.
// The client, the data and the router are stand-ins: no browser, no server, no database.

const state = vi.hoisted(() => ({
  email: 'naledi@example.test' as string | null,
  signedOut: 0,
  handback: null as unknown,
}))

vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`)
  },
  useRouter: () => ({ push: () => undefined, replace: () => undefined, refresh: () => undefined }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServer: async () => ({
    auth: {
      getUser: async () => ({ data: { user: state.email ? { id: 'login-1', email: state.email } : null } }),
      signOut: async () => {
        state.signedOut += 1
        return { error: null }
      },
    },
  }),
}))
vi.mock('@/lib/data/p28', () => ({ getChildName: async () => ({ firstName: 'Naledi', initial: 'N' }) }))
vi.mock('@/lib/data/p27', () => ({ getHandback: async () => state.handback }))
vi.mock('../app/k/me/actions', () => ({ signOutChild: async () => undefined }))

import { isCodeLoginEmail } from '../lib/child-login'
import { MeForm } from '../app/k/me/MeForm'
import ChildAccountPage from '../app/k/me/page'
import HandbackPage from '../app/k/done/page'

beforeEach(() => {
  cleanup()
  state.email = 'naledi@example.test'
  state.signedOut = 0
  state.handback = { firstName: 'Naledi', minutes: 12, relation: 'your grown-up', parentName: 'your grown-up', alone: true }
})

describe('isCodeLoginEmail', () => {
  it('is true for the made-up email of a code and PIN login, and false for a real email', () => {
    expect(isCodeLoginEmail('abc234@kids.jemma.invalid')).toBe(true)
    expect(isCodeLoginEmail('ABC234@KIDS.JEMMA.INVALID')).toBe(true)
    expect(isCodeLoginEmail('naledi@example.test')).toBe(false)
    expect(isCodeLoginEmail('')).toBe(false)
    expect(isCodeLoginEmail(null)).toBe(false)
    expect(isCodeLoginEmail(undefined)).toBe(false)
  })
})

describe('"I\'m done for today"', () => {
  it('signs a learner who signed up alone out and goes to the email and password sign-in', async () => {
    const { signOutChild } = await vi.importActual<typeof import('../app/k/me/actions')>('../app/k/me/actions')
    await expect(signOutChild()).rejects.toThrow('REDIRECT /sign-in')
    expect(state.signedOut).toBe(1)
  })

  it('signs a learner with a code out and goes to the code and PIN sign-in, as it always did', async () => {
    state.email = 'abc234@kids.jemma.invalid'
    const { signOutChild } = await vi.importActual<typeof import('../app/k/me/actions')>('../app/k/me/actions')
    await expect(signOutChild()).rejects.toThrow('REDIRECT /k/sign-in')
    expect(state.signedOut).toBe(1)
  })
})

describe('Me', () => {
  it('a learner with a code still reads "A grown-up can change your PIN."', () => {
    render(<MeForm firstName="Amina" initial="A" />)
    expect(screen.getByText('A grown-up can change your PIN.')).toBeTruthy()
    cleanup()
    render(<MeForm firstName="Amina" initial="A" hasPin />)
    expect(screen.getByText('A grown-up can change your PIN.')).toBeTruthy()
  })

  it('a learner who signed up alone has no PIN and so no line about one', () => {
    render(<MeForm firstName="Naledi" initial="N" hasPin={false} />)
    expect(screen.queryByText(/PIN|grown-up/)).toBeNull()
    expect(screen.getByRole('button', { name: "I'm done for today" })).toBeTruthy()
  })

  it('the page gives the form no PIN line for a real email and keeps it for a code login', async () => {
    render(await ChildAccountPage())
    expect(screen.queryByText('A grown-up can change your PIN.')).toBeNull()
    cleanup()
    state.email = 'abc234@kids.jemma.invalid'
    render(await ChildAccountPage())
    expect(screen.getByText('A grown-up can change your PIN.')).toBeTruthy()
  })
})

describe('the hand-back screen', () => {
  it('for a learner who is on their own it says well done and offers the way back to the home, with no grown-up and no hold button', async () => {
    render(await HandbackPage())
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('All done, Naledi!')
    expect(document.body.textContent).toContain('You worked for 12 minutes tonight.')
    expect(document.body.textContent).not.toMatch(/pass the phone|grown-up|For your/i)
    const back = screen.getByRole('link', { name: 'Back to my Jemma' })
    expect(back.getAttribute('href')).toBe('/k')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('the way back is tall and has room at the sides', async () => {
    render(await HandbackPage())
    const classes = screen.getByRole('link', { name: 'Back to my Jemma' }).className.split(/\s+/)
    expect(classes.some((c) => c.startsWith('min-h-'))).toBe(true)
    expect(classes.some((c) => /^px-(4|5|6)$/.test(c))).toBe(true)
  })

  it('for a child whose grown-up has the phone it is as it always was: pass the phone back, and the hold button', async () => {
    state.handback = { firstName: 'Amina', minutes: 10, relation: 'your mum', parentName: 'Zanele', alone: false }
    render(await HandbackPage())
    expect(document.body.textContent).toContain('Now pass the phone back to your mum.')
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('For Zanele')
    expect(screen.queryByRole('link', { name: 'Back to my Jemma' })).toBeNull()
  })

  it('has no em dash', async () => {
    render(await HandbackPage())
    expect(document.body.textContent).not.toContain(String.fromCharCode(0x2014))
  })
})
