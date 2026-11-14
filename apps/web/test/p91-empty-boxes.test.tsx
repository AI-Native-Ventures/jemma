// @vitest-environment node
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

// P91: the teacher's class home has no empty boxes. A "What Jemma did" card with nothing in it says so in one plain line (and has no "See all"),
// and the "What the class doesn't get yet" heading with no gaps under it is followed by a line that says when gaps appear.
// Everything is drawn from props or from a data double (react-dom/server): no server, no browser, no database.

vi.mock('../lib/supabase/server', () => ({ createSupabaseServer: vi.fn() }))
vi.mock('../lib/supabase/admin', () => ({ createSupabaseAdmin: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
  useRouter: () => ({ push: () => undefined, refresh: () => undefined }),
}))
vi.mock('next/headers', () => ({ cookies: vi.fn() }))
// The server actions would pull in the database client: they are never called here.
vi.mock('../app/t/[classId]/gaps/actions', () => ({ markReteachDone: vi.fn() }))
vi.mock('../app/t/[classId]/snap/actions', () => ({ shareTest: vi.fn() }))

const state = vi.hoisted(() => ({ home: null as unknown }))
vi.mock('../lib/data/p18', () => ({
  getClassHome: async () => state.home,
  getGapDetail: async () => null,
  numberWord: (n: number) => String(n),
  joinNames: (names: string[]) => names.join(', '),
}))

import { WhatJemmaDid } from '@/components/blocks'
import { EMPTY_GAPS_LINE, emptyGapsLine, emptyLogLine } from '@/lib/empty-boxes'
import type { ClassGapView, ClassHome } from '@/lib/data/p18'
import { LaptopHome } from '../app/t/[classId]/LaptopHome'
import TeacherClassHome from '../app/t/[classId]/page'

const TEACHER_LINE = 'Nothing yet. Jemma writes here each time it does something for this class.'
const PARENT_LINE = 'Nothing yet. Jemma writes here each time it does something for your child.'

/** The words of a piece of markup: tags gone, the apostrophe entity decoded, spaces collapsed. */
const words = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
const links = (html: string) => [...html.matchAll(/<a [^>]*>([\s\S]*?)<\/a>/g)].map((m) => words(m[1]!))
const count = (html: string, tag: string) => (html.match(new RegExp(`<${tag}[\\s>]`, 'g')) ?? []).length

const entries = [
  { at: '14:14', text: "Planned tonight's lesson" },
  { at: '14:13', text: 'Found 3 class gaps' },
  { at: 'Sun 18:40', text: 'Read the homework' },
]

const gap = (key: string, topicName: string): ClassGapView =>
  ({
    key,
    topicName,
    shortName: topicName,
    count: 2,
    total: 5,
    counts: { practising: 0, new: 2 },
    learners: [],
    mistake: null,
    partners: [],
    nextLesson: null,
  }) as unknown as ClassGapView

const home = (over: Partial<ClassHome> = {}): ClassHome => ({
  mode: 'home',
  headline: 'No class gaps yet.',
  dateLabel: 'Sat 14 Nov',
  needsYou: [],
  doneName: null,
  gaps: [],
  reteach: null,
  latestTest: null,
  lastNightSessions: [],
  waiting: [],
  activity: [],
  topGapKey: null,
  shareCard: null,
  ...over,
})

const classHome = async (h: ClassHome) => {
  state.home = h
  const el = await TeacherClassHome({ params: Promise.resolve({ classId: 'c1' }), searchParams: Promise.resolve({}) })
  return renderToStaticMarkup(el)
}

describe('the plain lines', () => {
  it('say the same thing in the same words every time', () => {
    expect(emptyLogLine('teacher')).toBe(TEACHER_LINE)
    expect(emptyLogLine()).toBe(TEACHER_LINE)
    expect(emptyLogLine('parent')).toBe(PARENT_LINE)
    expect(EMPTY_GAPS_LINE).toBe('Gaps show here after you mark a class test.')
  })

  it('the gaps line shows only when there are no gaps', () => {
    expect(emptyGapsLine(0)).toBe(EMPTY_GAPS_LINE)
    expect(emptyGapsLine(1)).toBeNull()
    expect(emptyGapsLine(3)).toBeNull()
  })

  it('has no em dash', () => {
    for (const line of [TEACHER_LINE, PARENT_LINE, EMPTY_GAPS_LINE]) expect(line).not.toContain(String.fromCharCode(0x2014))
  })
})

describe('WhatJemmaDid with nothing to show', () => {
  it('keeps its heading, says so in one line, and has no list and no See all', () => {
    const html = renderToStaticMarkup(<WhatJemmaDid entries={[]} seeAllHref="/n" />)
    expect(html).toContain('What Jemma did')
    expect(words(html)).toContain(TEACHER_LINE)
    expect(count(html, 'ol')).toBe(0)
    expect(count(html, 'li')).toBe(0)
    expect(links(html)).toEqual([])
    expect(words(html)).not.toContain('See all')
  })

  it('the parent card says "for your child" and keeps its 20 px corners', () => {
    const html = renderToStaticMarkup(<WhatJemmaDid entries={[]} variant="parent" seeAllHref="/n" />)
    expect(words(html)).toContain(PARENT_LINE)
    expect(words(html)).not.toContain('for this class')
    expect(html).toContain('rounded-20')
    expect(words(html)).not.toContain('See all')
  })

  it('a limit of 0 shows nothing, so it says so too', () => {
    const html = renderToStaticMarkup(<WhatJemmaDid entries={entries} limit={0} seeAllHref="/n" />)
    expect(words(html)).toContain(TEACHER_LINE)
    expect(count(html, 'li')).toBe(0)
    expect(links(html)).toEqual([])
  })

  it('the heading is still the one the card is labelled by', () => {
    const html = renderToStaticMarkup(<WhatJemmaDid entries={[]} />)
    expect(html).toContain('aria-labelledby="did"')
    expect(html).toContain('<h2 id="did"')
  })
})

describe('WhatJemmaDid with entries is as it was', () => {
  it('lists every entry, with the time column wide when a weekday is in it, and a See all link', () => {
    const html = renderToStaticMarkup(<WhatJemmaDid entries={entries} seeAllHref="/n" />)
    expect(count(html, 'li')).toBe(3)
    expect(html).toContain('w-[66px]')
    expect(links(html)).toEqual(['See all'])
    expect(html).toContain('href="/n"')
    expect(words(html)).not.toContain('Nothing yet')
  })

  it('respects the limit, and has no See all without a href', () => {
    const html = renderToStaticMarkup(<WhatJemmaDid entries={entries} limit={2} />)
    expect(count(html, 'li')).toBe(2)
    expect(html).toContain('w-10')
    expect(html).not.toContain('w-[66px]')
    expect(links(html)).toEqual([])
  })

  it('the parent card with entries keeps its 20 px corners and its list', () => {
    const html = renderToStaticMarkup(<WhatJemmaDid entries={entries} variant="parent" />)
    expect(html).toContain('rounded-20')
    expect(count(html, 'li')).toBe(3)
    expect(words(html)).not.toContain('Nothing yet')
  })
})

describe("the teacher's class home on a phone, before anything is marked", () => {
  it('says when gaps appear under the sub-heading, and the What Jemma did card has no empty list', async () => {
    const html = await classHome(home())
    const text = words(html)
    expect(text).toContain('No class gaps yet.')
    expect(text).toContain("What the class doesn't get yet " + EMPTY_GAPS_LINE)
    expect(text).toContain('What Jemma did ' + TEACHER_LINE)
    expect(count(html, 'ol')).toBe(0)
    // The one text link to the full log stays; "See all" is gone because there is nothing to see.
    expect(links(html)).toContain('See the full log')
    expect(links(html)).not.toContain('See all')
  })

  it('with gaps, the sub-heading is followed by the gaps and not by the line', async () => {
    const html = await classHome(
      home({ headline: 'Adding fractions is the gap.', gaps: [gap('adding', 'Adding fractions'), gap('compare', 'Comparing fractions')], topGapKey: 'adding' }),
    )
    const text = words(html)
    expect(text).toContain("What the class doesn't get yet")
    expect(text).toContain('Adding fractions')
    expect(text).toContain('Comparing fractions')
    expect(text).not.toContain(EMPTY_GAPS_LINE)
  })

  it('with entries in the log, the card lists them and keeps See all', async () => {
    const html = await classHome(home({ activity: [{ at: '14:14', text: "Planned tonight's lesson" }, { at: '14:13', text: 'Found 3 class gaps' }] }))
    expect(count(html, 'li')).toBe(2)
    expect(links(html)).toContain('See all')
    expect(words(html)).not.toContain(TEACHER_LINE)
  })

  it('the morning after (next mode) with an empty log says so in the same words and has no See all', async () => {
    const html = await classHome(
      home({
        mode: 'next',
        headline: 'Adding fractions is still the gap.',
        gaps: [gap('adding', 'Adding fractions')],
        topGapKey: 'adding',
        lastNightSessions: [{ childId: 'a', name: 'Amina', right: 3, of: 5, note: 'Adding fractions', stage: 'practising' }],
        activity: [],
      }),
    )
    expect(words(html)).toContain('What Jemma did since yesterday ' + TEACHER_LINE)
    expect(links(html)).not.toContain('See all')
  })
})

describe("the teacher's class home on a laptop, before anything is marked", () => {
  it('says when gaps appear and has no empty What Jemma did list', () => {
    const html = renderToStaticMarkup(<LaptopHome home={home()} detail={null} base="/t/c1" classId="c1" />)
    const text = words(html)
    expect(text).toContain("What the class doesn't get yet " + EMPTY_GAPS_LINE)
    expect(text).toContain('What Jemma did today ' + TEACHER_LINE)
    expect(count(html, 'ol')).toBe(0)
    expect(links(html)).not.toContain('See all')
    expect(links(html)).toContain('See the full log')
  })

  it('with entries it lists them and keeps See all', () => {
    const html = renderToStaticMarkup(
      <LaptopHome home={home({ activity: [{ at: '14:14', text: "Planned tonight's lesson" }] })} detail={null} base="/t/c1" classId="c1" />,
    )
    expect(count(html, 'li')).toBe(1)
    expect(links(html)).toContain('See all')
    expect(words(html)).not.toContain(TEACHER_LINE)
  })

  it('with gaps it does not show the line', () => {
    const html = renderToStaticMarkup(<LaptopHome home={home({ gaps: [gap('adding', 'Adding fractions')], topGapKey: 'adding' })} detail={null} base="/t/c1" classId="c1" />)
    expect(words(html)).not.toContain(EMPTY_GAPS_LINE)
  })
})
