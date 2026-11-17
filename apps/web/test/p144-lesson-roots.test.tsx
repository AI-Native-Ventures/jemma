import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { segments } from '../app/k/session/_parts/typeset'
import { readableMaths, rootSigns, takeNthRoots } from '../lib/lesson-maths'
import { markLessonQuestion, type TeachingLessonForChild } from '../lib/teaching'

// P144b (second part): the lesson files write roots and Greek letters as plain text in the fields a learner reads: "sqrt(2)", "sin theta = y/r",
// "sqrt[n](a)". They are drawn as a root sign with its line and as the letters θ, α, β, never as the text. Whole words only ("betaken", "Alphabet" are
// words). The voice is the `speech` of a block and is never changed: it keeps saying "theta" and "square root of". The marking accepts 1/sqrt(2) and 1/√2.
// The strings are those of the sample lessons. No database, no browser, no server.

vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }))
vi.mock('../app/k/learn/actions', () => ({ answerLessonQuestion: vi.fn(), startTopicLesson: vi.fn(async () => undefined), finishTopicLesson: vi.fn(async () => undefined) }))

import { LessonInline, LessonText } from '../app/k/learn/_parts/LessonText'
import { LessonReader } from '../app/k/learn/_parts/LessonReader'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(window, 'speechSynthesis')
})

const words = (el: HTMLElement) => {
  const copy = el.cloneNode(true) as HTMLElement
  copy.querySelectorAll('.sr-only, [data-math]').forEach((n) => n.remove())
  return copy.textContent ?? ''
}
const drawn = (el: HTMLElement) => el.querySelectorAll('[data-math]').length
const seen = (text: string, mode: 'all' | 'algebra' = 'all') => {
  const parts = segments(readableMaths(text), mode)
  return {
    latex: parts.filter((p) => p.kind === 'math').map((p) => (p as { latex: string }).latex),
    raw: parts.filter((p) => p.kind === 'text').map((p) => (p as { text: string }).text).join('|'),
  }
}

describe('a root written sqrt(...) is drawn as a root', () => {
  it('"sin 45° = 1/sqrt(2)" is one piece of maths with the root under the line of the fraction', () => {
    expect(seen('sin 45° = 1/sqrt(2)')).toEqual({ latex: ['\\displaystyle \\sin\\left({45}^{\\circ}\\right)=\\frac{1}{\\sqrt{2}}'], raw: '' })
  })

  it.each([
    ['(sqrt(3) - 1)/2', '\\displaystyle \\frac{\\sqrt{3}-1}{2}'],
    ['-1/(2sqrt(3))', '\\displaystyle \\frac{-1}{2\\sqrt{3}}'],
    ['sqrt(t^2 + 4)/2', '\\displaystyle \\frac{\\sqrt{{t}^{2}+4}}{2}'],
    ['x = (-5 ± sqrt(25 + 24))/4', '\\displaystyle x=\\frac{-5\\pm\\sqrt{25+24}}{4}'],
  ])('%s', (text, latex) => {
    expect(seen(text)).toEqual({ latex: [latex], raw: '' })
  })

  it('a root inside a sentence is drawn and the words stay words', () => {
    const r = seen('Simplify sqrt(8) + sqrt(18).')
    expect(r.latex).toEqual(['\\displaystyle \\sqrt{8}+\\sqrt{18}'])
    expect(r.raw).toBe('Simplify |.')
  })

  it('a cube root is the cube root and "sqrt[2](x)" is the square root', () => {
    expect(readableMaths('cbrt(8^2)')).toBe('cbrt(8^2)')
    expect(readableMaths('sqrt(17) = sqrt[2](17)')).toBe('sqrt(17) = sqrt(17)')
    expect(readableMaths('sqrt[3](8) = 2')).toBe('cbrt(8) = 2')
    expect(seen('sqrt[3](8) = 2').latex).toEqual(['\\displaystyle \\sqrt[3]{8}=2'])
  })
})

describe('Greek letters written as words are the letters, whole words only', () => {
  it('"sin theta = y/r" reads "sin θ = y/r" and is one piece of maths', () => {
    expect(readableMaths('sin theta = y/r')).toBe('sin θ = y/r')
    const r = seen('sin theta = y/r')
    expect(r.raw).toBe('')
    expect(r.latex).toHaveLength(1)
    expect(r.latex[0]).toContain('\\theta')
    expect(r.latex[0]).not.toContain('theta=')
  })

  it('"tan alpha = 3/4" and "cos beta = 1,2" are one piece of maths each, and "2sqrt(3)" is 2 and the root', () => {
    expect(readableMaths('tan alpha = 3/4')).toBe('tan \u03b1 = 3/4')
    const a = seen('tan alpha = 3/4')
    expect(a.raw).toBe('')
    expect(a.latex).toEqual(['\\displaystyle \\tan\\left(\\alpha \\right)=\\frac{3}{4}'])
    const b = seen('cos beta = 1,2')
    expect(b.raw).toBe('')
    expect(b.latex).toHaveLength(1)
    expect(b.latex[0]).toContain('\\beta')
    expect(b.latex[0]).toContain('1{,}2')
    expect(seen('2sqrt(3)')).toEqual({ latex: ['\\displaystyle 2\\sqrt{3}'], raw: '' })
  })

  it('the name at the start of a sentence is the letter too: "Theta is ..." reads "\u03b8 is ..."', () => {
    expect(readableMaths('Theta is the angle between the sides.')).toBe('\u03b8 is the angle between the sides.')
    expect(readableMaths('Draw it. Alpha is acute. Is Beta obtuse? Beta is.')).toBe('Draw it. \u03b1 is acute. Is Beta obtuse? \u03b2 is.')
    expect(readableMaths('Line one.\nTheta again')).toBe('Line one.\n\u03b8 again')
    // in the middle of a sentence a capital is a name, and a word that holds it is a word
    for (const same of ['The Theta function', 'Alphabet soup', 'Betamax', 'Thetas are angles']) expect(readableMaths(same), same).toBe(same)
  })

  it('a line with a root and theta is not split by the word', () => {
    // "sec" is not a function the typesetter knows, so it stays a word in front of the maths; the letter and the root after it are one piece of maths
    const r = seen('sec theta = r/x = sqrt(t^2 + 4)/2')
    expect(r.raw).toBe('sec ')
    expect(r.latex).toHaveLength(1)
    expect(r.latex[0]).toContain('\\theta')
    expect(r.latex[0]).toContain('\\sqrt{{t}^{2}+4}')
  })

  it('a sentence keeps its words and has the letter', () => {
    expect(readableMaths('The ratio tangent theta equals opposite over adjacent.')).toBe('The ratio tangent θ equals opposite over adjacent.')
    expect(readableMaths('tan beta is y over x; use alpha and gamma and delta')).toBe('tan β is y over x; use α and γ and δ')
    expect(readableMaths('If sin theta = 3/5 and 90 degrees < theta < 180 degrees')).toBe('If sin θ = 3/5 and 90 degrees < θ < 180 degrees')
  })

  it('does not touch a word that holds one', () => {
    for (const same of ['betaken', 'Alphabet', 'alphabetical order', 'thetas', 'deltas', 'gammarays', 'alphabeta']) expect(readableMaths(same), same).toBe(same)
  })

  it('"tanx" is "tan x", and sine, cosine and secant are not cut', () => {
    expect(readableMaths('(sqrt(3)-tanx)/(1+sqrt(3)tanx)')).toBe('(sqrt(3)-tan x)/(1+sqrt(3)tan x)')
    for (const same of ['sine', 'cosine', 'secant', 'The sine rule', 'tangent', 'cotangent']) expect(readableMaths(same), same).toBe(same)
  })
})

describe('the nth root', () => {
  it('is taken out of a text, brackets and all, and replaced by a mark', () => {
    expect(takeNthRoots('We write a^(1/n) = sqrt[n](a).')).toEqual({ text: 'We write a^(1/n) = ω.', roots: [{ mark: 'ω', index: 'n', radicand: 'a' }], left: false })
    const nested = takeNthRoots('a^(m/n) = (sqrt[n](a))^m = sqrt[4](a^(1/2))')
    expect(nested.text).toBe('a^(m/n) = (ω)^m = λ')
    expect(nested.roots.map((r) => [r.index, r.radicand])).toEqual([['n', 'a'], ['4', 'a^(1/2)']])
  })

  it('says it could not when there are more roots than marks, a bracket never closes, or a mark is already in the text', () => {
    expect(takeNthRoots('sqrt[4](a) sqrt[4](b) sqrt[4](c) sqrt[4](d)').left).toBe(true)
    expect(takeNthRoots('sqrt[4](a').left).toBe(true)
    expect(takeNthRoots('ω = sqrt[4](a)').left).toBe(true)
    expect(takeNthRoots('no root here')).toEqual({ text: 'no root here', roots: [], left: false })
  })

  it('is written as signs for a line that cannot be drawn: the index raised, the root sign, the brackets', () => {
    expect(rootSigns('a = sqrt[n](a)')).toBe('a = ⁿ√(a)')
    expect(rootSigns('sqrt[4](16) = 2')).toBe('⁴√(16) = 2')
    expect(rootSigns('sqrt[ab](x)')).toBe('[ab]√(x)')
  })

  it('is drawn with its index and its root sign in a lesson', () => {
    const { container } = render(<LessonText text="We write a^(1/n) = sqrt[n](a). The number n is the index." typeset="all" />)
    expect(container.querySelectorAll('.katex-root')).toHaveLength(1)
    expect(container.querySelector('.katex-root')?.textContent).toContain('n')
    expect(words(container)).not.toContain('sqrt')
    expect(words(container)).not.toContain('^')
    expect(words(container)).toContain('is the index.')
  })

  it('draws two roots in one line', () => {
    const { container } = render(<LessonInline text="a^(m/n) = (sqrt[n](a))^m = sqrt[n](a^m)." typeset="all" />)
    expect(container.querySelectorAll('.katex-root')).toHaveLength(2)
    expect(words(container)).not.toContain('sqrt')
    expect(words(container)).not.toContain('^')
  })

  it('a root whose radicand cannot be read is the signs and never the text "sqrt["', () => {
    const { container } = render(<LessonInline text="Take sqrt[n](a, b) of both" typeset="all" />)
    expect(container.textContent).toContain('ⁿ√(a, b)')
    expect(container.textContent).not.toContain('sqrt[')
    expect(container.querySelectorAll('.katex-root')).toHaveLength(0)
  })

  it('a line without a root is drawn as it was', () => {
    const { container } = render(<LessonInline text="sqrt(17) = 17^(1/2)" typeset="all" />)
    expect(drawn(container)).toBe(1)
    expect(container.querySelectorAll('.katex-root')).toHaveLength(0)
  })
})

describe('a lesson on the screen', () => {
  const entry = { id: 'l1', position: 1, title: 'Trig of theta', minutes: 14, done: false, started: false }
  const lesson: TeachingLessonForChild = {
    position: 1,
    title: 'Sine of theta',
    minutes: 14,
    objectives: ['You will be able to write sin theta, cos theta and tan theta as ratios of two sides.'],
    keyWords: [{ word: 'theta', meaning: 'The name of the angle in a right-angled triangle.' }],
    blocks: [
      { kind: 'explain', text: 'The ratio sine theta equals opposite over hypotenuse. So sin theta = y/r = 3/5 and tan 30° = 1/sqrt(3).', speech: 'Sine theta is y over r. Tan of thirty degrees is one over the square root of three.' },
      { kind: 'worked', problem: 'If sin theta = 3/5, find cos theta', steps: [{ line: 'cos theta = x/r = -sqrt(21)/5', reason: 'Use the square root of r squared minus y squared.' }, { line: 'sec theta = r/x = sqrt(t^2 + 4)/2', reason: 'Turn it over.' }], answer: 'cos theta = 1/sqrt(2)', answerKind: 'equation', speech: 'Cosine theta is one over the square root of two.' },
      { kind: 'mistake', wrong: 'sin theta = x/r', right: 'sin theta = y/r', why: 'Sine is the side opposite theta over r.', speech: 'Sine uses y.' },
      { kind: 'try', question: { prompt: 'If tan theta = 1/sqrt(3), find theta', render: 'text', answerKind: 'choice', choices: ['30°', '45°', '60°', '1/sqrt(2)'] }, hint: 'Use sqrt(3) = 1,73', speech: 'Now you try.' },
    ],
    summary: ['sin theta = y/r', 'cos theta = x/r', 'tan theta = y/x'],
    practice: [],
  }
  const reader = (delivery: 'read' | 'listen' = 'read') =>
    render(<LessonReader topicId="t1" topicName="Trigonometry" grade={10} entry={entry} count={1} lesson={lesson} source={{ kind: 'none', title: '', credit: '' }} next={null} session={null} initialDelivery={delivery} />)

  beforeEach(() => {
    window.localStorage.clear()
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
  })

  it('shows no "theta", no "sqrt(" and no raw power anywhere in the words of the page, and draws the letters and the roots', () => {
    const { container } = reader()
    const page = words(container.querySelector('main') as HTMLElement)
    expect(page).not.toMatch(/theta|sqrt|\^/)
    expect(page).toContain('The ratio sine')
    expect(drawn(container.querySelector('main') as HTMLElement)).toBeGreaterThan(8)
    // the roots are drawn with a radical (KaTeX's own sign)
    expect(container.querySelectorAll('.sqrt, .root, .hide-tail, svg').length).toBeGreaterThan(0)
    const key = container.querySelector('dl') as HTMLElement
    expect(words(key)).not.toContain('theta')
  })

  it('the voice keeps its words: "theta" and "square root of" are said as the block wrote them', () => {
    const said: string[] = []
    class Utterance {
      text: string
      lang = ''
      rate = 1
      onend: (() => void) | null = null
      onerror: (() => void) | null = null
      constructor(text: string) {
        this.text = text
      }
    }
    vi.stubGlobal('SpeechSynthesisUtterance', Utterance)
    vi.stubGlobal('speechSynthesis', { speak: vi.fn((u: Utterance) => said.push(u.text)), cancel: vi.fn() })
    Object.defineProperty(window, 'speechSynthesis', { value: (globalThis as { speechSynthesis: unknown }).speechSynthesis, configurable: true })
    reader('listen')
    const buttons = screen.getAllByRole('button', { name: 'Read this part aloud' })
    fireEvent.click(buttons[0]!)
    expect(said).toEqual(['Sine theta is y over r.', 'Tan of thirty degrees is one over the square root of three.'])
    fireEvent.click(buttons[1]!)
    expect(said[2]).toBe('Cosine theta is one over the square root of two.')
    for (const s of said) expect(s).not.toMatch(/[θ√\^]|sqrt/)
  })

  it('the question and its choices are drawn too', () => {
    const { container } = reader()
    const block = container.querySelector('[data-block="try"]') as HTMLElement
    fireEvent.click(within(block).getByRole('button', { name: 'Answer this one' }))
    expect(words(block)).not.toMatch(/theta|sqrt/)
    expect(drawn(block)).toBeGreaterThanOrEqual(2)
  })
})

describe('the marking takes the root typed either way', () => {
  const q = (answer: string, answerKind: string) => ({ prompt: 'q', render: 'text', answer, answerKind, difficulty: 1, why: 'w', rightWay: 'r' }) as Parameters<typeof markLessonQuestion>[0]
  it.each([
    ['1/sqrt(2)', 'number', '1/√2'],
    ['1/sqrt(2)', 'number', '1/sqrt(2)'],
    ['sqrt(2)/2', 'number', '√2/2'],
    ['sqrt(2)/2', 'number', '1/sqrt(2)'],
    ['2sqrt(3)', 'expression', '2√3'],
    ['x = ±sqrt(5)', 'equation', 'x = ±√5'],
    ['-sqrt(21)/5', 'number', '-√21/5'],
  ])('key %s (%s) takes %s', (key, kind, typed) => {
    expect(markLessonQuestion(q(key, kind), typed).correct).toBe(true)
  })

  it('and still marks a different root wrong', () => {
    expect(markLessonQuestion(q('1/sqrt(2)', 'number'), '1/√3').correct).toBe(false)
  })
})
