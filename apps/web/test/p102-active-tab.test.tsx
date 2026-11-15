import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// P102: the highlighted tab follows the address in the browser. A layout does not draw again when a child taps a tab (the page changes, the layout
// stays), so the bar the layout drew first kept marking the old tab. The choice is now one pure function of (role, base, pathname), used by the
// server for the first paint and by the bar itself in the browser, which reads `usePathname()`. react-dom/server and pure functions: no browser,
// no database.

const state = vi.hoisted(() => ({ pathname: null as string | null }))
vi.mock('next/navigation', () => ({ usePathname: () => state.pathname }))

import { Sidebar, TabBar } from '@/components/blocks'
import { activeTabFor } from '@/components/blocks/nav'

beforeEach(() => {
  state.pathname = null
})

describe('activeTabFor: the tab for a role, a base and an address', () => {
  it('learner: Today for the home and for screens that are not My maths, My maths for its pages', () => {
    expect(activeTabFor('learner', '/k', '/k')).toBe('today')
    expect(activeTabFor('learner', '/k', '/k/maths')).toBe('maths')
    expect(activeTabFor('learner', '/k', '/k/maths/fractions')).toBe('maths')
    expect(activeTabFor('learner', '/k', '/k/maths/')).toBe('maths')
    expect(activeTabFor('learner', '/k', '/k/own')).toBe('today')
    expect(activeTabFor('learner', '/k', '/k/upload')).toBe('today')
  })

  it('parent: Profile for the child, then the tab whose folder the address is in', () => {
    const base = '/p/abc'
    expect(activeTabFor('parent', base, '/p/abc')).toBe('profile')
    expect(activeTabFor('parent', base, '/p/abc/learn')).toBe('learn')
    expect(activeTabFor('parent', base, '/p/abc/learn/handover')).toBe('learn')
    expect(activeTabFor('parent', base, '/p/abc/snap')).toBe('snap')
    expect(activeTabFor('parent', base, '/p/abc/snap/photo')).toBe('snap')
    expect(activeTabFor('parent', base, '/p/abc/tests')).toBe('tests')
    expect(activeTabFor('parent', base, '/p/abc/notifications')).toBe('profile')
    expect(activeTabFor('parent', base, '/p/abc/settings')).toBe('profile')
  })

  it('parent: a marked paper belongs to Tests and a session to Learn (the screens that were drawn with those tabs marked)', () => {
    expect(activeTabFor('parent', '/p/abc', '/p/abc/papers/p1')).toBe('tests')
    expect(activeTabFor('parent', '/p/abc', '/p/abc/papers/p1/flag')).toBe('tests')
    expect(activeTabFor('parent', '/p/abc', '/p/abc/sessions/s1')).toBe('learn')
  })

  it('teacher: Class for the class, then the tab whose folder the address is in', () => {
    const base = '/t/xyz'
    expect(activeTabFor('teacher', base, '/t/xyz')).toBe('class')
    expect(activeTabFor('teacher', base, '/t/xyz/learners')).toBe('learners')
    expect(activeTabFor('teacher', base, '/t/xyz/learners/c1')).toBe('learners')
    expect(activeTabFor('teacher', base, '/t/xyz/learners/c1/long-view')).toBe('learners')
    expect(activeTabFor('teacher', base, '/t/xyz/snap')).toBe('snap')
    expect(activeTabFor('teacher', base, '/t/xyz/snap/t1/key')).toBe('snap')
    expect(activeTabFor('teacher', base, '/t/xyz/tests')).toBe('tests')
    expect(activeTabFor('teacher', base, '/t/xyz/tests/t1/q/2')).toBe('tests')
    expect(activeTabFor('teacher', base, '/t/xyz/curriculum/map')).toBe('curriculum')
    expect(activeTabFor('teacher', base, '/t/xyz/notifications')).toBe('class')
    expect(activeTabFor('teacher', base, '/t/xyz/gaps/fractions')).toBe('class')
  })

  it('teacher: the register is shown under Learners (an alias)', () => {
    expect(activeTabFor('teacher', '/t/xyz', '/t/xyz/register')).toBe('learners')
    expect(activeTabFor('teacher', '/t/xyz', '/t/xyz/register/')).toBe('learners')
  })

  it('a folder whose name only begins like a tab folder is not that tab', () => {
    expect(activeTabFor('learner', '/k', '/k/mathsy')).toBe('today')
    expect(activeTabFor('teacher', '/t/xyz', '/t/xyz/learnersx')).toBe('class')
  })

  it('an address outside the base gives the first tab, as the server always did', () => {
    expect(activeTabFor('learner', '/k', '/kit')).toBe('today')
    expect(activeTabFor('parent', '/p/abc', '/p/other/learn')).toBe('profile')
    expect(activeTabFor('teacher', '/t/xyz', '/')).toBe('class')
  })
})

const current = (html: string) => [...html.matchAll(/<a[^>]*aria-current="page"[^>]*>(.*?)<\/a>/g)].map((m) => m[1]!.replace(/<[^>]+>/g, '').trim())

describe('TabBar and Sidebar draw the tab of the address they are in', () => {
  it('a learner taps My maths: the bar marks My maths, and Today again after the way back', () => {
    const bar = () => renderToStaticMarkup(<TabBar role="learner" active="today" label="Amina" />)
    state.pathname = '/k'
    expect(current(bar())).toEqual(['Today'])
    state.pathname = '/k/maths'
    expect(current(bar())).toEqual(['My maths'])
    state.pathname = '/k'
    expect(current(bar())).toEqual(['Today'])
  })

  it('the first paint (the tab the server passed) holds where the address cannot be read', () => {
    state.pathname = null
    expect(current(renderToStaticMarkup(<TabBar role="learner" active="maths" label="Amina" />))).toEqual(['My maths'])
    expect(current(renderToStaticMarkup(<Sidebar role="learner" active="maths" label="Amina" name="Amina" subtitle="Grade 6" switchHref="/k" user={{ name: 'A', initials: 'A' }} settingsHref="/k/me" />))).toEqual(['My maths'])
  })

  it('the parent bar follows the address under the child', () => {
    const bar = () => renderToStaticMarkup(<TabBar role="parent" active="profile" label="Amina" base="/p/c1" />)
    state.pathname = '/p/c1/learn'
    expect(current(bar())).toEqual(['Learn'])
    state.pathname = '/p/c1/tests'
    expect(current(bar())).toEqual(['Tests'])
    state.pathname = '/p/c1'
    expect(current(bar())).toEqual(['Profile'])
  })

  it('the teacher bar follows the address under the class, learner pages included', () => {
    const bar = () => renderToStaticMarkup(<TabBar role="teacher" active="class" label="6B" base="/t/k1" />)
    state.pathname = '/t/k1/learners/c9/long-view'
    expect(current(bar())).toEqual(['Learners'])
    state.pathname = '/t/k1/snap'
    expect(current(bar())).toEqual(['Snap'])
    state.pathname = '/t/k1'
    expect(current(bar())).toEqual(['Class'])
  })

  it('the hand-over bar of a parent\'s phone (learner tabs under /k) follows the address too', () => {
    state.pathname = '/k/maths'
    expect(current(renderToStaticMarkup(<TabBar role="learner" active="today" label="Practise at home" />))).toEqual(['My maths'])
  })

  it('a bar a page draws for a screen with no tab folder of its own keeps the tab the page named', () => {
    // The kit page draws bars with base "#"; the address is /kit, outside the base.
    state.pathname = '/kit'
    expect(current(renderToStaticMarkup(<TabBar role="learner" active="maths" label="Amina" base="#" />))).toEqual(['My maths'])
    // A marked paper, under the child, is Tests (the page names it, the address agrees).
    state.pathname = '/p/c1/papers/p1'
    expect(current(renderToStaticMarkup(<TabBar role="parent" active="tests" label="Amina" base="/p/c1" />))).toEqual(['Tests'])
  })

  it('the laptop sidebar follows the address as the bar does', () => {
    const side = () =>
      renderToStaticMarkup(
        <Sidebar role="learner" active="today" label="Amina" name="Amina" subtitle="Grade 6" switchHref="/k" user={{ name: 'A', initials: 'A' }} settingsHref="/k/me" />,
      )
    state.pathname = '/k/maths/fractions'
    expect(current(side())).toEqual(['My maths'])
    state.pathname = '/k'
    expect(current(side())).toEqual(['Today'])
  })

  it('exactly one tab is marked, and the link of the marked tab keeps its address', () => {
    state.pathname = '/t/k1/tests/t1'
    const html = renderToStaticMarkup(<TabBar role="teacher" active="class" label="6B" base="/t/k1" />)
    expect(current(html)).toEqual(['Tests'])
    expect(html).toContain('href="/t/k1/tests"')
  })
})
