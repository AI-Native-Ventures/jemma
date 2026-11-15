// @vitest-environment node
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

// P106: a guidance card Jemma wrote waits in the class's Needs you as "Guidance for {first name}'s family", with the card's text in plain view and one
// button, "Send to family". The phone class home and the laptop class home draw the same item. Everything is drawn from props or from a data double
// (react-dom/server): no server, no browser, no database.

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
vi.mock('../app/t/[classId]/guidance/actions', () => ({ sendGuidanceToFamily: vi.fn() }))
vi.mock('../app/t/[classId]/gaps/actions', () => ({ markReteachDone: vi.fn() }))
vi.mock('../app/t/[classId]/snap/actions', () => ({ shareTest: vi.fn() }))

const state = vi.hoisted(() => ({ home: null as unknown }))
vi.mock('../lib/data/p18', () => ({
  getClassHome: async () => state.home,
  getGapDetail: async () => null,
  numberWord: (n: number) => String(n),
  joinNames: (names: string[]) => names.join(', '),
}))

import { NeedsYouList, type GuidanceNeed, type NeedsYouItem } from '@/components/blocks'
import { guidanceWords } from '@/components/blocks/GuidanceNeed'
import type { ClassHome } from '@/lib/data/p18'
import { LaptopHome } from '../app/t/[classId]/LaptopHome'
import TeacherClassHome from '../app/t/[classId]/page'

/** The words of a piece of markup: tags gone, the apostrophe entity decoded, spaces collapsed. */
const words = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
const count = (html: string, tag: string) => (html.match(new RegExp(`<${tag}[\\s>]`, 'g')) ?? []).length

const amina: GuidanceNeed = {
  classId: 'c1',
  childId: 'amina',
  firstName: 'Amina',
  headline: 'Amina is doing well. One thing to work on this week: adding fractions.',
  focus: [
    { title: 'Adding fractions', why: 'Two papers show tops and bottoms added.' },
    { title: 'Equivalent fractions', why: 'She finds them when she draws a strip.' },
  ],
  lookingAhead: 'Next up is subtracting fractions.',
}
const thabo: GuidanceNeed = { ...amina, childId: 'thabo', firstName: 'Thabo', headline: 'Thabo is steady.', focus: [], lookingAhead: 'Next up is decimals.' }

const item = (g: GuidanceNeed): NeedsYouItem => ({ href: `/t/c1/learners/${g.childId}`, title: guidanceWords(g).title, detail: g.headline, guidance: g })
const mark: NeedsYouItem = { href: '/t/c1/needs-you/n1', title: 'Check Sipho question 7', detail: 'Jemma could not read it' }

const home = (needsYou: NeedsYouItem[], over: Partial<ClassHome> = {}): ClassHome => ({
  mode: 'home',
  headline: 'No class gaps yet.',
  dateLabel: 'Sun 15 Nov',
  needsYou,
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

describe('the words of the item', () => {
  it('are the same everywhere, and plain', () => {
    expect(guidanceWords(amina)).toEqual({
      title: "Guidance for Amina's family",
      note: 'Jemma wrote this card. The family sees it only after you send it.',
      lookingAhead: 'Looking ahead: Next up is subtracting fractions.',
      button: 'Send to family',
    })
  })
})

describe('the item in Needs you', () => {
  const html = renderToStaticMarkup(<NeedsYouList items={[item(amina)]} />)

  it('is a region named "Guidance for Amina\'s family"', () => {
    expect(html).toMatch(/<section aria-labelledby="[^"]+" class="[^"]*">\s*<div class="flex items-start gap-3">/)
    expect(words(html)).toContain("Guidance for Amina's family")
  })

  it("shows the card's text in plain view: the headline, each focus item with its reason, and what is coming", () => {
    const text = words(html)
    expect(text).toContain(amina.headline)
    for (const f of amina.focus) {
      expect(text).toContain(f.title)
      expect(text).toContain(f.why)
    }
    expect(text).toContain('Looking ahead: Next up is subtracting fractions.')
    expect(text).toContain('Jemma wrote this card. The family sees it only after you send it.')
  })

  it('has one button, "Send to family", and nothing to edit the card with', () => {
    expect(count(html, 'button')).toBe(1)
    expect(html).toMatch(/<button[^>]*>Send to family<\/button>/)
    expect(count(html, 'textarea')).toBe(0)
    expect(count(html, 'input')).toBe(0)
    expect(count(html, 'a')).toBe(0)
  })

  it('counts in Needs you, with the other items, and the other items are drawn as they were', () => {
    const both = renderToStaticMarkup(<NeedsYouList items={[mark, item(amina), item(thabo)]} />)
    expect(words(both)).toMatch(/^Needs you 3 /)
    expect(both).toContain('href="/t/c1/needs-you/n1"')
    expect(words(both)).toContain('Check Sipho question 7')
    expect(count(both, 'button')).toBe(2)
    expect(words(both)).toContain("Guidance for Thabo's family")
  })

  it('has the button of a card with no focus items too', () => {
    const only = words(renderToStaticMarkup(<NeedsYouList items={[item(thabo)]} />))
    expect(only).toContain('Thabo is steady.')
    expect(only).toContain('Looking ahead: Next up is decimals.')
    expect(only).toContain('Send to family')
  })

  it('is drawn in the wide layout of the laptop with the same words and button', () => {
    const wide = renderToStaticMarkup(<NeedsYouList items={[item(amina)]} wide />)
    expect(words(wide)).toContain("Guidance for Amina's family")
    expect(words(wide)).toContain(amina.headline)
    expect(wide).toMatch(/<button[^>]*>Send to family<\/button>/)
    expect(wide).toContain('flex-[1_1_100%]')
  })

  it('draws no item when nothing waits', () => {
    expect(renderToStaticMarkup(<NeedsYouList items={[]} />)).toBe('')
  })

  it('gives the button room: a minimum height and room at the sides, so a long label can take a second line', () => {
    const button = /<button[^>]*class="([^"]*)"[^>]*>Send to family/.exec(html)![1]!
    expect(button).toMatch(/min-h-\[52px\]/)
    expect(button).toMatch(/!px-5/)
    expect(button).toMatch(/w-full/)
  })
})

describe('the class home shows the same item on the phone and on the laptop', () => {
  const needs = [item(amina), item(thabo)]

  it('the phone class home', async () => {
    state.home = home(needs)
    const el = await TeacherClassHome({ params: Promise.resolve({ classId: 'c1' }), searchParams: Promise.resolve({}) })
    const html = renderToStaticMarkup(el)
    expect(words(html)).toContain("Guidance for Amina's family")
    expect(words(html)).toContain("Guidance for Thabo's family")
    expect(words(html)).toContain(amina.headline)
    expect(html.match(/>Send to family</g)).toHaveLength(2)
  })

  it('the phone class home on the morning after a lesson', async () => {
    state.home = home(needs, { mode: 'next', headline: 'Fractions is still the gap.' })
    const el = await TeacherClassHome({ params: Promise.resolve({ classId: 'c1' }), searchParams: Promise.resolve({}) })
    const html = renderToStaticMarkup(el)
    expect(words(html)).toContain("Guidance for Amina's family")
    expect(html.match(/>Send to family</g)).toHaveLength(2)
    expect(words(html)).not.toContain('Nothing right now.')
  })

  it('the laptop class home', () => {
    const html = renderToStaticMarkup(<LaptopHome home={home(needs)} detail={null} base="/t/c1" classId="c1" />)
    expect(words(html)).toContain("Guidance for Amina's family")
    expect(words(html)).toContain(amina.headline)
    expect(html.match(/>Send to family</g)).toHaveLength(2)
  })

  it('both draw the card text from the same words', () => {
    const laptop = words(renderToStaticMarkup(<LaptopHome home={home([item(amina)])} detail={null} base="/t/c1" classId="c1" />))
    for (const part of [guidanceWords(amina).title, guidanceWords(amina).note, amina.headline, guidanceWords(amina).lookingAhead, 'Send to family']) expect(laptop).toContain(part)
  })

  it('with nothing waiting, no item and no button', async () => {
    state.home = home([])
    const el = await TeacherClassHome({ params: Promise.resolve({ classId: 'c1' }), searchParams: Promise.resolve({}) })
    expect(renderToStaticMarkup(el)).not.toContain('Send to family')
  })
})
