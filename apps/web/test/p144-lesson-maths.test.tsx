import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { segments } from '../app/k/session/_parts/typeset'
import { readableMaths } from '../lib/lesson-maths'
import { forScreen } from '../lib/teaching'

// P144b: a power with letters touching it ("ax^2", "ab^(x + p)") and "x in R" showed as raw text in a lesson (found on the live Grade 11 Functions lesson).
// The cause is in the shared typesetter (session/_parts/typeset.ts, `isProduct`): two or three letters with no number or bracket before them are a WORD in
// every class ("ab", "and/or"), so "ax^2" splits the line of maths. A lesson knows its text is maths, so it writes the product as separate letters
// ("a x^2") before the typesetter reads it. These are the exact strings of the live lesson. No database, no browser, no server.

vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
vi.mock('../lib/data/p27', () => ({ myChild: async () => ({ child: { first_name: 'Sam' } }) }))
vi.mock('../lib/data/teaching', () => ({
  resolveTopic: async () => ({ id: 't1', name: 'Functions', family: 'functions', grade: 11 }),
  libraryFor: async () => [
    { id: 'l1', position: 1, title: 'The parabola y = ax^2 + q', minutes: 14, done: false, started: false },
    { id: 'l2', position: 2, title: 'y = ab^(x + p) + q', minutes: 12, done: false, started: false },
  ],
}))
vi.mock('../app/k/learn/actions', () => ({ answerLessonQuestion: vi.fn(), startTopicLesson: vi.fn(async () => undefined), finishTopicLesson: vi.fn(async () => undefined) }))

import { LessonInline, LessonText } from '../app/k/learn/_parts/LessonText'
import LessonListPage from '../app/k/learn/[topicId]/page'
import { LearnFirstPanel } from '../app/k/learn/_parts/LearnFirstPanel'
import { LessonReader } from '../app/k/learn/_parts/LessonReader'

afterEach(() => cleanup())

/** The text the page shows in words: what is left when the drawn maths and the screen reader's copy are taken away. */
const words = (el: HTMLElement) => {
  const copy = el.cloneNode(true) as HTMLElement
  copy.querySelectorAll('.sr-only, [data-math]').forEach((n) => n.remove())
  return copy.textContent ?? ''
}
const drawn = (el: HTMLElement) => el.querySelectorAll('[data-math]').length

describe('readableMaths: what a lesson hands the typesetter', () => {
  it('writes letters that touch a power as separate letters, so the product is maths', () => {
    expect(readableMaths('The parabola y = ax^2 + q')).toBe('The parabola y = a x^2 + q')
    expect(readableMaths('y = ab^(x + p) + q')).toBe('y = a b^(x + p) + q')
    expect(readableMaths('y = abc^2')).toBe('y = a b c^2')
    expect(readableMaths('y = ax² + q')).toBe('y = a x² + q')
  })

  it('writes a product of letters between signs as separate letters', () => {
    expect(readableMaths('y = mx + c')).toBe('y = m x + c')
    expect(readableMaths('Solve ax + b = 0')).toBe('Solve a x + b = 0')
    expect(readableMaths('y = ax, where a is the gradient')).toBe('y = a x, where a is the gradient')
    expect(readableMaths('y = ax - q')).toBe('y = a x - q')
  })

  it('writes "x in R" as x ∈ ℝ', () => {
    expect(readableMaths('Domain: x in R')).toBe('Domain: x ∈ ℝ')
    expect(readableMaths('Range: y in R, y ≠ 0')).toBe('Range: y ∈ ℝ, y ≠ 0')
    expect(readableMaths('Domain: x ∈ R')).toBe('Domain: x ∈ ℝ')
  })

  it('leaves what already typesets exactly as it is', () => {
    for (const same of ['x^2 - 4', 'y = x^2', 'y = a(x + p)^2 + q', 'y = 2ax^2', 'sin^2 x + cos^2 x = 1', 'f(x) = x + 3', 'Add 3 + 4']) expect(readableMaths(same), same).toBe(same)
  })

  it('raises the power of the name of a side of a triangle, and never spaces its capitals', () => {
    expect(readableMaths('AB^2 = AC^2 + BC^2')).toBe('AB\u00b2 = AC\u00b2 + BC\u00b2')
    expect(readableMaths('OS^2 = 5^2 + 12^2')).toBe('OS\u00b2 = 5^2 + 12^2')
    expect(readableMaths('In triangle OQP: OP^2 = OQ^2 + QP^2 (Pythagoras).')).toBe('In triangle OQP: OP\u00b2 = OQ\u00b2 + QP\u00b2 (Pythagoras).')
  })

  it('writes a product in brackets and under a root as separate letters, only next to a sign', () => {
    expect(readableMaths('For y = sqrt(ax + b), the inside is not negative')).toBe('For y = sqrt(a x + b), the inside is not negative')
    expect(readableMaths('y = (ax + b)^2')).toBe('y = (a x + b)^2')
    expect(readableMaths('y = sin(kx) + 1')).toBe('y = sin(k x) + 1')
    // a unit or a word in brackets is a word: with no sign next to it, or with one ("P(red) + P(blue)"), and a run with no variable in it
    for (const same of ['The length is 5 (cm).', 'a width (km) and a depth', 'Use sqrt(3) (see below)', 'P(red) + P(blue) = 1', '(red) + (blue)', '(row) - (column)', 'y = (ab + c)']) expect(readableMaths(same), same).toBe(same)
    // units with a power are units
    for (const same of ['The area is 24 cm\u00b2.', 'a volume of 5 cm\u00b3', '3 mm\u00b2 + 4 mm\u00b2']) expect(readableMaths(same), same).toBe(same)
  })

  it('writes a product in an exponent, a product in a bracket with a power on it, and a power followed by a letter, with the letters apart', () => {
    expect(readableMaths('(a^m)^n = a^(mn)')).toBe('(a^m)^n = a^(m n)')
    expect(readableMaths('(xk)^2 = x^2k^2')).toBe('(x k)^2 = x^2 k^2')
    expect(readableMaths('(ab)^n = a^n b^n')).toBe('(a b)^n = a^n b^n')
    expect(readableMaths('18b^2q(4 - bq)')).toBe('18b^2 q(4 - bq)')
    // a unit with a power is not a product
    for (const same of ['The area is 5 (cm)^2', '3 (km)^2']) expect(readableMaths(same), same).toBe(same)
  })

  it('writes the power of a unit of length as the raised digit, so no caret shows', () => {
    expect(readableMaths('Area = 22 cm^2')).toBe('Area = 22 cm\u00b2')
    expect(readableMaths('V = 2^3 = 8 cm^3 and 4 mm^2.')).toBe('V = 2^3 = 8 cm\u00b3 and 4 mm\u00b2.')
    expect(readableMaths('= 30π cm^2')).toBe('= 30π cm\u00b2')
    // a variable m is not a unit, and a power of ten is left alone
    for (const same of ['m^2 = 9', 'cm^12']) expect(readableMaths(same), same).toBe(same)
  })

  it('leaves words alone, also next to a sign', () => {
    for (const same of [
      'The line is far from zero',
      'Compare this with that',
      'so - far',
      'a - b',
      'the sum of x and y',
      'Add x + y and then say it',
      'Two is not one + the rest',
      'Is x in the set?',
    ])
      expect(readableMaths(same), same).toBe(same)
  })
})

describe('forScreen: the words of a question go through the same rule', () => {
  const pic = { kind: 'fraction_bar' as const, rows: [{ parts: 4, shaded: 1 }] }
  it('writes the prompt and the words of the choices, and leaves a picture choice as it is', () => {
    const q = forScreen({ prompt: 'Which is the vertex of y = ax^2 + q?', render: 'text', answerKind: 'choice', choices: ['y = ax^2', { text: 'y = ab^(x + p)' }, { diagram: pic }, { text: '' }] }, 2, 5)
    expect(q.prompt).toBe('Which is the vertex of y = a x^2 + q?')
    expect(q.choices).toEqual(['y = a x^2', { text: 'y = a b^(x + p)' }, { diagram: pic }, { text: '' }])
    expect([q.position, q.phase, q.index, q.of]).toEqual([2, 'try', 2, 5])
  })

  it('a question with nothing to write is as it was', () => {
    expect(forScreen({ prompt: 'What is 2 + 3?', render: 'text', answerKind: 'whole' }, 1, 3)).toEqual({ prompt: 'What is 2 + 3?', render: 'text', answerKind: 'whole', position: 1, phase: 'try', index: 1, of: 3 })
  })
})

describe('the typesetter then draws them (the real segmenter)', () => {
  const texts = (s: string, mode: 'all' | 'algebra') => segments(readableMaths(s), mode)
  const raw = (s: string, mode: 'all' | 'algebra') => texts(s, mode).filter((x) => x.kind === 'text').map((x) => (x as { text: string }).text).join('')

  it.each(['all', 'algebra'] as const)('"The parabola y = ax^2 + q" is words and one piece of maths, in %s mode', (mode) => {
    const parts = texts('The parabola y = ax^2 + q', mode)
    expect(parts.map((p) => p.kind)).toEqual(['text', 'math'])
    expect(raw('The parabola y = ax^2 + q', mode)).not.toContain('^')
    expect(parts[1]).toMatchObject({ kind: 'math', latex: '\\displaystyle y=a{x}^{2}+q' })
  })

  it.each(['all', 'algebra'] as const)('"y = a(x + p)^2 + q" and "y = ab^(x + p) + q" are each one piece of maths, in %s mode', (mode) => {
    expect(texts('y = a(x + p)^2 + q', mode).map((p) => p.kind)).toEqual(['math'])
    const exp = texts('y = ab^(x + p) + q', mode)
    expect(exp.map((p) => p.kind)).toEqual(['math'])
    expect(exp[0]).toMatchObject({ latex: '\\displaystyle y=a{b}^{x+p}+q' })
  })

  it('"x^2 - 4" stays one piece of maths, as it was', () => {
    expect(texts('x^2 - 4', 'all')).toEqual(segments('x^2 - 4', 'all'))
    expect(texts('x^2 - 4', 'all').map((p) => p.kind)).toEqual(['math'])
  })

  it('"Domain: x in R" has the variable as maths and the sign of membership in the words, with no "in R" left', () => {
    expect(raw('Domain: x in R', 'all')).toBe('Domain:  ∈ ℝ')
    expect(raw('Domain: x in R', 'all')).not.toContain(' in R')
  })

  it('a line of a lesson with the equation inside it keeps its words and draws the equation', () => {
    const line = 'For y = ax^2 + q, the value q moves the graph up or down'
    const parts = texts(line, 'all')
    expect(parts.filter((p) => p.kind === 'math')).toHaveLength(1)
    expect(raw(line, 'all')).toBe('For , the value q moves the graph up or down')
  })
})

describe('LessonText and LessonInline draw them', () => {
  it('a paragraph of a lesson draws its power instead of showing "x^2" as text', () => {
    const { container } = render(<LessonText text="For y = ax^2 + q, the value q moves the graph." typeset="all" />)
    expect(drawn(container)).toBe(1)
    expect(words(container)).not.toContain('^')
    expect(words(container)).toContain('the value q moves the graph.')
  })

  it('a title is drawn in line, in a heading or a link, with the same rule', () => {
    const { container } = render(<h1><LessonInline text="The parabola y = ax^2 + q" typeset="algebra" size={34} /></h1>)
    expect(drawn(container)).toBe(1)
    expect(words(container)).toBe('The parabola ')
    expect(container.querySelector('h1')?.textContent).toContain('The parabola')
  })

  it('"x in R" reads as x ∈ ℝ on the screen', () => {
    const { container } = render(<LessonText text="Domain: x in R" typeset="all" />)
    expect(words(container)).toBe('Domain:  ∈ ℝ')
    expect(container.textContent).toContain('∈ ℝ')
  })

  it('plain words are exactly as they were', () => {
    const { container } = render(<LessonText text="A fraction is part of a whole." typeset="all" />)
    expect(container.textContent).toBe('A fraction is part of a whole.')
    expect(drawn(container)).toBe(0)
  })
})

describe('the title of a lesson on the screens that show it', () => {
  const TITLE = 'The parabola y = ax^2 + q'
  const entry = { id: 'l1', position: 1, title: TITLE, minutes: 14, done: false, started: false }

  it('the lesson reader draws it in its heading', () => {
    const lesson = {
      position: 1,
      title: TITLE,
      minutes: 14,
      objectives: ['the effect of a and q on the graph of y = ax^2 + q', 'You will be able to find the range of y = ax^2 + q'],
      keyWords: [],
      blocks: [
        { kind: 'explain' as const, text: 'For y = ax^2 + q, the value q moves the graph.', speech: 'Spoken.' },
        { kind: 'worked' as const, problem: 'Find the turning point', steps: [{ line: 'y = ax^2 + q', reason: 'Compare the equation with y = ax^2 + q' }, { line: 'q = 3', reason: 'Read q' }], answer: 'y = ax^2 + 3', answerKind: 'equation' as const, speech: 'Spoken.' },
      ],
      summary: ['one', 'two', 'three'],
      practice: [],
    }
    const { container } = render(
      <LessonReader topicId="t1" topicName="Functions" grade={11} entry={entry} count={2} lesson={lesson} source={{ kind: 'none', title: '', credit: '' }} next={{ position: 2, title: 'Next: y = ax^2' }} session={null} initialDelivery="read" />,
    )
    const h1 = container.querySelector('h1') as HTMLElement
    expect(drawn(h1)).toBe(1)
    expect(words(h1)).toBe('The parabola ')
    // the objectives, the explanation, the step reason and the answer: no raw power anywhere in the words of the page
    expect(words(container.querySelector('main') as HTMLElement)).not.toContain('^')
    expect(words(container.querySelector('main') as HTMLElement)).toContain('Compare the equation with')
  })

  it('the lesson list panel of a practice draws it in each row', () => {
    render(<LearnFirstPanel library={[entry, { ...entry, id: 'l2', position: 2, title: 'y = ab^(x + p) + q' }]} topicId="t1" sessionId="0b2c6e0e-1111-4222-8333-444455556666" topic="Functions" onSkip={() => {}} />)
    const rows = within(screen.getByRole('list', { name: 'Lessons' })).getAllByRole('listitem')
    expect(rows.map((r) => drawn(r))).toEqual([1, 1])
    for (const r of rows) expect(words(r)).not.toContain('^')
  })

  it('the lesson list of a topic draws it in each row', async () => {
    render(await LessonListPage({ params: Promise.resolve({ topicId: '0b2c6e0e-1111-4222-8333-444455556666' }) }))
    const rows = within(screen.getByRole('heading', { name: 'Lessons' }).closest('section') as HTMLElement).getAllByRole('listitem')
    expect(rows.map((r) => drawn(r))).toEqual([1, 1])
    for (const r of rows) expect(words(r)).not.toContain('^')
    expect(screen.getByRole('link', { name: 'Start lesson 1' })).toBeTruthy()
  })
})
