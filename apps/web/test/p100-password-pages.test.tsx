import { act, fireEvent, render, screen } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// P100: the sign-up and sign-in pages ask for an email and a password. Under the sign-in form a small link, "Email me a code instead", keeps the
// code flow (for later, when an email sender is set up). react-dom only: no browser, no server, no database (the actions are stand-ins).

const state = vi.hoisted(() => ({
  signUpCalls: [] as FormData[],
  signInCalls: [] as FormData[],
  signUpReply: undefined as unknown,
  signInReply: undefined as unknown,
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: () => undefined, refresh: () => undefined, push: () => undefined }), redirect: () => undefined }))
vi.mock('../app/(auth)/actions', () => ({
  makeAccount: async (_prev: unknown, form: FormData) => (state.signUpCalls.push(form), state.signUpReply),
  signInWithPassword: async (_prev: unknown, form: FormData) => (state.signInCalls.push(form), state.signInReply),
  requestSignInCode: async () => undefined,
  resendCode: async () => undefined,
  checkCode: async () => undefined,
}))

import SignInPage from '../app/(auth)/sign-in/page'
import SignUpPage from '../app/(auth)/sign-up/page'
import CodePage from '../app/(auth)/sign-in/code/page'
import { SignInForm } from '../app/(auth)/sign-in/SignInForm'
import { CodeSignInForm } from '../app/(auth)/sign-in/CodeSignInForm'
import { SignUpForm } from '../app/(auth)/sign-up/SignUpForm'

const FAKE_PASSWORD = 'not-a-real-password-1'

beforeEach(() => {
  state.signUpCalls = []
  state.signInCalls = []
  state.signUpReply = undefined
  state.signInReply = undefined
})

/** What the server sends for a page: its HTML, as text, before any script has run. */
async function pageText(page: Promise<React.ReactElement>) {
  const el = document.createElement('div')
  el.innerHTML = renderToString(await page)
  return el
}

const field = (root: ParentNode, label: string) => {
  const l = [...root.querySelectorAll('label')].find((x) => x.textContent === label)
  expect(l, `a label "${label}"`).toBeTruthy()
  return root.querySelector(`#${l!.getAttribute('for')}`) as HTMLInputElement
}

describe('the sign-up form', () => {
  it('asks for a name, an email and a password, with the agreement box and one button, "Make my account"', () => {
    render(<SignUpForm />)
    expect((screen.getByLabelText('Your name') as HTMLInputElement).name).toBe('name')
    expect((screen.getByLabelText('Email') as HTMLInputElement).type).toBe('email')
    const password = screen.getByLabelText('Make a password, at least 8 characters') as HTMLInputElement
    expect(password.type).toBe('password')
    expect(password.name).toBe('password')
    expect(password.getAttribute('autocomplete')).toBe('new-password')
    expect(screen.getByRole('checkbox')).toBeTruthy()
    const buttons = screen.getAllByRole('button').map((b) => b.textContent)
    expect(buttons).toContain('Make my account')
    expect(buttons).not.toContain('Send me a code')
  })

  it('no longer says a code is emailed or that there is no password', () => {
    const { container } = render(<SignUpForm />)
    expect(container.textContent).not.toMatch(/6 digit|No password to remember|send me a code/i)
  })

  it('has a Show button that shows the password and a Hide button that hides it again', () => {
    render(<SignUpForm />)
    const password = screen.getByLabelText('Make a password, at least 8 characters') as HTMLInputElement
    fireEvent.click(screen.getByRole('button', { name: 'Show' }))
    expect(password.type).toBe('text')
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }))
    expect(password.type).toBe('password')
    // The button is a plain button: it never submits the form.
    expect((screen.getByRole('button', { name: 'Show' }) as HTMLButtonElement).type).toBe('button')
  })

  it('sends the name, the email, the password and the box to the action', async () => {
    render(<SignUpForm />)
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Ms Nkosi' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ms.nkosi@school.example' } })
    fireEvent.change(screen.getByLabelText('Make a password, at least 8 characters'), { target: { value: FAKE_PASSWORD } })
    fireEvent.click(screen.getByRole('checkbox'))
    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: 'Make my account' }).closest('form')!)
    })
    expect(state.signUpCalls).toHaveLength(1)
    const sent = state.signUpCalls[0]!
    expect(sent.get('name')).toBe('Ms Nkosi')
    expect(sent.get('email')).toBe('ms.nkosi@school.example')
    expect(sent.get('password')).toBe(FAKE_PASSWORD)
    expect(sent.get('agree')).toBe('on')
  })

  it('shows the action\'s plain line, and draws the name and the email again (never the password)', async () => {
    state.signUpReply = { error: 'Use at least 8 characters.', name: 'Ms Nkosi', email: 'ms.nkosi@school.example', agree: true }
    render(<SignUpForm />)
    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: 'Make my account' }).closest('form')!)
    })
    expect(screen.getByRole('alert').textContent).toBe('Use at least 8 characters.')
    expect((screen.getByLabelText('Your name') as HTMLInputElement).defaultValue).toBe('Ms Nkosi')
    expect((screen.getByLabelText('Email') as HTMLInputElement).defaultValue).toBe('ms.nkosi@school.example')
    expect((screen.getByRole('checkbox') as HTMLInputElement).defaultChecked).toBe(true)
    expect((screen.getByLabelText('Make a password, at least 8 characters') as HTMLInputElement).defaultValue).toBe('')
  })

  it('says "That email already has an account. Sign in instead." with a link to sign in, the email carried over', async () => {
    state.signUpReply = { error: 'That email already has an account. Sign in instead.', taken: true, name: 'Ms Nkosi', email: 'ms.nkosi@school.example', agree: true }
    render(<SignUpForm />)
    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: 'Make my account' }).closest('form')!)
    })
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toBe('That email already has an account. Sign in instead.')
    const link = alert.querySelector('a')!
    expect(link.textContent).toBe('Sign in instead.')
    expect(link.getAttribute('href')).toBe('/sign-in?email=ms.nkosi%40school.example')
  })
})

describe('the sign-up page', () => {
  it('keeps its heading, says learners can sign up too (P111), and links back to sign in', async () => {
    const page = await pageText(Promise.resolve(SignUpPage()))
    expect(page.querySelector('h1')!.textContent).toBe("Make your Jemma account. It's free for families.")
    expect(page.textContent).toContain('For teachers, parents and learners. Got a code from a parent or teacher? Learners can sign in with it instead.')
    expect(page.textContent).toContain('Make my account')
    expect(page.textContent).not.toMatch(/6 digit|No password to remember/i)
    expect(page.querySelector('a[href="/sign-in"]:not([aria-label])')!.textContent).toBe('Sign in')
  })
})

describe('the sign-in form', () => {
  it('asks for an email and a password, with a "Sign in" button', () => {
    render(<SignInForm />)
    const email = screen.getByLabelText('Email') as HTMLInputElement
    expect(email.type).toBe('email')
    expect(email.getAttribute('autocomplete')).toBe('email')
    const password = screen.getByLabelText('Password') as HTMLInputElement
    expect(password.type).toBe('password')
    expect(password.name).toBe('password')
    expect(password.getAttribute('autocomplete')).toBe('current-password')
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy()
  })

  it('has a Show button for the password, and the label "Password" belongs to the field alone', () => {
    render(<SignInForm />)
    const password = screen.getByLabelText('Password') as HTMLInputElement
    fireEvent.click(screen.getByRole('button', { name: 'Show' }))
    expect(password.type).toBe('text')
  })

  it('says what to do about a forgotten password, in words with no link', () => {
    const { container } = render(<SignInForm />)
    const line = screen.getByText("Forgot your password? Ask the person who set up your school's Jemma.")
    expect(line.closest('a')).toBeNull()
    expect(line.querySelector('a')).toBeNull()
    // And it offers no reset by email.
    expect(container.textContent).not.toMatch(/reset/i)
  })

  it('has a small link, "Email me a code instead", to the code flow', () => {
    render(<SignInForm />)
    const link = screen.getByRole('link', { name: 'Email me a code instead' })
    expect(link.getAttribute('href')).toBe('/sign-in?method=code')
  })

  it('no longer says there is no password to remember', () => {
    const { container } = render(<SignInForm />)
    expect(container.textContent).not.toMatch(/No password to remember|6 digit/i)
  })

  it('fills the email when it comes from the sign-up page', () => {
    render(<SignInForm email="ms.nkosi@school.example" />)
    expect((screen.getByLabelText('Email') as HTMLInputElement).defaultValue).toBe('ms.nkosi@school.example')
  })

  it('sends the email and the password to the action and shows "That email and password do not match."', async () => {
    state.signInReply = { error: 'That email and password do not match.', email: 'ms.nkosi@school.example' }
    render(<SignInForm />)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ms.nkosi@school.example' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: FAKE_PASSWORD } })
    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: 'Sign in' }).closest('form')!)
    })
    expect(state.signInCalls[0]!.get('email')).toBe('ms.nkosi@school.example')
    expect(state.signInCalls[0]!.get('password')).toBe(FAKE_PASSWORD)
    expect(screen.getByRole('alert').textContent).toBe('That email and password do not match.')
    expect((screen.getByLabelText('Email') as HTMLInputElement).defaultValue).toBe('ms.nkosi@school.example')
    expect((screen.getByLabelText('Password') as HTMLInputElement).defaultValue).toBe('')
  })
})

describe('the sign-in page', () => {
  const open = (search: { method?: string; email?: string } = {}) => pageText(Promise.resolve(SignInPage({ searchParams: Promise.resolve(search) })))

  it('shows the password form first, with the links to create an account and to the demo', async () => {
    const page = await open()
    expect(field(page, 'Password').type).toBe('password')
    expect(page.textContent).toContain('Forgot your password? Ask the person who set up your school')
    expect(page.querySelector('a[href="/sign-in?method=code"]')!.textContent).toBe('Email me a code instead')
    expect(page.textContent).not.toContain('Send me a sign-in code')
    expect(page.querySelector('a[href="/sign-up"]')!.textContent).toBe('Create an account')
    expect(page.querySelector('a[href="/demo"]')!.textContent).toContain('Try the demo')
  })

  it('fills the email from the link on the sign-up page', async () => {
    const page = await open({ email: 'ms.nkosi@school.example' })
    expect(field(page, 'Email').getAttribute('value')).toBe('ms.nkosi@school.example')
  })

  it('"Email me a code instead" opens the code flow: an email, "Send me a sign-in code", and a way back to the password', async () => {
    const page = await open({ method: 'code' })
    expect(field(page, 'Email').type).toBe('email')
    expect([...page.querySelectorAll('button')].map((b) => b.textContent)).toContain('Send me a sign-in code')
    expect(page.textContent).toContain('We email you a 6 digit code. This only works where Jemma can send email.')
    expect(page.querySelector('a[href="/sign-in"]')!.textContent).toBe('Use my password instead')
    expect([...page.querySelectorAll('label')].map((l) => l.textContent)).not.toContain('Password')
    expect(page.querySelector('a[href="/sign-up"]')!.textContent).toBe('Create an account')
  })
})

describe('the code form for sign-in', () => {
  it('is the code flow of before: an email and one button, "Send me a sign-in code"', () => {
    render(<CodeSignInForm />)
    expect((screen.getByLabelText('Email') as HTMLInputElement).type).toBe('email')
    expect(screen.getByRole('button', { name: 'Send me a sign-in code' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Use my password instead' }).getAttribute('href')).toBe('/sign-in')
  })
})

describe('the code screen', () => {
  it('is as before, and "Use a different email" goes back to the code form', async () => {
    const page = await pageText(CodePage({ searchParams: Promise.resolve({ email: 'ms.banda@hillview.example' }) }))
    expect(page.querySelector('h1')!.textContent).toBe('Check your email for a 6 digit code.')
    expect(page.textContent).toContain('We sent it to ms.banda@hillview.example. It works for 10 minutes.')
    expect([...page.querySelectorAll('a')].find((a) => a.textContent === 'Use a different email')!.getAttribute('href')).toBe('/sign-in?method=code')
  })
})
