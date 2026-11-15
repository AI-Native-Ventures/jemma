import { cleanup, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The words of the parent's path (P99b): the consent page, the teacher's request and the parent's waiting page call people by their name or by "they",
// never "she" or "her". The data is a double: no database, no browser. (The guard `p99b-no-gendered-words.test.ts` reads every source file; these tests read what
// the screens say, sentence by sentence, so the sentences are the ones a person reads.)

vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`)
  },
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/lib/auth', () => ({ requireRole: async () => ({ userId: 'parent-1', profile: { display_name: 'Thandi M' } }) }))
vi.mock('@/lib/data/p22', async (orig) => ({
  ...(await orig<typeof import('../lib/data/p22')>()),
  findClass: async () => ({ classId: 'class-1', className: '6B Mathematics', grade: 6, schoolName: 'Hillview Primary', teacherId: 't1', teacherName: 'Ms Banda' }),
  findChildInClass: async () => ({ kind: 'one', child: { id: 'child-1', firstName: 'Thando', lastName: null } }),
  getPendingLink: async () => ({ childId: 'child-1', childName: 'Thando', className: '6B Mathematics', schoolName: 'Hillview Primary', teacherName: 'Ms Banda', askedAt: '09:30' }),
}))
vi.mock('../app/p/add/actions', () => ({ requestLink: vi.fn(), findClass: vi.fn(), addChildAlone: vi.fn() }))
vi.mock('@/lib/data/p21', async (orig) => ({
  ...(await orig<typeof import('../lib/data/p21')>()),
  getLinkRequest: async () => ({
    cls: { id: 'class-1', name: '6B Mathematics', joinCode: 'ABC234' },
    linkId: 'link-1',
    status: 'pending',
    parentName: 'Walk Parent',
    parentInitials: 'WP',
    parentEmail: 'walk@example.test',
    childName: 'Thando',
    enteredAt: '09:30',
    otherParents: 0,
  }),
}))
vi.mock('../app/t/[classId]/link-requests/actions', () => ({ decideLink: vi.fn() }))
vi.mock('@/lib/demo', () => ({ getDemoState: async () => null }))
vi.mock('../app/p/add/pending/actions', () => ({ switchToTeacher: vi.fn() }))

import ConsentPage from '../app/p/add/consent/page'
import PendingPage from '../app/p/add/pending/page'
import TeacherLinkRequestPage from '../app/t/[classId]/link-requests/[linkId]/page'

const body = () => document.body.textContent ?? ''

beforeEach(() => cleanup())

describe('the consent page', () => {
  const page = async () => render(await ConsentPage({ searchParams: Promise.resolve({ code: 'ABC234', child: 'Thando' }) }))

  it('says it keeps the child’s schoolwork so it can teach the child, by name', async () => {
    await page()
    expect(screen.getByText("Jemma keeps Thando's schoolwork so it can teach Thando. Is that okay with you?")).toBeTruthy()
  })

  it('lists what it keeps with the child’s name: photos of their tests, their marks, gaps and lessons', async () => {
    await page()
    expect(screen.getByText("Photos of Thando's tests and homework")).toBeTruthy()
    expect(screen.getByText("Thando's marks, gaps and lessons")).toBeTruthy()
  })

  it('the two boxes say the same, and the optional one says "their work"', async () => {
    await page()
    expect(screen.getByLabelText(/Jemma can use Thando's schoolwork to teach Thando/)).toBeTruthy()
    expect(screen.getByLabelText(/Use their work, name removed, to make Jemma better/)).toBeTruthy()
  })

  it('has no she, her, he or his on the page', async () => {
    await page()
    expect(body()).not.toMatch(/\b(she|her|hers|he|him|his)\b/i)
    expect(body()).not.toContain(String.fromCharCode(0x2014))
  })
})

describe('the parent’s waiting page', () => {
  it('says the teacher’s answer shows up, by the teacher’s name', async () => {
    render(await PendingPage())
    expect(screen.getByText("Ms Banda's answer shows up in Needs you on Thando's profile.")).toBeTruthy()
    expect(body()).not.toMatch(/\b(she|her|hers|he|him|his)\b/i)
  })
})

describe('the teacher’s request from a parent', () => {
  const page = async () => render(await TeacherLinkRequestPage({ params: Promise.resolve({ classId: 'class-1', linkId: 'link-1' }) }))

  it('asks about the parent by name: "Is Walk Parent Thando’s parent?"', async () => {
    await page()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe("Walk Parent wants to see Thando's work. Is Walk Parent Thando's parent?")
  })

  it('says what the parent will see with "They’ll see" and the child’s name, and that they see nothing until the teacher says yes', async () => {
    await page()
    expect(screen.getByRole('heading', { name: "They'll see" })).toBeTruthy()
    expect(screen.getByText("Thando's marks and papers")).toBeTruthy()
    expect(screen.getByText("Thando's gaps and lessons")).toBeTruthy()
    expect(screen.getByText('They see nothing until you say yes.')).toBeTruthy()
  })

  it('"Not sure?" names the parent', async () => {
    await page()
    expect(screen.getByRole('button', { name: 'Not sure? Message Walk Parent first' })).toBeTruthy()
  })

  it('has no she, her, he or his on the page', async () => {
    await page()
    expect(body()).not.toMatch(/\b(she|her|hers|he|him|his)\b/i)
  })
})
