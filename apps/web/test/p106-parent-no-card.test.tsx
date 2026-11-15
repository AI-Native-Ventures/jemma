// @vitest-environment node
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProfileData, ReportData } from '../lib/data/p23'

// P106: the family reads `guidance_cards` and nothing else. Until the teacher sends the first card there is no row, and the parent's profile and report
// show no guidance section and nothing broken: no "What to focus on next" box, no "Looking ahead" line, no "What's next" box, no empty box. Once a card
// is sent the same screens show it. The data is a double (react-dom/server): no server, no browser, no database.

const state = vi.hoisted(() => ({ profile: null as unknown, report: null as unknown }))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
  useRouter: () => ({ push: () => undefined, refresh: () => undefined }),
  usePathname: () => '/p/child-1',
}))
vi.mock('@/lib/auth', () => ({ requireRole: async () => ({ userId: 'parent-1', profile: { display_name: 'Thandi' } }) }))
vi.mock('@/lib/data/own-parent', () => ({ getAloneSummary: async () => null }))
vi.mock('@/lib/data/p23', () => ({ getProfile: async () => state.profile, getReport: async () => state.report }))
vi.mock('@/lib/data/p36', () => ({ getProfileExtras: async () => ({ today: 'Sun 15 Nov', tonight: null, teacher: 'Ms Banda', notes: [], attendance: null, activities: [] }) }))
vi.mock('@/lib/data/p52', () => ({ getSharedLongView: async () => null }))
vi.mock('../app/p/[childId]/learn/handover/own-actions', () => ({ startOwnPractice: async () => undefined }))
vi.mock('../app/p/[childId]/settings/actions', () => ({ setChildPin: async () => ({ ok: true, code: 'K7M2QX' }) }))
vi.mock('../app/p/[childId]/report/actions', () => ({ ReportActions: () => null }))

import ParentProfilePage from '../app/p/[childId]/page'
import ParentReportPage from '../app/p/[childId]/report/page'

const words = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()

const profile = (over: Partial<ProfileData> = {}): ProfileData => ({
  child: { id: 'child-1', firstName: 'Amina', grade: 6 },
  headline: null,
  updated: null,
  afterTest: 'Class Test 1',
  needs: [],
  marks: [{ key: 'adding-fractions', topicName: 'Adding fractions with different denominators', shortName: 'Adding fractions', percent: 40, change: null }],
  marksTitle: 'Maths',
  notices: [],
  focus: [],
  lookingAhead: null,
  beyond: { note: null, attendance: null, activities: null },
  did: [],
  ...over,
})

const report = (over: Partial<ReportData> = {}): ReportData => ({
  childName: 'Amina',
  grade: 6,
  headline: 'Amina is steady at 60% and fixing gaps one at a time.',
  period: '2 to 15 Nov',
  term: 4,
  stats: { percent: 60, testTitle: 'Class Test 1', fixed: 0, lessons: 1 },
  weeks: [],
  working: [],
  fixed: [],
  activities: [],
  next: [],
  lookingAhead: null,
  madeOn: 'Sun 15 Nov',
  sources: 'Class Test 1 and the register',
  ...over,
})

const profilePage = async () => words(renderToStaticMarkup(await ParentProfilePage({ params: Promise.resolve({ childId: 'child-1' }) })))
const reportPage = async () => words(renderToStaticMarkup(await ParentReportPage({ params: Promise.resolve({ childId: 'child-1' }) })))

beforeEach(() => {
  state.profile = profile()
  state.report = report()
})

describe("a parent's profile before the teacher sends a card", () => {
  it('has no guidance section: no "What to focus on next", no "Looking ahead"', async () => {
    const text = await profilePage()
    expect(text).not.toContain('What to focus on next, and why')
    expect(text).not.toContain('Looking ahead')
    expect(text).not.toMatch(/Updated (today|\w{3} \d)/)
  })

  it('still has the page: the marks, the plain heading and the link to the report', async () => {
    const text = await profilePage()
    expect(text).toContain("Amina's profile fills in once a test or homework has been marked.")
    expect(text).toContain('Marks by topic')
    expect(text).toContain("See Amina's report")
  })

  it('shows the card once the teacher has sent it: the words are the same screens, with a section', async () => {
    state.profile = profile({
      headline: 'Amina is doing well. One thing to work on this week: adding fractions.',
      updated: 'Updated today at 09:30',
      focus: [{ title: 'Adding fractions', why: 'Tops and bottoms were added.', chips: [] }],
      lookingAhead: 'Looking ahead: Next up is subtracting fractions.',
    })
    const text = await profilePage()
    expect(text).toContain('What to focus on next, and why')
    expect(text).toContain('Adding fractions')
    expect(text).toContain('Looking ahead: Next up is subtracting fractions.')
    expect(text).toContain('Updated today at 09:30')
    expect(text).not.toContain('fills in once a test')
  })
})

describe("a parent's report before the teacher sends a card", () => {
  it('has no "What\'s next" box and no "Looking ahead" line, and the rest of the report is there', async () => {
    const text = await reportPage()
    expect(text).not.toContain("What's next")
    expect(text).not.toContain('Looking ahead')
    expect(text).toContain('Amina is steady at 60% and fixing gaps one at a time.')
    expect(text).toContain('Made by Jemma on Sun 15 Nov from Class Test 1 and the register.')
  })

  it('has the box once a card is sent', async () => {
    state.report = report({ next: ['Adding fractions.'], lookingAhead: 'Looking ahead: Next up is subtracting fractions.' })
    const text = await reportPage()
    expect(text).toContain("What's next")
    expect(text).toContain('Adding fractions.')
    expect(text).toContain('Looking ahead: Next up is subtracting fractions.')
  })
})
