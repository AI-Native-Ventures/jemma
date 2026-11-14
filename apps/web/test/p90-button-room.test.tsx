import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

// P90: a big button on the learner's phone has room around its words. Each button of the learner's session screens is drawn from its props
// alone (react-dom/server, no server, no browser, no database) and its class list is checked against the rule: at least 20 px of space at each
// side (px-5 or more), a minimum height and no fixed one (so a long label can take two lines), the words centred and balanced, a phone size of
// 20 px or less, and an icon that never shrinks. The labels do not change.

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => undefined, refresh: () => undefined }), usePathname: () => '/k', useSearchParams: () => new URLSearchParams() }))
// The server actions would pull in the database client: they are never called here.
vi.mock('../app/k/actions', () => ({ startPractice: async () => ({ ok: true }), retryPractice: async () => ({ ok: true }) }))
vi.mock('@/lib/auth', () => ({ signInChild: async () => ({ ok: true }), signOutChild: async () => undefined }))

import { PractiseButton } from '../app/k/Practise'
import { LearnAudio } from '../app/k/session/_parts/LearnAudio'
import { LearnCards } from '../app/k/session/_parts/LearnCards'
import { LearnDiagram } from '../app/k/session/_parts/LearnDiagram'
import { PaperChoice, PaperFailed, PaperSheet } from '../app/k/session/_parts/Paper'
import { QuestionScreen } from '../app/k/session/_parts/QuestionScreen'
import { LoadError, Progress } from '../app/k/session/_parts/Status'
import type { QuestionForChild } from '../app/k/session/[sessionId]/logic'
import type { FinishedSession, LessonForChild } from '../app/k/session/[sessionId]/types'
import { MeForm } from '../app/k/me/MeForm'
import { SignInForm } from '../app/k/sign-in/SignInForm'

const noop = () => undefined
const html = (node: React.ReactElement) => {
  const el = document.createElement('div')
  el.innerHTML = renderToStaticMarkup(node)
  return el
}

/** The pixels of a Tailwind spacing class on the 4 px scale (px-5 is 20) or in brackets (px-[22px]); null if the class is not that. */
function pixels(cls: string, prefix: string): number | null {
  const scale = new RegExp(`^${prefix}-(\\d+(?:\\.\\d+)?)$`).exec(cls)
  if (scale) return Number(scale[1]) * 4
  const arbitrary = new RegExp(`^${prefix}-\\[(\\d+(?:\\.\\d+)?)px\\]$`).exec(cls)
  return arbitrary ? Number(arbitrary[1]) : null
}

/** The space this class list leaves at the left and at the right: from px-N, or from pl-N and pr-N. Missing is 0. */
function sides(classes: string[]): { left: number; right: number } {
  const both = classes.map((c) => pixels(c, 'px')).find((n) => n !== null) ?? null
  const left = classes.map((c) => pixels(c, 'pl')).find((n) => n !== null) ?? both ?? 0
  const right = classes.map((c) => pixels(c, 'pr')).find((n) => n !== null) ?? both ?? 0
  return { left, right }
}

/** The size in px of the phone text (the `text-[Npx]` class with no breakpoint in front of it). */
function phoneText(classes: string[]): number | null {
  const found = classes.map((c) => /^text-\[(\d+)px\]$/.exec(c)).find((m) => m !== null)
  return found ? Number(found[1]) : null
}

/** The rule for every big button of the learner's screens. `phone20` is on for a full-width button, whose words may not be bigger than 20 px. */
function expectRoom(el: Element, name: string, { phone20 = false } = {}) {
  const classes = [...el.classList]
  const where = `${name}: ${el.className}`
  const { left, right } = sides(classes)
  expect(left, `${where} (space at the left)`).toBeGreaterThanOrEqual(20)
  expect(right, `${where} (space at the right)`).toBeGreaterThanOrEqual(20)
  expect(
    classes.some((c) => c.startsWith('min-h-')),
    `${where} (a min-h)`,
  ).toBe(true)
  expect(
    classes.filter((c) => /^h-(\[|\d)/.test(c)),
    `${where} (no fixed h)`,
  ).toEqual([])
  expect(classes, `${where} (words centred)`).toContain('text-center')
  expect(classes, `${where} (words balanced)`).toContain('text-balance')
  if (phone20) expect(phoneText(classes) ?? 0, `${where} (phone text size)`).toBeLessThanOrEqual(20)
  // An icon beside the words never shrinks.
  for (const icon of el.querySelectorAll(':scope > svg')) {
    const cls = (icon.getAttribute('class') ?? '').split(/\s+/)
    expect(cls.some((c) => c === 'flex-none' || c === 'shrink-0'), `${where} (an icon that does not shrink)`).toBe(true)
  }
}

const ask = (over: Partial<QuestionForChild>): QuestionForChild => ({ position: 1, phase: 'try', index: 1, of: 5, prompt: 'Work it out', render: 'text', answerKind: 'whole', ...over })
const base: LessonForChild = { title: 'Lesson', format: 'reading', minutes: 5, topicName: 'Fractions', warmupCount: 2, tryCount: 5, first: null }
const byText = (root: Element, selector: string, text: string) => [...root.querySelectorAll(selector)].find((e) => (e.textContent ?? '').trim() === text)!

describe('Answer on paper', () => {
  it('"Answer on paper" and "Answer on the screen" have room', () => {
    const page = html(<PaperChoice onPaper={noop} onScreen={noop} />)
    const buttons = [...page.querySelectorAll('button')]
    expect(buttons.map((b) => b.textContent)).toEqual(['Answer on paper', 'Answer on the screen'])
    buttons.forEach((b) => expectRoom(b, b.textContent!, { phone20: true }))
  })

  it('"Take a photo of your answers" has room, and so has the busy one', () => {
    for (const busy of [false, true]) {
      const page = html(<PaperSheet questions={[ask({ index: 1 })]} busy={busy} error={null} onPhoto={noop} onScreen={noop} />)
      const photo = page.querySelector('label')!
      expect(photo.textContent).toBe(busy ? 'Sending your photo...' : 'Take a photo of your answers')
      expectRoom(photo, 'Take a photo of your answers', { phone20: true })
    }
  })

  it('"Take the photo again" has room', () => {
    const page = html(<PaperFailed busy={false} error={null} onPhoto={noop} onScreen={noop} />)
    const photo = page.querySelector('label')!
    expect(photo.textContent).toBe('Take the photo again')
    expectRoom(photo, 'Take the photo again', { phone20: true })
  })
})

describe('the lesson screens', () => {
  const cards: LessonForChild = { ...base, cards: [{ heading: 'One', body: 'First card.' }, { heading: 'Two', body: 'Second card.' }] }
  const diagram: LessonForChild = {
    ...base,
    format: 'diagram',
    diagram: { title: 'A title', caption: 'A caption', steps: [{ caption: 'A step', diagram: { kind: 'fraction_bar', rows: [{ parts: 2, shaded: 1 }] } }] },
  }
  const audio: LessonForChild = { ...base, format: 'audio', audio: { script: 'One sentence. Another sentence.', url: null } }

  it('Back and Next card have room', () => {
    const page = html(<LearnCards lesson={cards} card={0} onBack={noop} onNext={noop} />)
    expectRoom(byText(page, 'button', 'Back'), 'Back')
    expectRoom(byText(page, 'button', 'Next card'), 'Next card')
  })

  it('Again and I am ready (diagram) have room', () => {
    const page = html(<LearnDiagram lesson={diagram} onReady={noop} />)
    expectRoom(byText(page, 'button', 'Again'), 'Again')
    expectRoom(byText(page, 'button', "I'm ready"), "I'm ready")
  })

  it('I am ready (audio) has room', () => {
    const page = html(<LearnAudio lesson={audio} firstName="Amina" onReady={noop} />)
    expectRoom(byText(page, 'button', "I'm ready"), "I'm ready")
  })
})

describe('the question and the end of a session', () => {
  it('Next has room', () => {
    const page = html(<QuestionScreen q={ask({ phase: 'warmup' })} busy={false} onAnswer={noop} />)
    expectRoom(byText(page, 'button', 'Next'), 'Next')
  })

  it('the answer buttons of a choice question have room, in the warm-up and in the try', () => {
    for (const phase of ['warmup', 'try'] as const) {
      const q = ask({ phase, answerKind: 'choice', choices: ['the same', 'none of these', '1/2', '1/4'] })
      const page = html(<QuestionScreen q={q} busy={false} onAnswer={noop} />)
      const tiles = [...page.querySelectorAll('button[aria-pressed]')]
      expect(tiles).toHaveLength(4)
      tiles.forEach((t, i) => expectRoom(t, `choice ${i + 1} (${phase})`))
    }
  })

  it('Try again and Do the warm-up first have room', () => {
    const page = html(<LoadError onRetry={noop} warmupHref={noop} />)
    expectRoom(byText(page, 'button', 'Try again'), 'Try again', { phone20: true })
    expectRoom(byText(page, 'button', 'Do the warm-up first'), 'Do the warm-up first')
  })

  it('Done has room', () => {
    const done: FinishedSession = { missed: [], stage: null, minutes: 5, topicName: 'Fractions', next: null }
    const page = html(<Progress done={done} onDone={noop} />)
    expectRoom(byText(page, 'button', 'Done'), 'Done')
  })
})

describe('the Practise button', () => {
  it('the big one has room, and its play icon does not shrink', () => {
    const page = html(<PractiseButton choice={{ topicName: 'Fractions' }} label="Practise Fractions" size="big" />)
    expectRoom(page.querySelector('button')!, 'big Practise', { phone20: true })
  })
})

describe('the two screens that style their buttons inline', () => {
  /** The inline style of a button as numbers: its min-height and the space it leaves at the left and the right. */
  const room = (el: Element) => {
    const s = (el as HTMLElement).style
    const pad = (value: string) => {
      const parts = value.split(/\s+/).map((p) => parseFloat(p))
      if (parts.length === 1) return { left: parts[0]!, right: parts[0]! }
      return { left: parts[3] ?? parts[1]!, right: parts[1]! }
    }
    const padding = s.padding ? pad(s.padding) : { left: parseFloat(s.paddingLeft || '0'), right: parseFloat(s.paddingRight || '0') }
    return { minHeight: parseFloat(s.minHeight || '0'), height: s.height, ...padding, textAlign: s.textAlign }
  }

  it('"I\'m done for today" has room', () => {
    const page = html(<MeForm firstName="Amina" initial="A" />)
    const r = room(byText(page, 'button', "I'm done for today"))
    expect(r.height).toBe('')
    expect(r.minHeight).toBeGreaterThanOrEqual(60)
    expect(r.left).toBeGreaterThanOrEqual(20)
    expect(r.right).toBeGreaterThanOrEqual(20)
  })

  it('"Sign in" has room', () => {
    const page = html(<SignInForm />)
    const r = room(byText(page, 'button', 'Sign in'))
    expect(r.height).toBe('')
    expect(r.minHeight).toBeGreaterThanOrEqual(64)
    expect(r.left).toBeGreaterThanOrEqual(20)
    expect(r.right).toBeGreaterThanOrEqual(20)
  })
})
