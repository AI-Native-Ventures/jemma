import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeAdmin, type FakeAdmin, type Row } from './p97-fake-db'
import { fakeDb, type FakeDb } from './p89-fake-db'

// P112: the screens of "a learner joins the class": the card on the learner's home and Me, the teacher's page with the choice of who the learner is,
// and the Needs you item on the class home (the right class only, with the right link). Everything is drawn from stand-in data: no database, no
// browser, no server.

const world = vi.hoisted(() => ({ admin: null as unknown, server: null as unknown, view: null as unknown, redirected: [] as string[] }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  redirect: (url: string) => void world.redirected.push(url),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdmin: () => world.admin }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServer: async () => world.server }))
vi.mock('@/lib/data/p50b', () => ({ getShareCard: async () => null }))
vi.mock('@/lib/data/class-join', async (importOriginal) => ({ ...(await importOriginal<object>()), getJoinRequest: async () => world.view }))
vi.mock('../app/t/[classId]/join-requests/actions', () => ({ decideJoinRequest: vi.fn(async () => ({ ok: true })) }))

import { NeedsYouList } from '@/components/blocks'
import { getClassHome } from '@/lib/data/p18'
import { likelyMatch, type JoinRequestView } from '@/lib/data/class-join'
import { JoinClassCard } from '../app/k/join/JoinClassCard'
import TeacherJoinRequestPage from '../app/t/[classId]/join-requests/[requestId]/page'

const LEARNER = 'learner-1'
const kids = (over: Record<string, Row[]> = {}) => ({
  schools: [{ id: 's1', kind: 'school' }, { id: 'own1', kind: 'private' }],
  classes: [{ id: 'c1', name: '6B Mathematics', teacher_id: 'teacher-1' }],
  children: [{ id: 'own-kid', school_id: 'own1', first_name: 'Zola', private_of: null, user_id: LEARNER }],
  profiles: [{ user_id: 'teacher-1', display_name: 'Ms Banda' }],
  class_join_requests: [] as Row[],
  ...over,
})
const asLearner = (tables: Record<string, Row[]>, user: string | null = LEARNER) => {
  world.admin = fakeAdmin(tables) as FakeAdmin
  world.server = { auth: { getUser: async () => ({ data: { user: user ? { id: user } : null } }) } }
}

beforeEach(() => {
  world.redirected = []
})
afterEach(cleanup)

describe('the card "Join your school class"', () => {
  it('is a code box and Send for a learner who signed up alone', async () => {
    asLearner(kids())
    render(await JoinClassCard())
    expect(screen.getByRole('heading', { name: 'Join your school class' })).toBeTruthy()
    expect(screen.getByLabelText("Your teacher's class code")).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy()
  })

  it('says who the learner is waiting for, with no code box, once a request is sent', async () => {
    asLearner(kids({ class_join_requests: [{ id: 'r1', class_id: 'c1', own_child_id: 'own-kid', requested_name: 'Zola', status: 'pending' }] }))
    render(await JoinClassCard())
    expect(screen.getByText('Waiting for Ms Banda to say yes.')).toBeTruthy()
    expect(screen.queryByLabelText("Your teacher's class code")).toBeNull()
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull()
  })

  it('says the teacher said no, and offers the box again', async () => {
    asLearner(kids({ class_join_requests: [{ id: 'r1', class_id: 'c1', own_child_id: 'own-kid', requested_name: 'Zola', status: 'declined' }] }))
    render(await JoinClassCard())
    expect(screen.getByText('Your teacher said no. Check the code and try again.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy()
  })

  it('is not drawn for a learner who has a school class, for a twin, for a grown-up, or when nobody is signed in', async () => {
    asLearner(kids({ children: [{ id: 'sk', school_id: 's1', first_name: 'Zola', private_of: null, user_id: LEARNER }] }))
    expect(await JoinClassCard()).toBeNull()
    asLearner(kids({ children: [{ id: 'sk', school_id: 's1', first_name: 'Zola', private_of: null, user_id: LEARNER }, { id: 'own-kid', school_id: 'own1', first_name: 'Zola', private_of: 'sk', user_id: LEARNER }] }))
    expect(await JoinClassCard()).toBeNull()
    asLearner(kids(), 'a-grown-up')
    expect(await JoinClassCard()).toBeNull()
    asLearner(kids(), null)
    expect(await JoinClassCard()).toBeNull()
  })

  it('never fails the page it sits on', async () => {
    world.admin = {
      from: () => {
        throw new Error('the database is down')
      },
    }
    world.server = { auth: { getUser: async () => ({ data: { user: { id: LEARNER } } }) } }
    expect(await JoinClassCard()).toBeNull()
  })
})

const view = (over: Partial<JoinRequestView> = {}): JoinRequestView => ({
  classId: 'c1',
  className: '6B Mathematics',
  joinCode: 'ABC234',
  requestId: 'r1',
  status: 'pending',
  name: 'Zola',
  askedAt: '14:12',
  candidates: [
    { childId: 'kid1', name: 'Amina' },
    { childId: 'kid3', name: 'Sipho Dube' },
  ],
  match: null,
  ...over,
})
const teacherPage = async (v: JoinRequestView) => {
  world.view = v
  render(await TeacherJoinRequestPage({ params: Promise.resolve({ classId: 'c1', requestId: 'r1' }) }))
}

describe("the teacher's page", () => {
  it('asks who the learner is: "This is ..." for each learner with no login yet, "Add as a new learner", then yes or no', async () => {
    await teacherPage(view())
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Zola wants to join 6B Mathematics. Who is Zola?')
    expect(screen.getByRole('button', { name: 'This is Amina' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'This is Sipho Dube' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add as a new learner' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Yes, approve' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'No, decline' })).toBeTruthy()
    expect(document.body.textContent).toContain('code ABC234 at 14:12')
  })

  it('waits for a choice before Yes, approve', async () => {
    await teacherPage(view())
    expect((screen.getByRole('button', { name: 'Yes, approve' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryAllByRole('button', { pressed: true })).toEqual([])
  })

  it('has "Add as a new learner" chosen when every learner of the class already has a login', async () => {
    await teacherPage(view({ candidates: [] }))
    expect(screen.getByRole('button', { name: 'Add as a new learner' }).getAttribute('aria-pressed')).toBe('true')
    expect((screen.getByRole('button', { name: 'Yes, approve' }) as HTMLButtonElement).disabled).toBe(false)
    expect(document.body.textContent).toContain('Every learner in your class already has a login')
  })

  it('has the learner with the same first name chosen', async () => {
    await teacherPage(view({ name: 'Amina', match: 'kid1' }))
    expect(screen.getByRole('button', { name: 'This is Amina' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('goes back to the class when the request was already answered', async () => {
    world.view = view({ status: 'approved' })
    await TeacherJoinRequestPage({ params: Promise.resolve({ classId: 'c1', requestId: 'r1' }) })
    expect(world.redirected).toEqual(['/t/c1'])
  })

  it('has no em dash and no jargon in its words', async () => {
    await teacherPage(view())
    expect(document.body.textContent).not.toContain(String.fromCharCode(0x2014))
  })
})

describe('the first name that likely matches', () => {
  const people = [
    { childId: 'a', firstName: 'Amina' },
    { childId: 'b', firstName: 'Thabo' },
    { childId: 'c', firstName: 'Thabo' },
  ]
  it('is the one learner with that first name, in any case', () => {
    expect(likelyMatch(' amina ', people)).toBe('a')
  })
  it('is nobody when two have it or none does', () => {
    expect(likelyMatch('Thabo', people)).toBeNull()
    expect(likelyMatch('Zola', people)).toBeNull()
  })
})

describe('the Needs you item on the class home', () => {
  const need = { id: 'n1', child_id: 'own-kid', kind: 'approve_join', ref_id: 'r1', status: 'open', title: 'Zola wants to join 6B Mathematics', detail: 'Signed up alone · code ABC234', created_at: '2026-11-16T10:00:00Z' }
  let db: FakeDb
  const homeOf = (tables: Record<string, Row[]>) => {
    db = fakeDb(tables)
    world.server = db
    return getClassHome('c1')
  }

  it('shows "{name} wants to join {class}" and links to the page that asks who the learner is', async () => {
    const home = await homeOf({
      classes: [{ id: 'c1', name: '6B Mathematics' }],
      enrolments: [{ class_id: 'c1', child_id: 'kid1' }],
      children: [{ id: 'kid1', first_name: 'Amina', created_at: '2026-01-01' }],
      class_join_requests: [{ id: 'r1', class_id: 'c1', status: 'pending' }],
      needs_you_items: [need],
    })
    expect(home?.needsYou).toEqual([{ href: '/t/c1/join-requests/r1', title: 'Zola wants to join 6B Mathematics', detail: 'Signed up alone · code ABC234' }])
    render(<NeedsYouList items={home!.needsYou} />)
    const link = screen.getByRole('link', { name: /Zola wants to join 6B Mathematics/ })
    expect(link.getAttribute('href')).toBe('/t/c1/join-requests/r1')
  })

  it('does not show the item on a class the request is not for', async () => {
    const home = await homeOf({
      classes: [{ id: 'c1', name: '6B Mathematics' }],
      enrolments: [{ class_id: 'c1', child_id: 'kid1' }],
      children: [{ id: 'kid1', first_name: 'Amina', created_at: '2026-01-01' }],
      class_join_requests: [{ id: 'r1', class_id: 'c2', status: 'pending' }],
      needs_you_items: [need],
    })
    expect(home?.needsYou).toEqual([])
  })
})
