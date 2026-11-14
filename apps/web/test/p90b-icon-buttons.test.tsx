import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

// P90b: an icon and the words of a button are one centred group. When a long label wraps to two lines the icon stays beside the first line, with
// the words, and does not sit alone at the far edge of the button. The coral "Try again" of the practice card has the same room as every big
// button. react-dom/server only: no server, no browser, no database.

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => undefined, refresh: () => undefined }), usePathname: () => '/k', useSearchParams: () => new URLSearchParams() }))
vi.mock('../app/k/actions', () => ({ startPractice: async () => ({ ok: true }), retryPractice: async () => ({ ok: true }) }))
vi.mock('@/lib/auth', () => ({ signInChild: async () => ({ ok: true }), signOutChild: async () => undefined }))

import { IconLabel } from '@/components/ui/IconLabel'
import { PracticeCard } from '../app/k/PracticeCard'
import { PractiseButton } from '../app/k/Practise'
import { LearnDiagram } from '../app/k/session/_parts/LearnDiagram'
import { PaperChoice, PaperFailed, PaperSheet } from '../app/k/session/_parts/Paper'
import { LoadError } from '../app/k/session/_parts/Status'
import type { LessonForChild } from '../app/k/session/[sessionId]/types'
import { ReportActions } from '../app/p/[childId]/report/actions'

const noop = () => undefined
const html = (node: React.ReactElement) => {
  const el = document.createElement('div')
  el.innerHTML = renderToStaticMarkup(node)
  return el
}
const byText = (root: Element, selector: string, text: string) => [...root.querySelectorAll(selector)].find((e) => (e.textContent ?? '').trim() === text)!

/** The words a button shows: its text without the words kept for a screen reader. */
const words = (el: Element) => {
  const copy = el.cloneNode(true) as HTMLElement
  copy.querySelectorAll('.sr-only').forEach((e) => e.remove())
  return (copy.textContent ?? '').trim()
}

/**
 * The icon is inside the group of words, beside its first word, never a flex item of its own at the edge of the button. The group is centred and
 * balanced, and the first word is kept with the icon so the icon is never alone at the end of a line.
 */
function expectGroup(button: Element, label: string) {
  const where = `${label}: ${button.outerHTML.slice(0, 160)}`
  expect(words(button), where).toBe(label)
  expect(button.querySelector(':scope > svg'), `${where} (no icon of its own beside the words)`).toBeNull()
  const icon = button.querySelector('svg')
  expect(icon, `${where} (an icon)`).not.toBeNull()
  const group = icon!.closest('span.text-center')
  expect(group, `${where} (a centred group)`).not.toBeNull()
  expect(group!.classList.contains('text-balance'), `${where} (balanced)`).toBe(true)
  expect(group!.parentElement, `${where} (the group is the content of the button)`).toBe(button)
  const keep = icon!.closest('.whitespace-nowrap')
  expect(keep, `${where} (icon kept with its first word)`).not.toBeNull()
  expect((keep!.textContent ?? '').trim(), where).toBe(label.split(' ')[0])
  expect(icon!.closest('[aria-hidden="true"]'), `${where} (the icon is hidden from a screen reader)`).not.toBeNull()
}

describe('IconLabel', () => {
  const draw = (node: React.ReactElement) => html(<div>{node}</div>).firstElementChild!
  const icon = <svg width="20" height="20" />

  it('puts the icon and the first word in one piece, and the rest of the words after it', () => {
    const el = draw(<IconLabel icon={icon}>Take a photo of your answers</IconLabel>)
    expect(el.querySelector('.whitespace-nowrap')!.textContent).toBe('Take')
    expect(el.textContent).toBe('Take a photo of your answers')
  })

  it('one word is one piece; words with a name in the middle keep every word', () => {
    expect(draw(<IconLabel icon={icon}>Start</IconLabel>).textContent).toBe('Start')
    const el = draw(<IconLabel icon={icon}>Start, then hand {'Amina'} the phone</IconLabel>)
    expect(el.textContent).toBe('Start, then hand Amina the phone')
    expect(el.querySelector('.whitespace-nowrap')!.textContent).toBe('Start,')
  })
})

describe('icon buttons of the learner: icon and words are one group', () => {
  it('"Take a photo of your answers", the busy one and "Take the photo again"', () => {
    for (const busy of [false, true]) {
      const sheet = html(<PaperSheet questions={[]} busy={busy} error={null} onPhoto={noop} onScreen={noop} />)
      expectGroup(sheet.querySelector('label')!, busy ? 'Sending your photo...' : 'Take a photo of your answers')
    }
    expectGroup(html(<PaperFailed busy={false} error={null} onPhoto={noop} onScreen={noop} />).querySelector('label')!, 'Take the photo again')
  })

  it('"Answer on paper" and "Answer on the screen"', () => {
    const page = html(<PaperChoice onPaper={noop} onScreen={noop} />)
    expectGroup(byText(page, 'button', 'Answer on paper'), 'Answer on paper')
    expectGroup(byText(page, 'button', 'Answer on the screen'), 'Answer on the screen')
  })

  it('the big Practise button, "Try again" and "Again"', () => {
    expectGroup(html(<PractiseButton choice={{ topicName: 'Fractions' }} label="Practise Fractions" size="big" />).querySelector('button')!, 'Practise Fractions')
    expectGroup(byText(html(<LoadError onRetry={noop} warmupHref={noop} />), 'button', 'Try again'), 'Try again')
    const lesson: LessonForChild = {
      title: 'Lesson', format: 'diagram', minutes: 5, topicName: 'Fractions', warmupCount: 2, tryCount: 5, first: null,
      diagram: { title: 'A title', caption: 'A caption', steps: [{ caption: 'A step', diagram: { kind: 'fraction_bar', rows: [{ parts: 2, shaded: 1 }] } }] },
    }
    expectGroup(byText(html(<LearnDiagram lesson={lesson} onReady={noop} />), 'button', 'Again'), 'Again')
  })

  it('"Try again" of the practice card', () => {
    const page = html(<PracticeCard state="failed" suggestion={null} />)
    expectGroup(byText(page, 'button', 'Try again'), 'Try again')
  })

  it('the icon is not an item of the button any more, so the 20 px at each side stay: the button keeps its px-5', () => {
    const page = html(<PaperSheet questions={[]} busy={false} error={null} onPhoto={noop} onScreen={noop} />)
    const classes = [...page.querySelector('label')!.classList]
    expect(classes).toContain('px-5')
    expect(classes).toContain('text-center')
  })
})

describe('the practice card "Try again" has room', () => {
  it('px-5, a min-h, no fixed h, centred and balanced words, 20 px on a phone', () => {
    const button = byText(html(<PracticeCard state="failed" suggestion={null} />), 'button', 'Try again')
    const classes = [...button.classList]
    expect(classes).toContain('px-5')
    expect(classes.some((c) => c.startsWith('min-h-'))).toBe(true)
    expect(classes.filter((c) => /^h-(\[|\d)/.test(c))).toEqual([])
    expect(classes).toContain('text-center')
    expect(classes).toContain('text-balance')
    expect(classes).toContain('text-[20px]')
  })
})

describe('icon buttons of the parent: icon and words are one group', () => {
  it('"Download PDF" and "Share a copy"', () => {
    const page = html(<ReportActions />)
    expectGroup(byText(page, 'button', 'Download PDF'), 'Download PDF')
    expectGroup(byText(page, 'button', 'Share a copy'), 'Share a copy')
  })
})
