import { render } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { FractionText } from '../app/k/session/_parts/Frac'
import { LearnDiagram } from '../app/k/session/_parts/LearnDiagram'
import { QuestionScreen } from '../app/k/session/_parts/QuestionScreen'
import { Results } from '../app/k/session/_parts/Results'
import { fitPlan, FIT_MIN, hasTypeset, segments, splitAtRelation, toLatexRun } from '../app/k/session/_parts/typeset'
import type { QuestionForChild } from '../app/k/session/[sessionId]/logic'
import type { LessonForChild } from '../app/k/session/[sessionId]/types'

// P135: maths is always shown as real maths on the learner screens. A plus-minus sign is maths, a typeset piece never breaks inside itself (it shrinks to
// fit, and only then breaks after its equals sign), a bare algebra term in a senior sentence is maths, and a step line is one piece. react-dom only:
// no server, no browser, no network. A layout engine is not here, so the measuring is a pure function (`fitPlan`) and the markup is checked for what
// it asks of the browser.

const D = '\\displaystyle '
const MINUS = '−'
const props = { size: 34, rule: 3, gap: 4, side: 5 }

/** The math segments of a text, as `<plain>`, with the words as `[text]`. */
const view = (text: string, mode: 'force' | 'all' | 'algebra') => segments(text, mode).map((s) => (s.kind === 'text' ? `[${s.text}]` : `<${s.plain}>`)).join('')
/** The LaTeX of the one math segment of a text; fails when there are none or more than one. */
const oneMath = (text: string, mode: 'force' | 'all' | 'algebra' = 'all'): string => {
  const maths = segments(text, mode).filter((s) => s.kind === 'math')
  expect(maths, text).toHaveLength(1)
  expect(segments(text, mode), `${text} has nothing but the one piece of maths`).toHaveLength(1)
  return (maths[0] as { latex: string }).latex
}

describe('plus-minus is maths', () => {
  it('"x = (5 ± √1)/2" is one piece of maths with a stacked fraction', () => {
    expect(oneMath('x = (5 ± √1)/2')).toBe(`${D}x=\\frac{5\\pm\\sqrt{1}}{2}`)
  })

  it('"x = 2 ± √3" is one piece, not [x = 2] ± [√3]', () => {
    expect(oneMath('x = 2 ± √3')).toBe(`${D}x=2\\pm\\sqrt{3}`)
    expect(view('x = 2 ± √3', 'all')).toBe('<x = 2 ± √3>')
  })

  it('"x = ±3" is one piece with a sign in front of the 3', () => {
    expect(oneMath('x = ±3')).toBe(`${D}x=\\pm 3`)
  })

  it('"x^2 = 9, so x = ±3": both equations are maths, the words stay words', () => {
    expect(view('x^2 = 9, so x = ±3', 'all')).toBe('<x^2 = 9>[, so ]<x = ±3>')
    const maths = segments('x^2 = 9, so x = ±3', 'all').filter((s) => s.kind === 'math') as { latex: string }[]
    expect(maths[1]!.latex).toBe(`${D}x=\\pm 3`)
  })

  it('the quadratic formula: the plus-minus is inside the fraction top and the root, with the bracket dropped, written with a root sign or with sqrt', () => {
    const want = `${D}x=\\frac{-b\\pm\\sqrt{{b}^{2}-4ac}}{2a}`
    expect(oneMath(`x = (${MINUS}b ± √(b^2 ${MINUS} 4ac))/(2a)`)).toBe(want)
    expect(oneMath('x = (-b ± sqrt(b^2 - 4ac))/(2a)')).toBe(want)
  })

  it('"x = (3 ± √17)/4" is stacked', () => {
    expect(oneMath('x = (3 ± √17)/4')).toBe(`${D}x=\\frac{3\\pm\\sqrt{17}}{4}`)
  })

  it('the minus-plus sign, and a plus-minus before a letter that a command must not be glued to', () => {
    expect(oneMath('x = 1 ∓ √2')).toBe(`${D}x=1\\mp\\sqrt{2}`)
    expect(oneMath('y = a ± b')).toBe(`${D}y=a\\pm b`)
    expect(oneMath('y = 5 ± 3')).toBe(`${D}y=5\\pm3`)
    expect(oneMath('x = ∓3')).toBe(`${D}x=\\mp 3`)
  })

  it('"+/-" and "+-" typed on a keyboard are the same sign', () => {
    expect(oneMath('x = 2 +/- √3')).toBe(`${D}x=2\\pm\\sqrt{3}`)
    expect(oneMath('x = +-3')).toBe(`${D}x=\\pm 3`)
    expect(oneMath('x = +/-3')).toBe(`${D}x=\\pm 3`)
  })

  it('a plain sum with a minus after a plus is not a plus-minus: "3+-2" stays as it was read', () => {
    expect(toLatexRun('3+-2')).not.toContain('pm')
  })

  it('a plus-minus piece cut from a longer line (a worked step) is maths in force mode', () => {
    expect(view('± √3', 'force')).toBe('<± √3>')
    expect(oneMath('± √3', 'force')).toContain('\\pm \\sqrt{3}')
  })

  it('maths with no plus-minus is what it was', () => {
    expect(oneMath('x/2 − 3 = 4')).toBe(`${D}\\frac{x}{2}-3=4`)
    expect(oneMath('x = 7/2')).toBe(`${D}x=\\frac{7}{2}`)
    expect(oneMath('x = 6√2')).toBe(`${D}x=6\\sqrt{2}`)
    expect(oneMath('(x + 1)/2 − (x − 3)/3 = 2')).toBe(`${D}\\frac{x+1}{2}-\\frac{x-3}{3}=2`)
  })

  it('a stray sign that is not maths is still words', () => {
    expect(view('Add ± to the answer', 'all')).toBe('[Add ± to the answer]')
  })
})

describe('bare algebra terms in a sentence', () => {
  const senior = (text: string) => view(text, 'all')

  it('2x, 5a and 3y are maths in a senior sentence', () => {
    expect(senior('Subtract 2x from both sides')).toBe('[Subtract ]<2x>[ from both sides]')
    expect(senior('Then 5a is the same as a')).toBe('[Then ]<5a>[ is the same as a]')
    expect(senior('Add 3y to both sides')).toBe('[Add ]<3y>[ to both sides]')
  })

  it('a minus, a power and a bracket in front or around are maths as they were', () => {
    expect(senior('Take away −3y now')).toBe('[Take away ]<−3y>[ now]')
    expect(senior('Square it to get x^2 here')).toBe('[Square it to get ]<x^2>[ here]')
    expect(senior('Then 3(x + 1) is next')).toBe('[Then ]<3(x + 1)>[ is next]')
  })

  it('the earlier 2x and the later 2x = 12 are both maths in the same sentence', () => {
    const text = 'Subtract 2x from both sides, then add 3: 2x = 12, so x = 6.'
    expect(senior(text)).toBe('[Subtract ]<2x>[ from both sides, then add 3: ]<2x = 12>[, so ]<x = 6>[.]')
  })

  it('ordinary words, "Step 2", "Grade 11" and plain numbers alone stay text', () => {
    for (const text of ['Step 2 is next', 'Grade 11 maths', 'There are 12 of them', 'Do it in 5 minutes', 'Walk 5m then 3s', 'Level 2 - the second try']) {
      expect(senior(text), text).toBe(`[${text}]`)
    }
  })

  it('not in primary mode: the same sentence is words', () => {
    expect(view('Subtract 2x from both sides', 'algebra')).toBe('[Subtract 2x from both sides]')
    expect(hasTypeset('Subtract 2x from both sides', 'algebra')).toBe(false)
    expect(hasTypeset('Subtract 2x from both sides', 'all')).toBe(true)
  })

  it('on the screen: 2x is in the maths font in senior mode and in the text font in primary mode', () => {
    const senior = render(<FractionText text="Subtract 2x from both sides" typeset="all" {...props} />).container
    expect(senior.querySelectorAll('[data-math]')).toHaveLength(1)
    expect(senior.querySelector('[data-math]')!.textContent).toContain('2x')
    const primary = render(<FractionText text="Subtract 2x from both sides" typeset="algebra" {...props} />).container
    expect(primary.querySelectorAll('[data-math]')).toHaveLength(0)
    expect(primary.textContent).toBe('Subtract 2x from both sides')
  })
})

describe('a piece of typeset maths never breaks inside itself', () => {
  const ask = (over: Partial<QuestionForChild>): QuestionForChild => ({ position: 3, phase: 'try', index: 1, of: 5, prompt: 'Work it out', render: 'text', answerKind: 'whole', ...over })
  const screen = (q: QuestionForChild) => {
    const el = document.createElement('div')
    el.innerHTML = renderToStaticMarkup(<QuestionScreen q={q} busy={false} onAnswer={() => {}} />)
    return el
  }

  it('"Solve: x^2 − 5x + 6 = 0": the whole equation is one fit piece that does not wrap', () => {
    const h1 = screen(ask({ prompt: `Solve: x^2 ${MINUS} 5x + 6 = 0`, answerKind: 'equation' })).querySelector('h1[data-prompt]')!
    const pieces = h1.querySelectorAll('[data-math]')
    expect(pieces).toHaveLength(1)
    const piece = pieces[0] as HTMLElement
    expect(piece.getAttribute('data-fit')).toBe('true')
    expect(piece.textContent).toContain('0')
    const nowrap = piece.querySelector('[data-fit-inner]') as HTMLElement
    expect(nowrap.style.whiteSpace).toBe('nowrap')
    expect(piece.style.whiteSpace).toBe('nowrap')
    // The "0" is in the same piece as the "x^2", so the screen has no line that holds "=" alone with the 0 on its own.
    expect(piece.textContent).toContain('x')
    expect(piece.textContent).toMatch(/=\s*0|=0|0$/)
  })

  it('the piece may not be wider than its box, and the text around it still wraps', () => {
    const { container } = render(<FractionText text={`Solve: x^2 ${MINUS} 5x + 6 = 0`} typeset="all" {...props} />)
    const piece = container.querySelector('[data-math]') as HTMLElement
    expect(piece.style.maxWidth || piece.className).toBeTruthy()
    expect(piece.className).toContain('jemma-math')
    const text = container.querySelector('[aria-hidden="true"]')!
    expect((text as HTMLElement).style.whiteSpace).not.toBe('nowrap')
  })

  it('every size stays what the screen gave it when nothing is too wide (jsdom has no layout)', () => {
    const { container } = render(<FractionText text="x^2 + 1" {...props} size={26} />)
    expect((container.querySelector('[data-math]') as HTMLElement).style.fontSize).toBe('26px')
  })

  it('fitPlan: a piece that fits is left alone', () => {
    expect(fitPlan(200, 300, true)).toEqual({ kind: 'full', scale: 1, wrap: false })
    expect(fitPlan(300, 300, true)).toEqual({ kind: 'full', scale: 1, wrap: false })
    expect(fitPlan(0, 300, true).kind).toBe('full')
    expect(fitPlan(200, 0, true).kind).toBe('full')
  })

  it('fitPlan: a piece that is a little too wide scales down to fit, to about 70 percent at the least', () => {
    const p = fitPlan(400, 300, true)
    expect(p.kind).toBe('scaled')
    expect(p.scale).toBeCloseTo(0.75, 1)
    expect(p.scale * 400).toBeLessThanOrEqual(300)
    const edge = fitPlan(300 / FIT_MIN, 300, true)
    expect(edge.kind).toBe('scaled')
    expect(edge.scale).toBeGreaterThanOrEqual(FIT_MIN - 0.01)
    expect(FIT_MIN).toBeGreaterThanOrEqual(0.68)
    expect(FIT_MIN).toBeLessThanOrEqual(0.72)
  })

  it('fitPlan: only a piece still too wide at 70 percent breaks, after its equals sign', () => {
    const p = fitPlan(600, 300, true)
    expect(p.kind).toBe('broken')
    expect(p.scale).toBeGreaterThanOrEqual(FIT_MIN)
  })

  it('fitPlan: a piece with no equals sign to break at stays one piece at its smallest size and may wrap at its own signs as a last resort', () => {
    const p = fitPlan(600, 300, false)
    expect(p.kind).toBe('scaled')
    expect(p.scale).toBeCloseTo(FIT_MIN, 2)
    expect(p.wrap).toBe(true)
  })

  it('splitAtRelation: after the first top-level equals sign, never inside a bracket, a fraction or a root', () => {
    const sp = splitAtRelation(`${D}2x+1=-x+7`)!
    expect(sp.left).toBe(`${D}2x+1=`)
    expect(sp.right).toBe(`${D}-x+7`)
    expect(splitAtRelation(`${D}\\frac{x=1}{2}`)).toBeNull()
    expect(splitAtRelation(`${D}x+1`)).toBeNull()
    expect(splitAtRelation(`${D}x\\leq 3`)!.left).toBe(`${D}x\\leq `)
    expect(splitAtRelation(`${D}\\sqrt{{x}^{2}+1}=5`)!.right).toBe(`${D}5`)
  })

  it('the lone "0" can not be left on a line of its own: the equation is one piece or two whole sides', () => {
    // The two halves are what the browser may show when 70 percent is still too wide: "x^2 - 5x + 6 =" then "0".
    const latex = toLatexRun(`x^2 ${MINUS} 5x + 6 = 0`)!
    const sp = splitAtRelation(latex)!
    expect(sp.left.endsWith('=')).toBe(true)
    expect(sp.right).toBe(`${D}0`)
  })
})

describe('the results card', () => {
  const card = (over: object = {}) => ({
    n: 1,
    correct: true,
    prompt: `Solve: x^2 ${MINUS} 5x + 6 = 0`,
    render: 'text' as const,
    wrote: 'x = 2 or x = 3',
    right: 'x = 2 or x = 3',
    why: 'Subtract 2x from both sides, then add 3: 2x = 12, so x = 6.',
    rightWay: 'Factorise, then each bracket is zero.',
    steps: ['4x − 3 = 2x + 9', '2x = 12', 'x = 6'],
    ...over,
  })
  const page = (m: object) => render(<Results firstName="Amina" missed={[m as never]} />).container

  it('"Question 1" is one line, the prompt is under it, left aligned and as wide as the card', () => {
    const c = page(card())
    const head = c.querySelector('h2#r1')!
    expect(head.textContent).toBe('Question 1')
    expect(head.className).toContain('whitespace-nowrap')
    const q = c.querySelector('[data-question]') as HTMLElement
    expect(q.className).toContain('w-full')
    expect(q.className).toContain('text-left')
    // The number and the prompt are in one column: the prompt is not beside the number.
    const column = head.parentElement!
    expect(column.className).toContain('flex-col')
    expect(column.contains(q)).toBe(true)
    expect(column.className).not.toContain('justify-between')
  })

  it('a short senior question has the same stacked head (it was beside the number before)', () => {
    const c = page(card({ prompt: 'x^2 = 9', steps: undefined }))
    const head = c.querySelector('h2#r1')!
    expect(head.parentElement!.className).toContain('flex-col')
    expect(head.parentElement!.contains(c.querySelector('[data-question]'))).toBe(true)
  })

  it('a primary question keeps the head it had: the number and a short question side by side', () => {
    const c = page(card({ prompt: '3/5 = ?/15', wrote: '9/15', right: '9/15', why: 'Both are the same.', rightWay: 'Times 3.', steps: undefined }))
    const head = c.querySelector('h2#r1')!
    expect(head.parentElement!.className).toContain('justify-between')
  })

  it('each "How to get there" line is one piece of maths', () => {
    const c = page(card())
    const lines = c.querySelectorAll('[data-steps] li')
    expect(lines).toHaveLength(3)
    for (const li of Array.from(lines)) expect(li.querySelectorAll('[data-math]'), li.textContent ?? '').toHaveLength(1)
    // "4x − 3 = 2x + 9" is not cut into the pieces "4x", "− 3", "= 2x" and "+ 9" with a space between each.
    expect(lines[0]!.querySelector('[data-math]')!.textContent).toContain('4x')
    expect(lines[0]!.querySelector('[data-math]')!.textContent).toContain('2x')
    expect(lines[0]!.querySelectorAll('.whitespace-nowrap').length).toBeLessThanOrEqual(1)
  })

  it('a step line with a fraction or a plus-minus is one piece too', () => {
    const c = page(card({ steps: ['x = (5 ± √1)/2', 'x/2 + 6 = 10', 'x = 2 ± √3'] }))
    for (const li of Array.from(c.querySelectorAll('[data-steps] li'))) expect(li.querySelectorAll('[data-math]')).toHaveLength(1)
    expect(c.querySelectorAll('[data-steps] li')[0]!.querySelector('.mfrac')).toBeTruthy()
  })

  it('"Why it works" and "Why": the first 2x and the later 2x = 12 are in the same maths font on a senior card', () => {
    const sentence = 'Subtract 2x from both sides, then add 3: 2x = 12, so x = 6.'
    const right = page(card({ rightWay: sentence }))
    const why = Array.from(right.querySelectorAll('p')).find((p) => p.textContent?.includes('Why it works'))!
    const pieces = Array.from(why.querySelectorAll('[data-math]')).map((m) => m.textContent ?? '')
    expect(pieces).toHaveLength(3)
    expect(pieces[0]).toContain('2x')
    expect(pieces[1]).toContain('12')
    const missed = page(card({ correct: false, why: sentence, rightWay: 'Do it again.' }))
    const whyMissed = Array.from(missed.querySelectorAll('p')).find((p) => p.textContent?.startsWith('Why:'))!
    expect(whyMissed.querySelectorAll('[data-math]')).toHaveLength(3)
  })

  it('a primary card keeps its words: "2x" in a sentence without other algebra is text', () => {
    const c = page(card({ prompt: '3/5 = ?/15', wrote: '9/15', right: '9/15', why: 'We use 2x here.', rightWay: 'We use 2x here.', steps: undefined }))
    const why = Array.from(c.querySelectorAll('p')).find((p) => p.textContent?.includes('Why it works'))!
    expect(why.querySelectorAll('[data-math]')).toHaveLength(0)
  })
})

describe('answers and lesson captions', () => {
  it('an answer with a plus-minus is one piece of maths, not cut into terms', () => {
    const c = render(
      <Results
        firstName="Amina"
        missed={[{ n: 1, correct: false, prompt: 'Solve: (x − 2)^2 = 3', render: 'text', wrote: 'x = 2', right: 'x = 2 ± √3', why: 'Take the root of both sides.', rightWay: 'x = 2 ± √3' }]}
      />,
    ).container
    const boxes = Array.from(c.querySelectorAll('span')).filter((n) => n.textContent === 'Right answer')
    const answer = boxes[0]!.parentElement!
    expect(answer.querySelectorAll('[data-math]')).toHaveLength(1)
    expect(answer.querySelector('[data-math]')!.textContent).toContain('±')
  })

  const lesson = (captions: string[]): LessonForChild => ({
    title: 'Lesson',
    format: 'diagram',
    minutes: 5,
    topicName: 'Equations',
    warmupCount: 2,
    tryCount: 5,
    first: null,
    diagram: { title: 'T', caption: 'C', steps: captions.map((caption) => ({ caption, diagram: { kind: 'fraction_bar' as const, rows: [{ parts: 4, shaded: 2 }] } })) },
  })

  it('a caption of a senior lesson is one equation in one piece, and 2x in the sentence is maths too', () => {
    const { container } = render(<LearnDiagram lesson={lesson(['Subtract 2x from both sides', 'Now 2x + 1 = −x + 7.'])} onReady={() => {}} />)
    const pieces = Array.from(container.querySelectorAll('figure [data-math]'))
    expect(pieces.map((p) => p.textContent)).toHaveLength(2)
    const equation = pieces.find((p) => p.textContent!.includes('+7') || p.textContent!.includes('+ 7'))!
    expect(equation.textContent!.replace(/\s+/g, '')).toBe('2x+1=−x+7')
    expect(equation.getAttribute('data-fit')).toBe('true')
  })

  it('a caption of a primary lesson is as it was: no maths font for 2x in words', () => {
    const { container } = render(<LearnDiagram lesson={lesson(['Cut it into 2x pieces', 'Start with 1/2 and 1/4.'])} onReady={() => {}} />)
    expect(container.querySelectorAll('figure [data-math]')).toHaveLength(0)
  })
})

describe('the piece measures itself in its box (a fake layout: jsdom has none)', () => {
  // The box is 300 px or 200 px wide. The piece wants 400 px at 34 px; its two halves (cut after the equals sign) want 250 and 120. A width is the width wanted
  // at 34 px, scaled by the font size the piece has been given.
  const proto = HTMLElement.prototype
  const had = { offsetWidth: Object.getOwnPropertyDescriptor(proto, 'offsetWidth'), clientWidth: Object.getOwnPropertyDescriptor(proto, 'clientWidth') }
  let boxWidth = 300
  const install = () => {
    Object.defineProperty(proto, 'clientWidth', { configurable: true, get(this: HTMLElement) { return this.hasAttribute('data-box') ? boxWidth : 0 } })
    Object.defineProperty(proto, 'offsetWidth', {
      configurable: true,
      get(this: HTMLElement) {
        if (!this.hasAttribute('data-fit-inner')) return 0
        const size = parseFloat((this.closest('[data-fit]') as HTMLElement).style.fontSize) || 34
        const at34 = this.getAttribute('data-piece') === 'left' ? 250 : this.getAttribute('data-piece') === 'right' ? 120 : 400
        return Math.round((at34 * size) / 34)
      },
    })
  }
  afterEach(() => {
    for (const k of ['offsetWidth', 'clientWidth'] as const) {
      if (had[k]) Object.defineProperty(proto, k, had[k])
      else delete (proto as unknown as Record<string, unknown>)[k]
    }
  })
  const draw = (width: number) => {
    boxWidth = width
    install()
    const { container } = render(
      <div data-box="true">
        <FractionText text={`x^2 ${MINUS} 5x + 6 = 0`} typeset="all" {...props} />
      </div>,
    )
    return container.querySelector('[data-fit]') as HTMLElement
  }

  it('a box wide enough leaves the piece at the size it was given', () => {
    const piece = draw(500)
    expect(piece.getAttribute('data-plan')).toBe('full')
    expect(piece.style.fontSize).toBe('34px')
  })

  it('a box a little narrower scales the piece down to fit it', () => {
    const piece = draw(300)
    expect(piece.getAttribute('data-plan')).toBe('scaled')
    expect(parseFloat(piece.style.fontSize)).toBeCloseTo(25.5, 1)
    expect(piece.querySelectorAll('[data-piece]')).toHaveLength(0)
  })

  it('a box much narrower than 70 percent cuts the piece after its equals sign: the left side with its sign, the right side on its own line', () => {
    const piece = draw(200)
    expect(piece.getAttribute('data-plan')).toBe('broken')
    const [left, right] = Array.from(piece.querySelectorAll('[data-piece]'))
    expect(left!.textContent).toContain('x')
    expect(left!.textContent!.trim().endsWith('=')).toBe(true)
    expect(right!.textContent!.replace(/\s+/g, '')).toBe('0')
    expect((left as HTMLElement).style.display).toBe('block')
    expect((right as HTMLElement).style.display).toBe('block')
    // each half is scaled to fit on its own, at 70 percent of the size at the least
    expect(parseFloat(piece.style.fontSize)).toBeGreaterThanOrEqual(34 * FIT_MIN - 0.01)
  })
})
