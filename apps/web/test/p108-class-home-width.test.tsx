// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

// P108: the teacher's class home is never wider than the screen. A gap card shows the learner's own question and answer ("the example"), which can
// be long, and it used to keep that text on one line (`whitespace-nowrap`): on a 390 px phone the page was 23 px wider than the screen, the browser
// zoomed it out, and a tap far down the page missed its button. The example now wraps, and a word longer than the line is broken. The browser run
// (the demo path, which checks the page width right before Share with parents and Send to family) checks the width itself; these tests read the
// markup and the files: no server, no browser, no database.

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

import { GuidanceNeedItem, type GuidanceNeed } from '@/components/blocks/GuidanceNeed'
import type { ClassGapView, ClassHome } from '@/lib/data/p18'
import { LaptopHome } from '../app/t/[classId]/LaptopHome'
import TeacherClassHome from '../app/t/[classId]/page'

const webRoot = resolve(import.meta.dirname, '..')
const read = (file: string) => readFileSync(resolve(webRoot, file), 'utf8')

/** A question of a class test as a learner wrote it: long, with a number that has no space in it to break at. */
const LONG_PROMPT = 'What is 2 3/4 + 1 2/3 + 3 5/12 + 4 7/8 written as one mixed number in its simplest form'
const LONG_STRONG = `${LONG_PROMPT} = 12111111111111111111111111111111111111`

const gap = (over: Partial<ClassGapView> = {}): ClassGapView =>
  ({
    key: 'adding-fractions',
    topicName: 'Adding fractions with different denominators',
    shortName: 'Adding fractions',
    count: 3,
    total: 5,
    counts: { practising: 0, new: 3 },
    learners: [],
    mistake: { label: 'Adds the tops and the bottoms', seen: 4, example: { pre: '', strong: LONG_STRONG }, rows: [{ n: 7, text: LONG_STRONG, learners: 3 }] },
    partners: [],
    nextLesson: null,
    ...over,
  }) as unknown as ClassGapView

const home = (over: Partial<ClassHome> = {}): ClassHome => ({
  mode: 'home',
  headline: '3 of 5 learners add the tops and the bottoms.',
  dateLabel: 'Sun 15 Nov',
  needsYou: [],
  doneName: null,
  gaps: [gap()],
  reteach: null,
  latestTest: null,
  lastNightSessions: [],
  waiting: [],
  activity: [],
  topGapKey: 'adding-fractions',
  shareCard: null,
  ...over,
})

const phone = async () => {
  state.home = home()
  return renderToStaticMarkup(await TeacherClassHome({ params: Promise.resolve({ classId: 'c1' }), searchParams: Promise.resolve({}) }))
}

/** The opening tag (its class list) of the element that holds `text`, found by walking back to the `<` before it. */
const tagBefore = (html: string, text: string): string => {
  const at = html.indexOf(text)
  expect(at, `the text "${text.slice(0, 30)}" is on the screen`).toBeGreaterThan(0)
  return html.slice(html.lastIndexOf('<', at), at)
}

describe('the gap card of the phone class home', () => {
  it('keeps the whole example on the screen, and lets it wrap', async () => {
    const html = await phone()
    expect(html).toContain(LONG_STRONG)
    expect(tagBefore(html, LONG_STRONG)).not.toMatch(/nowrap/)
    expect(tagBefore(html, LONG_STRONG)).toMatch(/^<strong class="font-bold">$/)
  })

  it('breaks a word that is longer than the line, so the card never pushes the page wider', async () => {
    const html = await phone()
    const chip = html.slice(html.lastIndexOf('<span class="ml-10', html.indexOf(LONG_STRONG)), html.indexOf(LONG_STRONG))
    expect(chip).toMatch(/\[overflow-wrap:anywhere\]/)
    expect(chip).not.toMatch(/nowrap/)
  })
})

describe('the gap cards of the laptop class home', () => {
  it('wrap the example in the list and in the detail rows', () => {
    const detail = { index: 0, of: 1, gap: gap(), testTitle: 'Class Test 1', why: 'Why.', reteach: null }
    const html = renderToStaticMarkup(<LaptopHome home={home()} detail={detail as never} base="/t/c1" classId="c1" />)
    expect(html).not.toMatch(/nowrap/)
    const list = html.slice(html.lastIndexOf('<span class="ml-10', html.indexOf(LONG_STRONG)), html.indexOf(LONG_STRONG))
    expect(list).toMatch(/\[overflow-wrap:anywhere\]/)
    expect(html).toMatch(/<span class="text-\[17px\] font-bold \[overflow-wrap:anywhere\]">What is 2 3\/4/)
  })
})

describe('the guidance card in Needs you', () => {
  // Jemma wrote the card, so a word in it can be longer than the line (a long fraction, a name, an address). It breaks, so the card is never wider than the screen
  // and the Send to family button under it can be tapped where it is drawn.
  const guidance: GuidanceNeed = {
    classId: 'c1',
    childId: 'amina',
    firstName: 'Amina',
    headline: `Amina wrote ${LONG_STRONG} and was close.`,
    focus: [{ title: 'Adding fractions', why: `She wrote ${LONG_STRONG} twice.` }],
    lookingAhead: `Next week: ${LONG_STRONG}.`,
  }

  it('breaks a word that is longer than the line, on the phone and on the laptop', () => {
    for (const wide of [false, true]) {
      const html = renderToStaticMarkup(<GuidanceNeedItem guidance={guidance} wide={wide} />)
      expect(html).toContain(LONG_STRONG)
      const section = html.slice(0, html.indexOf('>') + 1)
      expect(section).toMatch(/^<section /)
      expect(section).toMatch(/\[overflow-wrap:anywhere\]/)
      expect(section).not.toMatch(/nowrap/)
    }
  })
})

describe('no line of the class home or of a gap card is kept on one line', () => {
  // The class home (phone and laptop), its Needs you list, its cards and the gap page. A `whitespace-nowrap` on a text that a learner, a parent or Jemma
  // wrote (a question, a name, a sentence) is a page that can be wider than the screen. A new one needs a reason, and a line in the list below.
  const files = [
    'app/t/[classId]/page.tsx',
    'app/t/[classId]/LaptopHome.tsx',
    'app/t/[classId]/ShareCard.tsx',
    'app/t/[classId]/gaps/[topicKey]/page.tsx',
    'components/blocks/NeedsYouList.tsx',
    'components/blocks/GuidanceNeed.tsx',
    'components/blocks/WhatJemmaDid.tsx',
    'components/blocks/Headline.tsx',
    'components/blocks/EmptyLine.tsx',
    'components/blocks/EmptyState.tsx',
    'components/blocks/SpaceHeader.tsx',
    'components/blocks/TabBar.tsx',
  ]
  const ALLOWED: { file: string; why: string }[] = []

  it.each(files)('%s has no whitespace-nowrap, no nowrap and no truncate', (file) => {
    const lines = read(file).split('\n').flatMap((text, i) => (/whitespace-nowrap|nowrap|\btruncate\b/.test(text) ? [`${file}:${i + 1} ${text.trim().slice(0, 100)}`] : []))
    expect(lines.filter((l) => !ALLOWED.some((a) => l.startsWith(a.file)))).toEqual([])
  })

  it('catches the line it is looking for', () => {
    expect(/whitespace-nowrap|nowrap|\btruncate\b/.test('<strong className="font-bold whitespace-nowrap">{x}</strong>')).toBe(true)
    expect(/whitespace-nowrap|nowrap|\btruncate\b/.test('<strong className="font-bold">{x}</strong>')).toBe(false)
  })
})
