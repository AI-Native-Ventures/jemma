import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// P111: a learner can sign up alone. The role page has a real "Learner" button for every grade, 1 to 12 (no "Grade 8 to 12", no "coming soon"), and the
// sign-up page says learners can sign up too. react-dom only: no browser, no server, no database (the sign-in check and the actions are stand-ins).

const state = vi.hoisted(() => ({ user: { id: 'u1' } as { id: string } | null, role: null as 'teacher' | 'parent' | 'learner' | null }))

vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`)
  },
  useRouter: () => ({ replace: () => undefined, refresh: () => undefined, push: () => undefined }),
}))
vi.mock('@/lib/auth', () => ({ chooseRole: async () => undefined }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServer: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.role ? { role: state.role } : null }) }) }) }),
  }),
}))
vi.mock('../app/(auth)/actions', () => ({ makeAccount: async () => undefined }))

import RolePage from '../app/(auth)/role/page'
import SignUpPage from '../app/(auth)/sign-up/page'

beforeEach(() => {
  state.user = { id: 'u1' }
  state.role = null
})

/** What the server sends for a page: its HTML, as a document, before any script has run. */
async function pageOf(page: Promise<React.ReactElement> | React.ReactElement) {
  const el = document.createElement('div')
  el.innerHTML = renderToString(await page)
  // The server adds one small script that replays a form sent before the page woke up: it is not words on the page.
  el.querySelectorAll('script, style').forEach((node) => node.remove())
  return el
}

const learnerButton = (root: ParentNode) => [...root.querySelectorAll('button')].find((b) => /^Learner/.test(b.textContent ?? ''))

describe('the role page', () => {
  it('has a real Learner button with the line "I practise maths at any grade, 1 to 12."', async () => {
    const page = await pageOf(RolePage())
    const button = learnerButton(page)
    expect(button, 'a button "Learner"').toBeTruthy()
    expect(button!.textContent).toContain('Learner')
    expect(button!.textContent).toContain('I practise maths at any grade, 1 to 12.')
    expect(button!.getAttribute('type')).toBe('submit')
  })

  it('the Learner button opens the grade screen: it is in a form that goes to /role/learner', async () => {
    const page = await pageOf(RolePage())
    const form = learnerButton(page)!.closest('form')!
    expect(form).toBeTruthy()
    expect(form.getAttribute('action')).toBe('/role/learner')
  })

  it('says nothing of Grade 8 to 12 and nothing of coming soon', async () => {
    const page = await pageOf(RolePage())
    expect(page.textContent).not.toMatch(/Grade 8 to 12|8 to 12/)
    expect(page.textContent).not.toMatch(/coming soon|coming after|not in this version/i)
    expect(page.textContent).not.toContain('I fix my own gaps with my Jemma.')
  })

  it('keeps the Teacher and Parent buttons as they were, and the Learner button comes last', async () => {
    const page = await pageOf(RolePage())
    // Each button is a tile, the title and the line under it, and an arrow: the title is the first span inside a span.
    const titles = [...page.querySelectorAll('nav button')].map((b) => b.querySelector('span > span')?.textContent)
    expect(titles).toEqual(['Teacher', 'Parent', 'Learner'])
    expect(page.textContent).toContain("I snap my class's tests and see what they don't get yet.")
    expect(page.textContent).toContain("I support my child at home and want to know they're okay.")
  })

  it('keeps the way in with a code for a learner who was given one, and no longer says a learner needs a code', async () => {
    const page = await pageOf(RolePage())
    expect(page.textContent).toContain('Got a code from a parent or teacher?')
    const link = [...page.querySelectorAll('a')].find((a) => a.textContent === 'Sign in with your code')
    expect(link?.getAttribute('href')).toBe('/k/sign-in')
    expect(page.textContent).not.toContain('Learners sign in with a code from a parent or teacher.')
  })

  it('has no em dash', async () => {
    const page = await pageOf(RolePage())
    expect(page.textContent).not.toContain(String.fromCharCode(0x2014))
  })

  it('a person who is not signed in goes to sign in, and a person with a role goes home (a learner to /k)', async () => {
    state.user = null
    await expect(RolePage()).rejects.toThrow('REDIRECT /sign-in')
    state.user = { id: 'u1' }
    state.role = 'learner'
    await expect(RolePage()).rejects.toThrow('REDIRECT /k')
    state.role = 'teacher'
    await expect(RolePage()).rejects.toThrow('REDIRECT /t')
  })
})

describe('the sign-up page', () => {
  it('says learners can sign up too, and that a learner with a code can sign in with it', async () => {
    const page = await pageOf(SignUpPage())
    expect(page.textContent).toContain('For teachers, parents and learners.')
    expect(page.textContent).toContain('Got a code from a parent or teacher? Learners can sign in with it instead.')
    expect(page.textContent).not.toMatch(/For teachers and parents\./)
    expect(page.textContent).not.toContain(String.fromCharCode(0x2014))
  })
})
