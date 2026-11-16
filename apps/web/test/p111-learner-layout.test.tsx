import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isIndependent, isOwnRecord } from '@jemma/profiling/own-names'

// P111: the learner's layout for a learner who signed up alone. The child is a child of a personal school (`schools.kind 'private'`, `private_of` null),
// which is an own record: the line under the name is "Grade 5 · My own" and no school is named. A learner of a school keeps the name of the school.
// The cookies, the headers and the client are stand-ins: no browser, no server, no database.

const state = vi.hoisted(() => ({ child: null as unknown, sidebar: null as null | { label: string; subtitle: string; switchHref: string } }))

vi.mock('next/headers', () => ({
  headers: async () => ({ get: (n: string) => (n === 'x-pathname' ? '/k' : null) }),
  cookies: async () => ({ get: () => undefined }),
}))
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`)
  },
  notFound: () => {
    throw new Error('NOT_FOUND')
  },
}))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServer: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'login-1' } } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: 'learner' } }) }) }) }),
  }),
}))
vi.mock('@/lib/auth', () => ({ requireRole: async () => ({ userId: 'login-1', profile: { display_name: 'Naledi Dlamini' } }) }))
vi.mock('@/lib/data/p27', () => ({ myChild: async () => ({ child: state.child }) }))
vi.mock('@/lib/space', () => ({ activeTab: async () => 'today' }))
vi.mock('@/components/blocks', () => ({
  Sidebar: (props: { label: string; subtitle: string; switchHref: string }) => {
    state.sidebar = props
    return <aside data-testid="sidebar">{props.label} {props.subtitle}</aside>
  },
  TabBar: ({ label }: { label: string }) => <nav aria-label={label} data-testid="tabbar" />,
}))

import LearnerLayout from '../app/k/layout'

/** The child `startLearnerAlone` makes, read the way the learner's screens read it (the child with its school). */
const aloneChild = { id: 'child-1', first_name: 'Naledi', grade: 5, private_of: null, user_id: 'login-1', parent_first_name: null, parent_relation: null, schools: { name: "Naledi's own", kind: 'private' } }
const schoolChild = { id: 'child-2', first_name: 'Amina', grade: 6, private_of: null, user_id: 'login-2', parent_first_name: 'Zanele', parent_relation: 'mum', schools: { name: 'Hillview Primary', kind: 'school' } }

beforeEach(() => {
  state.child = aloneChild
  state.sidebar = null
})

describe('the child of a learner who signed up alone', () => {
  it('is an own record and an independent one: no school workspace, no switch', () => {
    expect(isOwnRecord(aloneChild)).toBe(true)
    expect(isIndependent(aloneChild)).toBe(true)
    expect(isOwnRecord(schoolChild)).toBe(false)
    expect(isIndependent(schoolChild)).toBe(false)
  })

  it('the layout names the learner’s Jemma and says "Grade 5 · My own", with no school in it', async () => {
    render(await LearnerLayout({ children: <p>the screen</p> }))
    expect(screen.getByText('the screen')).toBeTruthy()
    expect(state.sidebar).toMatchObject({ label: "Naledi's Jemma", subtitle: 'Grade 5 · My own' })
    expect(screen.getByTestId('sidebar').textContent).not.toMatch(/school|teacher/i)
    expect(screen.getByTestId('tabbar')).toBeTruthy()
  })

  it('a learner of a school still gets the name of the school under theirs', async () => {
    state.child = schoolChild
    render(await LearnerLayout({ children: <p>the screen</p> }))
    expect(state.sidebar).toMatchObject({ label: "Amina's Jemma", subtitle: 'Grade 6 · Hillview Primary' })
  })
})
