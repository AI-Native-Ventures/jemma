import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// P123: the phone's bottom bar is slimmer (a bar of about 60 to 64 px plus the safe-area inset, icons 20 px, labels 12 or 13 px semibold, a smaller pill,
// a Snap button of 48 px that is only a little raised) and a learner reaches their profile from it: My maths, Me (P128: the home is My maths, there is no
// Today tab). Every tap target stays at
// least 44 by 44 px. A hand-over bar (`only`) keeps its own subset, and the laptop sidebar keeps its tabs. react-dom only: no browser, no server,
// no database.

const state = vi.hoisted(() => ({ pathname: null as string | null }))
vi.mock('next/navigation', () => ({ usePathname: () => state.pathname }))

import { Sidebar, TabBar } from '@/components/blocks'
import type { TabId } from '@/components/blocks'

beforeEach(() => {
  state.pathname = null
})

type Bar = { role: 'teacher' | 'parent' | 'learner'; active: TabId; label: string; base?: string; only?: TabId[] }
const draw = (bar: Bar) => render(<TabBar {...bar} />).container.querySelector('nav') as HTMLElement
const links = (nav: HTMLElement) => [...nav.querySelectorAll('a')]
const words = (nav: HTMLElement) => links(nav).map((a) => a.textContent?.trim())
const hrefs = (nav: HTMLElement) => links(nav).map((a) => a.getAttribute('href'))
const marked = (nav: HTMLElement) => links(nav).filter((a) => a.getAttribute('aria-current') === 'page').map((a) => a.textContent?.trim())

const learner: Bar = { role: 'learner', active: 'maths', label: "Amina's Jemma" }
const parent: Bar = { role: 'parent', active: 'profile', label: 'Amina', base: '/p/c1' }
const teacher: Bar = { role: 'teacher', active: 'class', label: '6B', base: '/t/k1' }

describe('the learner bar: My maths, Me', () => {
  it('has two tabs with the addresses /k and /k/me, in that order, and no Today', () => {
    const nav = draw(learner)
    expect(words(nav)).toEqual(['My maths', 'Me'])
    expect(hrefs(nav)).toEqual(['/k', '/k/me'])
    expect(nav.textContent).not.toContain('Today')
  })

  it('marks Me on the account page and on a page under it, and only Me', () => {
    state.pathname = '/k/me'
    expect(marked(draw(learner))).toEqual(['Me'])
    state.pathname = '/k/me/'
    expect(marked(draw(learner))).toEqual(['Me'])
    state.pathname = '/k/me/pin'
    expect(marked(draw(learner))).toEqual(['Me'])
  })

  it('marks My maths on /k, /k/maths, the screens below it and the learner\'s own work, and does not mark Me on a page that only starts with the letters', () => {
    for (const path of ['/k', '/k/maths', '/k/maths/fractions', '/k/own', '/k/memory']) {
      state.pathname = path
      expect(marked(draw(learner)), path).toEqual(['My maths'])
    }
  })

  it('holds the tab the server passed where the address cannot be read (the first paint)', () => {
    state.pathname = null
    expect(marked(draw({ ...learner, active: 'me' }))).toEqual(['Me'])
  })

  it('a hand-over bar (`only`) is the one tab, My maths, and has no Me', () => {
    const nav = draw({ ...learner, label: 'Practise at home', only: ['maths'] })
    expect(words(nav)).toEqual(['My maths'])
    expect(hrefs(nav)).toEqual(['/k'])
    expect(nav.textContent).not.toContain('Me')
  })

  it('an empty `only` draws no bar at all', () => {
    expect(draw({ ...learner, only: [] })).toBeNull()
  })

  it('the laptop sidebar of a learner has My maths: Me is a phone tab (the sidebar has Settings)', () => {
    const { container } = render(
      <Sidebar role="learner" active="maths" label="Amina" name="Amina" subtitle="Grade 6" switchHref="/k" user={{ name: 'A', initials: 'A' }} settingsHref="/k/me" />,
    )
    const nav = container.querySelector('nav') as HTMLElement
    expect(words(nav)).toEqual(['My maths'])
    expect(container.querySelector('a[aria-label="Settings"]')?.getAttribute('href')).toBe('/k/me')
  })
})

describe('the parent and the teacher bars keep their tabs', () => {
  it('parent: Profile, Learn, Snap, Tests, with Snap raised in the middle', () => {
    const nav = draw(parent)
    expect(words(nav)).toEqual(['Profile', 'Learn', 'Snap', 'Tests'])
    expect(hrefs(nav)).toEqual(['/p/c1', '/p/c1/learn', '/p/c1/snap', '/p/c1/tests'])
    expect(links(nav).map((a) => Boolean(a.querySelector('[data-raised="true"]')))).toEqual([false, false, true, false])
  })

  it('teacher: Class, Learners, Snap, Tests, Curriculum, with Snap raised in the middle', () => {
    const nav = draw(teacher)
    expect(words(nav)).toEqual(['Class', 'Learners', 'Snap', 'Tests', 'Curriculum'])
    expect(hrefs(nav)).toEqual(['/t/k1', '/t/k1/learners', '/t/k1/snap', '/t/k1/tests', '/t/k1/curriculum'])
    expect(links(nav).map((a) => Boolean(a.querySelector('[data-raised="true"]')))).toEqual([false, false, true, false, false])
  })

  it('the parent bar of a child on their own (`only` empty) draws nothing, as before', () => {
    expect(draw({ ...parent, only: [] })).toBeNull()
  })

  it('the learner has no raised button', () => {
    expect(draw(learner).querySelector('[data-raised="true"]')).toBeNull()
  })
})

/** The px a Tailwind class names: `min-h-[52px]` is 52, `min-h-11` is 44 (a step is 4 px), `size-12` is 48. */
const px = (cls: string, prefix: string): number | null => {
  const exact = new RegExp(`^${prefix}-\\[(\\d+(?:\\.\\d+)?)px\\]$`).exec(cls)
  if (exact) return Number(exact[1])
  const step = new RegExp(`^${prefix}-(\\d+(?:\\.\\d+)?)$`).exec(cls)
  return step ? Number(step[1]) * 4 : null
}
const sizeOf = (el: Element, prefix: string): number | null =>
  el.className.split(/\s+/).map((c) => px(c, prefix)).find((n) => n !== null) ?? null

/** The height a tab has at least: its `min-h`, or for the tab with the raised Snap button what the button, its lift, the gap, the label (about 15 px) and the space under it add up to. */
const tabHeight = (a: Element): number => {
  const minimum = sizeOf(a, 'min-h') ?? 0
  const circle = a.querySelector('[data-raised="true"]')
  if (!circle) return minimum
  const content = (sizeOf(circle, 'size') ?? 0) - (sizeOf(circle, '-mt') ?? 0) + (sizeOf(a, 'gap') ?? 0) + 15 + (sizeOf(a, 'pb') ?? 0)
  return Math.max(minimum, content)
}

describe('every tab is a tap target of at least 44 by 44 px', () => {
  const bars: [string, Bar][] = [
    ['learner', learner],
    ['learner hand-over', { ...learner, only: ['maths'] }],
    ['parent', parent],
    ['teacher', teacher],
  ]

  it.each(bars)('%s: each link is at least 44 px tall', (_name, bar) => {
    for (const a of links(draw(bar))) {
      expect(sizeOf(a, 'min-h'), `${a.textContent} has a min-h class`).toBeGreaterThanOrEqual(44)
    }
  })

  it.each(bars)('%s: each link is at least 44 px wide on the narrowest phone (320 px)', (_name, bar) => {
    const nav = draw(bar)
    const side = (sizeOf(nav, 'px') ?? 0) * 2
    const cell = (320 - side) / links(nav).length
    expect(cell).toBeGreaterThanOrEqual(44)
  })

  it('the icon pill and the Snap button are drawn inside the link, never smaller than the 44 px the link gives', () => {
    for (const bar of [learner, parent, teacher]) {
      for (const a of links(draw(bar))) {
        // The link is the target, not the pill: the pill may be smaller than 44 px, the link is not.
        expect(a.className).toMatch(/min-h-/)
        expect(a.className).toMatch(/flex/)
      }
    }
  })
})

describe('the bar is slimmer', () => {
  it('has about 60 to 64 px of bar plus the safe-area inset, and no fixed 22 px of padding under the tabs', () => {
    for (const bar of [learner, parent, teacher]) {
      const nav = draw(bar)
      expect(nav.className).not.toContain('pb-[22px]')
      expect(nav.getAttribute('style')).toContain('env(safe-area-inset-bottom)')
      // nominal height: the border, the padding above and below the tabs (the inset is on top of it) and the tallest tab
      const above = sizeOf(nav, 'pt') ?? 0
      const below = Number(/(\d+(?:\.\d+)?)px/.exec(nav.getAttribute('style') ?? '')?.[1] ?? 0)
      const tallest = Math.max(...links(nav).map(tabHeight))
      const total = 1 + above + below + tallest
      expect(total, `the ${bar.role} bar is ${total} px`).toBeGreaterThanOrEqual(58)
      expect(total, `the ${bar.role} bar is ${total} px`).toBeLessThanOrEqual(64)
    }
  })

  it('draws the tab icons at 20 px, and the labels at 12 or 13 px, semibold', () => {
    for (const bar of [learner, parent, teacher]) {
      for (const a of links(draw(bar))) {
        const raised = a.querySelector('[data-raised="true"]')
        const svg = a.querySelector('svg') as SVGElement
        if (!raised) expect(svg.getAttribute('width')).toBe('20')
        expect(a.className).toMatch(/text-\[1[23]px\]/)
        expect(a.className).toContain('font-semibold')
      }
    }
  })

  it('has a smaller active pill than before (it was 64 by 32 on the learner bar and 56 by 30 on the others)', () => {
    for (const bar of [learner, parent, teacher]) {
      const nav = draw(bar)
      const pill = links(nav).flatMap((a) => (a.querySelector('[data-raised="true"]') ? [] : [a.querySelector('span') as HTMLElement]))[0]!
      expect(sizeOf(pill, 'h')).toBeLessThanOrEqual(28)
      expect(sizeOf(pill, 'w')).toBeLessThanOrEqual(52)
    }
  })

  it('the marked tab has the soft pill and the others have none', () => {
    state.pathname = '/k/me'
    const nav = draw(learner)
    const pills = links(nav).map((a) => (a.querySelector('span') as HTMLElement).className.includes('bg-soft-4'))
    expect(pills).toEqual([false, true])
  })

  it('the Snap button is about 48 px and only a little raised', () => {
    for (const bar of [parent, teacher]) {
      const circle = draw(bar).querySelector('[data-raised="true"]') as HTMLElement
      expect(sizeOf(circle, 'size')).toBe(48)
      const lifted = sizeOf(circle, '-mt')
      expect(lifted, 'a negative top margin').not.toBeNull()
      expect(lifted).toBeGreaterThan(0)
      expect(lifted).toBeLessThanOrEqual(12)
    }
  })
})

describe('the bar file keeps its rules', () => {
  const src = readFileSync(resolve(import.meta.dirname, '../components/blocks/TabBar.tsx'), 'utf8')

  it('is still a direct child nav that a screen with its own header can hide with CSS (`> nav`), and sticks to the bottom', () => {
    expect(src).toContain('<nav')
    expect(src).toContain('sticky bottom-0')
    expect(src).toContain('lg:hidden')
  })

  it('has no em dash and no old 22 px', () => {
    expect(src).not.toContain(String.fromCharCode(0x2014))
    expect(src).not.toContain('pb-[22px]')
  })
})
