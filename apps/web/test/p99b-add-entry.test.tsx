import { cleanup, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The two ways in to "My child's school doesn't use Jemma" (P99b). The parent's start page and the add-a-child page both used to carry a link that
// went to /p/add, the page the parent was already on, so it did nothing. Now there is one path (/p/add?alone=1#alone), one wording, and the page opens
// the form at once when it is asked for. The sign-in, the data and the actions are doubles.

vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`)
  },
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/lib/auth', () => ({ requireRole: async () => ({ userId: 'parent-1', profile: { display_name: 'Zanele M' } }) }))
vi.mock('@/lib/demo', () => ({ getDemoState: async () => null }))
vi.mock('@/lib/data/p22', async (orig) => ({
  ...(await orig<typeof import('../lib/data/p22')>()),
  getParentHome: async () => ({ kind: 'none' }),
  findClass: async () => null,
}))
vi.mock('../app/p/add/actions', () => ({ addChildAlone: vi.fn(), findClass: vi.fn(), requestLink: vi.fn() }))

import ParentHomePage from '../app/p/page'
import AddChildPage from '../app/p/add/page'
import { ALONE_HINT, ALONE_HREF, ALONE_LABEL } from '../app/p/add/alone'

/** The start page is a server component that holds another async server component (`Start`): ask it for its own markup, then draw that. */
const start = async () => {
  const page = (await ParentHomePage({ searchParams: Promise.resolve({}) })) as { type: (props: unknown) => Promise<React.ReactElement>; props: unknown }
  return render(await page.type(page.props))
}
const add = async (q: Record<string, string> = {}) => render(await AddChildPage({ searchParams: Promise.resolve(q) }))

beforeEach(() => cleanup())

describe('the one path and the one wording', () => {
  it('the path is /p/add with a flag and an anchor, the label is the one the form button has, and the hint speaks of no class code', () => {
    expect(ALONE_HREF).toBe('/p/add?alone=1#alone')
    expect(ALONE_LABEL).toBe("My child's school doesn't use Jemma")
    expect(ALONE_HINT).toMatch(/no class code/i)
    expect(`${ALONE_LABEL} ${ALONE_HINT}`).not.toMatch(/teacher|\b(he|she|his|her)\b/i)
  })
})

describe('the parent’s start page', () => {
  it('has a link to the form, with the label and the hint, and it goes to the page that opens the form (not to /p/add itself)', async () => {
    await start()
    const link = screen.getByRole('link', { name: new RegExp(ALONE_LABEL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })
    expect(link.getAttribute('href')).toBe(ALONE_HREF)
    expect(link.getAttribute('href')).not.toBe('/p/add')
    expect(link.textContent).toContain(ALONE_HINT)
  })

  it('has no link that goes to /p/add and does nothing, and no longer says the teacher can be linked later', async () => {
    await start()
    for (const a of screen.getAllByRole('link')) expect(a.getAttribute('href'), a.textContent ?? '').not.toBe('/p/add')
    expect(document.body.textContent).not.toMatch(/Add your child without a code|link their teacher later/)
  })

  it('the class code form still goes to /p/add with the code', async () => {
    await start()
    const form = screen.getByLabelText('Class code').closest('form')!
    expect(form.getAttribute('action')).toBe('/p/add')
    expect(form.getAttribute('method')).toBe('get')
  })
})

describe('the add-a-child page', () => {
  it('with ?alone=1 has the form open at once, under the anchor the start page links to', async () => {
    await add({ alone: '1' })
    const button = screen.getByRole('button', { name: ALONE_LABEL })
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByLabelText("Your child's first name")).toBeTruthy()
    const anchor = new URL(ALONE_HREF, 'http://x').hash.slice(1)
    expect(document.getElementById(anchor)).toBeTruthy()
    expect(document.getElementById(anchor)!.contains(button)).toBe(true)
  })

  it('without the flag has the form closed, behind the same button', async () => {
    await add()
    const button = screen.getByRole('button', { name: ALONE_LABEL })
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByLabelText("Your child's first name")).toBeNull()
  })

  it('has no link to itself: the old "No code? Add your child yourself" is gone, and the button under "Or" is the way', async () => {
    await add()
    for (const a of screen.queryAllByRole('link')) expect(a.getAttribute('href'), a.textContent ?? '').not.toBe('/p/add')
    expect(screen.queryByRole('link', { name: 'No code? Add your child yourself' })).toBeNull()
    expect(screen.getByText('Or')).toBeTruthy()
  })

  it('the class code form is still the first thing, above the form for a child whose school does not use Jemma', async () => {
    await add({ alone: '1' })
    const classCode = screen.getByLabelText('Class code')
    const button = screen.getByRole('button', { name: ALONE_LABEL })
    expect(classCode.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
