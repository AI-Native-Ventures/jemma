import { renderToStaticMarkup } from 'react-dom/server'
import type { CoordinatePlaneSpec, TriangleSpec } from '@jemma/profiling/schemas'
import { describe, expect, it } from 'vitest'
import { CoordinatePlane, DiagramView, Shape2D, Triangle } from '@/components/diagrams'
import { RichHtml, labelRuns, plainLabel, raisedLabel, type Run } from '@/components/diagrams/math-label'
import { segments, toLatexRun } from '../app/k/session/_parts/typeset'
import { LearnCards } from '../app/k/session/_parts/LearnCards'
import { LearnDiagram } from '../app/k/session/_parts/LearnDiagram'
import type { LessonForChild } from '../app/k/session/[sessionId]/types'

// P129: every piece of maths a learner sees is shown as maths, the labels drawn on a graph or a triangle too. The labels are SVG text, so powers are raised
// with tspans (a smaller size, shifted up), variables are slanted, roots lined, the minus is a true minus. A label of plain words is not touched. react-dom
// only: no server, no browser.

const MINUS = '−'
const html = (node: React.ReactElement) => {
  const box = document.createElement('div')
  box.innerHTML = renderToStaticMarkup(node)
  return box
}
const plane = (over: Partial<CoordinatePlaneSpec> = {}): CoordinatePlaneSpec => ({ kind: 'coordinate_plane', xMin: -5, xMax: 5, yMin: -5, yMax: 5, ...over })
const triangle = (over: Partial<TriangleSpec> = {}): TriangleSpec => ({ kind: 'triangle', vertices: ['A', 'B', 'C'], ...over })
const joined = (runs: Run[] | null) => (runs ?? []).map((r) => r.text).join('')
const raised = (runs: Run[] | null) => (runs ?? []).filter((r) => r.sup).map((r) => r.text)

describe('the runs of a label', () => {
  it('raises the power of "y = x^2 - 4", slants the letters and puts in a true minus', () => {
    const runs = labelRuns('y = x^2 - 4')
    expect(runs).not.toBeNull()
    expect(joined(runs)).toBe(`y = x2 ${MINUS} 4`)
    expect(raised(runs)).toEqual(['2'])
    expect(runs!.filter((r) => r.italic).map((r) => r.text)).toEqual(['y', 'x'])
    expect(joined(runs)).not.toContain('^')
  })

  it('raises a negative power and a letter power', () => {
    expect(raised(labelRuns('x^-1'))).toEqual([`${MINUS}1`])
    expect(raised(labelRuns('y = 2^x'))).toEqual(['x'])
    expect(raised(labelRuns('y = a^(n+1)'))).toEqual(['n', '+1'])
    expect(raised(labelRuns('x⁴ + x⁻¹'))).toEqual(['4', `${MINUS}1`])
  })

  it('raises the power on a function name: sin^-1(x)', () => {
    const runs = labelRuns('θ = sin^-1(opposite / hypotenuse)')
    expect(raised(runs)).toEqual([`${MINUS}1`])
    expect(joined(runs)).toBe(`θ = sin${MINUS}1(opposite/hypotenuse)`)
    expect(runs!.some((r) => r.frac)).toBe(true)
    // sin is a function and the words are words: none of them is slanted
    expect(runs!.filter((r) => r.italic).map((r) => r.text)).toEqual(['θ'])
  })

  it('draws theta and pi as their signs, and sin cos tan upright', () => {
    expect(joined(labelRuns('2 pi r'))).toBe('2 π r')
    expect(joined(labelRuns('theta = 30'))).toBe('θ = 30')
    const runs = labelRuns('sin θ = opposite / hypotenuse')
    expect(runs!.find((r) => r.text.includes('sin'))!.italic).toBeFalsy()
    expect(runs!.filter((r) => r.italic).map((r) => r.text)).toEqual(['θ'])
  })

  it('lines a root: the sign and a line over what is under it', () => {
    const runs = labelRuns('sqrt(x + 1)')
    expect(runs![0]).toMatchObject({ text: '√' })
    expect(runs!.filter((r) => r.over).map((r) => r.text).join('')).toBe('x + 1')
    const sign = labelRuns('√16')
    expect(sign!.filter((r) => r.over).map((r) => r.text)).toEqual(['16'])
  })

  it('draws theta alone and keeps 30 degrees as it was', () => {
    expect(labelRuns('θ')).toEqual([{ text: 'θ', italic: true }])
    expect(labelRuns('30°')).toBeNull()
  })

  it('does not touch a label of words, numbers or units', () => {
    for (const words of ['opposite', 'hypotenuse', '5 cm', 'side a', 'Area = 3 cm²', '3 × 4 = 12', '12 + 7', 'A', 'f', 'x', '(2; 3)', '3/4', 'well-known', '10 - 3', '90°'])
      expect(labelRuns(words), words).toBeNull()
  })

  it('keeps an article in a sentence as a word', () => {
    const runs = labelRuns('a line with y = 2x')
    expect(runs!.filter((r) => r.italic).map((r) => r.text)).toEqual(['y', 'x'])
  })

  it('gives the plain text of a label, as it is spoken (no caret)', () => {
    expect(plainLabel('y = x^2 - 4')).toBe(`y = x2 ${MINUS} 4`)
    expect(plainLabel('opposite')).toBe('opposite')
  })

  it('says when a label has a raised part, so that its place leaves room above', () => {
    expect(raisedLabel('y = x^2 - 4')).toBe(true)
    expect(raisedLabel('y = x')).toBe(false)
  })
})

describe('a fraction in a label is stacked', () => {
  it('cuts "x/2", "(x + 1)/(x - 1)" and "opposite / hypotenuse" at the slash, and takes the brackets off', () => {
    const f = (t: string) => labelRuns(t)!.find((r) => r.frac)!.frac!
    expect(f('y = x/2').num.map((r) => r.text).join('')).toBe('x')
    expect(f('y = x/2').den.map((r) => r.text).join('')).toBe('2')
    expect(f('y = (x + 1)/(x - 1)').num.map((r) => r.text).join('')).toBe('x + 1')
    expect(f('y = (x + 1)/(x - 1)').den.map((r) => r.text).join('')).toBe(`x ${MINUS} 1`)
    expect(f('cos θ = adjacent / hypotenuse').num.map((r) => r.text).join('')).toBe('adjacent')
    expect(f('y = x^2/4').num.map((r) => r.text).join('')).toBe('x2')
  })

  it('leaves a fraction of numbers, a unit and a word with a slash as they were', () => {
    for (const t of ['3/4', '1/2', '5 m/s', 'km/h', 'and/or', '12/11/2026']) expect(labelRuns(t), t).toBeNull()
  })

  it('draws a graph label with a fraction in a box of its own: top over bottom, no slash', () => {
    const box = html(<CoordinatePlane {...plane({ graphs: [{ type: 'line', m: 0.5, c: 0, label: 'y = x/2' }] })} />)
    const label = box.querySelector('foreignObject[data-graph-label="0"]')!
    expect(label).not.toBeNull()
    expect(label.textContent).not.toContain('/')
    expect(label.querySelector('[data-frac] [data-num]')!.textContent).toBe('x')
    expect(label.querySelector('[data-frac] [data-den]')!.textContent).toBe('2')
    // inside the grid, as a text label is
    const x = Number(label.getAttribute('x'))
    const w = Number(label.getAttribute('width'))
    expect(x).toBeGreaterThanOrEqual(0)
    expect(x + w).toBeLessThanOrEqual(320 + 40)
  })

  it('draws a side of a triangle that is a fraction stacked', () => {
    const box = html(<Triangle {...triangle({ sides: ['x/2', '', ''] })} />)
    const side = box.querySelector('foreignObject[data-side="0"]')!
    expect(side.querySelector('[data-num]')!.textContent).toBe('x')
    expect(box.querySelector('text[data-side="0"]')).toBeNull()
  })

  it('draws the formulas under a triangle stacked, with no slash', () => {
    const under = html(<Shape2D kind="shape_2d" shape="triangle" labels={['θ', 'opposite', 'adjacent', 'hypotenuse', '90°', 'sin θ = opposite / hypotenuse', 'θ = sin^-1(opposite / hypotenuse)']} />)
    const notes = [...under.querySelectorAll('[data-part="notes"] > *')]
    expect(notes).toHaveLength(2)
    for (const n of notes) {
      expect(n.textContent).not.toMatch(/[/^]/)
      expect(n.querySelector('[data-frac] [data-num]')!.textContent).toBe('opposite')
      expect(n.querySelector('[data-frac] [data-den]')!.textContent).toBe('hypotenuse')
    }
  })

  it('leaves the fraction ticks of a number line of the demo class as they were', () => {
    const box = html(<DiagramView spec={{ kind: 'number_line', min: 0, max: 1, step: 0.25, marks: [{ value: 0.75, label: '3/4' }] }} />)
    expect(box.querySelectorAll('foreignObject')).toHaveLength(0)
    expect(box.textContent).toContain('3/4')
  })
})

describe('CoordinatePlane: the labels are maths', () => {
  it('draws "y = x^2 - 4" with a raised 2 and no caret', () => {
    const box = html(<CoordinatePlane {...plane({ graphs: [{ type: 'parabola', a: 1, q: -4, label: 'y = x^2 - 4' }] })} />)
    const label = box.querySelector('[data-graph-label="0"]')!
    expect(label.textContent).not.toContain('^')
    expect(label.textContent).toBe(`y = x2 ${MINUS} 4`)
    const sup = label.querySelector('tspan[data-sup="true"]')!
    expect(sup.textContent).toBe('2')
    // smaller than the label and moved up
    expect(Number(sup.getAttribute('font-size'))).toBeLessThan(14)
    expect(Number(sup.getAttribute('dy'))).toBeLessThan(0)
    // the text after it comes back to the line
    const after = [...label.querySelectorAll('tspan')].find((t) => t.textContent!.includes(MINUS))!
    expect(Number(after.getAttribute('dy'))).toBeGreaterThan(0)
  })

  it('keeps a word label as one plain text', () => {
    const box = html(<CoordinatePlane {...plane({ graphs: [{ type: 'line', m: 1, c: 0, label: 'f' }], points: [{ x: 1, y: 2, label: 'A' }] })} />)
    expect(box.querySelector('[data-graph-label="0"]')!.innerHTML).toBe('f')
    expect(box.querySelector('[data-point-label="0"]')!.innerHTML).toBe('A')
    expect(box.querySelectorAll('tspan')).toHaveLength(0)
  })

  it('keeps the label of a graph inside the drawing', () => {
    const box = html(<CoordinatePlane {...plane({ graphs: [{ type: 'parabola', a: 1, q: 0, label: 'y = x^2' }] })} />)
    const label = box.querySelector('[data-graph-label="0"]')!
    expect(Number(label.getAttribute('y'))).toBeGreaterThan(24)
  })
})

describe('Triangle: the labels are maths', () => {
  it('draws θ slanted and keeps 30° as it was', () => {
    const box = html(<Triangle {...triangle({ angleLabels: ['θ', '30°', ''], sides: ['x + 2', '', ''] })} />)
    const angles = [...box.querySelectorAll('[data-angle]')]
    expect(angles.map((a) => a.textContent)).toEqual(['θ', '30°'])
    expect(angles[0]!.querySelector('tspan')!.getAttribute('font-style')).toBe('italic')
    expect(angles[1]!.innerHTML).toBe('30°')
    expect(box.querySelector('[data-side="0"]')!.textContent).toBe('x + 2')
    expect(box.querySelector('[data-side="0"] tspan')!.getAttribute('font-style')).toBe('italic')
  })
})

describe('Shape2D: the labels are maths', () => {
  it('draws a power on a side and the formulas under a triangle', () => {
    const box = html(<Shape2D kind="shape_2d" shape="square" labels={['x^2', 'Area = x^2']} />)
    expect(box.textContent).not.toContain('^')
    expect(box.querySelectorAll('tspan[data-sup="true"]').length).toBeGreaterThanOrEqual(1)
    const under = html(<Shape2D kind="shape_2d" shape="triangle" labels={['θ', 'opposite', 'adjacent', 'hypotenuse', '90°', 'θ = sin^-1(opposite / hypotenuse)']} />)
    const note = under.querySelector('[data-part="notes"] > *')!
    expect(note.textContent).not.toContain('^')
    expect(note.querySelector('sup')!.textContent).toBe(`${MINUS}1`)
  })
})

describe('RichHtml: the same label on a page', () => {
  it('raises the power, and gives a word label back as it is', () => {
    expect(renderToStaticMarkup(<RichHtml text="x^2 + 2x" />)).toContain('<sup')
    expect(renderToStaticMarkup(<RichHtml text="x^2 + 2x" />)).not.toContain('^')
    expect(renderToStaticMarkup(<RichHtml text="hypotenuse" />)).toBe('hypotenuse')
  })
})

describe('a lesson picture of a senior class: the words under it are maths', () => {
  const lesson = (caption: string): LessonForChild =>
    ({
      title: 'Parabolas',
      format: 'diagram',
      diagram: {
        caption: 'How a parabola moves',
        steps: [{ caption: 'Draw y = x^2', diagram: { kind: 'coordinate_plane', xMin: -5, xMax: 5, yMin: -5, yMax: 5, graphs: [{ type: 'parabola', a: 1, label: 'y = x^2' }] } }],
        contrast: { caption, diagram: { kind: 'coordinate_plane', xMin: -5, xMax: 5, yMin: -5, yMax: 5, graphs: [{ type: 'line', m: 1, c: 0 }] } },
      },
    }) as unknown as LessonForChild

  it('draws the caption of the contrast as maths (powers raised, no caret on screen)', () => {
    const box = html(<LearnDiagram lesson={lesson('A parabola is y = x^2 + 1, not a line.')} onReady={() => {}} />)
    const aside = box.querySelector('aside')!
    expect(aside.querySelector('[data-typeset="true"]')).not.toBeNull()
    expect(aside.querySelector('.sr-only')!.textContent).toContain('x^2 + 1')
  })

  it('draws the plain words of a primary contrast exactly as before', () => {
    const box = html(<LearnDiagram lesson={lesson('Halves are bigger than quarters.')} onReady={() => {}} />)
    const caption = [...box.querySelectorAll('aside span')].find((s) => s.textContent === 'Halves are bigger than quarters.')
    expect(caption).toBeDefined()
    expect(box.querySelector('aside [data-typeset]')).toBeNull()
  })
})

describe('a reading card of a senior class', () => {
  const lesson = {
    title: 'Squares',
    format: 'reading',
    cards: [
      { heading: 'Expand (x + 1)^2', body: 'Multiply it out: x^2 + 2x + 1' },
      { heading: 'Plain words', body: 'Take your time.' },
    ],
  } as unknown as LessonForChild

  it('draws the heading and the body typeset, with the plain text for a screen reader', () => {
    const box = html(<LearnCards lesson={lesson} card={0} onBack={() => {}} onNext={() => {}} />)
    const h1 = box.querySelector('h1')!
    expect(h1.querySelector('[data-typeset="true"] .msupsub')).not.toBeNull()
    expect(h1.querySelector('.sr-only')!.textContent).toBe('Expand (x + 1)^2')
    const body = box.querySelector('article p')!
    expect(body.querySelector('[data-typeset="true"] .msupsub')).not.toBeNull()
    expect(body.querySelector('.sr-only')!.textContent).toBe('Multiply it out: x^2 + 2x + 1')
    // nothing outside the screen-reader text shows a caret
    const seen = body.cloneNode(true) as HTMLElement
    seen.querySelectorAll('.sr-only').forEach((e) => e.remove())
    expect(seen.textContent).not.toContain('^')
  })

  it('draws the words of a plain card as they were', () => {
    const box = html(<LearnCards lesson={lesson} card={1} onBack={() => {}} onNext={() => {}} />)
    expect(box.querySelector('article p')!.innerHTML).toBe('Take your time.')
  })
})

describe('the pictures of the demo class are drawn as they were', () => {
  it('has no tspan on a number line with fraction marks, an area model or a bar chart', () => {
    const specs = [
      { kind: 'number_line', min: 0, max: 1, step: 0.25, marks: [{ value: 0.75, label: '3/4' }] },
      { kind: 'area_model', rows: 3, cols: 4, shaded: 12 },
      { kind: 'bar_chart', bars: [{ label: 'Mon', value: 3 }, { label: 'Tue', value: 5 }], yMax: 6 },
      { kind: 'shape_2d', shape: 'rectangle', labels: ['5 cm', '3 cm', 'Area = 15 cm²'] },
    ]
    for (const spec of specs) {
      const box = html(<DiagramView spec={spec} />)
      expect(box.querySelector('svg'), spec.kind).not.toBeNull()
      expect(box.querySelectorAll('tspan'), spec.kind).toHaveLength(0)
    }
  })
})

// ---- Textbook notation on every learner screen (owner, 16 Nov): no slash, caret, sqrt or star in the maths that is seen ----------------------------

import { render } from '@testing-library/react'
import { QuestionScreen } from '../app/k/session/_parts/QuestionScreen'
import { Results } from '../app/k/session/_parts/Results'
import type { MissedQuestion, QuestionForChild } from '../app/k/session/[sessionId]/logic'

/** What a child sees as text: the screen with the copy that is only for a screen reader taken out (the keys of the keyboard are seen, so their faces are held to the same rule). */
const seen = (el: Element) => {
  const copy = el.cloneNode(true) as HTMLElement
  copy.querySelectorAll('.sr-only, script, style').forEach((e) => e.remove())
  return (copy.textContent ?? '').replace(/​/g, '')
}
/** A character the textbook does not use in maths: a slash (a fraction), a caret (a power), a star (times), the word sqrt, or a hyphen used as a minus. */
const RAW = /[/^*]|sqrt|\d\s?-\s?[\dxy(]|(?:^|[\s(=])-\s?[\dxy(]/

const ask = (over: Partial<QuestionForChild>): QuestionForChild => ({ position: 3, phase: 'try', index: 1, of: 5, prompt: 'Work it out', render: 'text', answerKind: 'whole', ...over })
const screen = (q: QuestionForChild) => {
  const el = document.createElement('div')
  el.innerHTML = renderToStaticMarkup(<QuestionScreen q={q} busy={false} onAnswer={() => {}} />)
  return el
}

describe('a question screen of a senior class shows textbook maths and no raw notation', () => {
  const cases: [string, Partial<QuestionForChild>][] = [
    ['a factorised answer (the hint has an example)', { prompt: 'Factorise: x^2 - 4', answerKind: 'expression', form: 'factorised' } as Partial<QuestionForChild>],
    ['an expression with a fraction', { prompt: 'Simplify (x^2 - 9)/(x - 3)', answerKind: 'expression', form: 'any' } as Partial<QuestionForChild>],
    ['an equation (its hint has two answers)', { prompt: 'Solve: 2 * x - 5 = 3', answerKind: 'equation' }],
    ['a number with a root and a times between numbers', { prompt: 'What is sqrt(16) + 3 x 4 - 2?', answerKind: 'number' }],
    ['a number question (the hint has a negative number)', { prompt: 'What is 3 - 6?', answerKind: 'number' }],
    ['a trig question', { prompt: 'Find sin(30°) + cos^2(x) when x = 60°', answerKind: 'number' }],
    ['a derivative question (its keys include d over dx and the power key)', { prompt: 'Differentiate y = x^2 + 3x with respect to x', answerKind: 'expression', form: 'any' } as Partial<QuestionForChild>],
    ['a warm-up with choices', { phase: 'warmup', of: 2, prompt: 'Which is equal to x^2/4?', answerKind: 'choice', choices: ['x/2', '(x/2)^2', 'sqrt(x)', '2 * x', '3 x 4'] }],
  ]
  it.each(cases)('%s', (_name, over) => {
    const page = screen(ask(over))
    expect(seen(page)).not.toMatch(RAW)
    expect(page.querySelector('.katex')).not.toBeNull()
  })

  it('a product of numbers written with x or * is drawn with the times sign', () => {
    const h1 = screen(ask({ prompt: 'What is 3 x 4 + 2 * 5?', answerKind: 'number' })).querySelector('h1[data-prompt]')!
    expect(h1.textContent).toContain('×')
    expect(seen(h1)).not.toMatch(/[x*]/)
  })
})

describe('a results card shows textbook maths and no raw notation', () => {
  const missed = (over: Partial<MissedQuestion>): MissedQuestion => ({
    n: 1,
    correct: false,
    prompt: 'Solve: x/2 + 6 = 10',
    render: 'text',
    wrote: '2 * 4',
    right: 'x = 8',
    why: 'You took 6 * 2 away and not 6: x/2 = 4 and x^2 = 64.',
    rightWay: 'x/2 = 4, so x = 2 * 4 = 8. Check: sqrt(64) = 8 and (x + 2)/(x - 2) = 10/6.',
    steps: ['x/2 + 6 = 10', 'x/2 = 4', 'x = 2 * 4', 'x = sqrt(64)'],
    ...over,
  })
  it.each([
    ['a missed answer', missed({})],
    ['a right answer', missed({ correct: true, wrote: 'x = 8' })],
    ['a missed answer with a power and a root as the answer', missed({ wrote: 'x^2', right: 'sqrt(x)' })],
  ])('%s', (_name, m) => {
    const { container } = render(<Results firstName="Amina" missed={[m]} />)
    expect(seen(container)).not.toMatch(RAW)
    expect(container.querySelector('.katex')).not.toBeNull()
  })
})

describe('lesson cards and captions show textbook maths and no raw notation', () => {
  it('a card with a fraction, a power, a root, a times and a minus', () => {
    const lesson = {
      title: 'Fractions of letters',
      format: 'reading',
      cards: [{ heading: 'Cancel (x^2 - 9)/(x - 3)', body: 'Factorise the top: (x - 3)(x + 3). Then x^2 = 9 means x = sqrt(9) = 3 and 2 * 3 = 6.' }],
    } as unknown as LessonForChild
    const box = html(<LearnCards lesson={lesson} card={0} onBack={() => {}} onNext={() => {}} />)
    expect(seen(box.querySelector('article')!)).not.toMatch(RAW)
    expect(box.querySelectorAll('article .mfrac').length).toBeGreaterThanOrEqual(1)
  })

  it('a step caption and a contrast caption of a diagram lesson', () => {
    const lesson = {
      title: 'A line',
      format: 'diagram',
      diagram: {
        caption: 'A line',
        steps: [{ caption: 'The gradient is (y2 - y1)/(x2 - x1) = 6/3', diagram: { kind: 'coordinate_plane', xMin: -5, xMax: 5, yMin: -5, yMax: 5, graphs: [{ type: 'line', m: 2, c: 0, label: 'y = 2x' }] } }],
        contrast: { caption: 'Not x^2 - 4, which curves, and not 3 x 4 = 12.', diagram: { kind: 'coordinate_plane', xMin: -5, xMax: 5, yMin: -5, yMax: 5, graphs: [{ type: 'parabola', a: 1, q: -4, label: 'y = x^2/4' }] } },
      },
    } as unknown as LessonForChild
    const box = html(<LearnDiagram lesson={lesson} onReady={() => {}} />)
    expect(seen(box.querySelector('figure')!)).not.toMatch(RAW)
    expect(seen(box.querySelector('aside')!)).not.toMatch(RAW)
  })

  it('the keys of a derivative question have d over dx and a raised power', () => {
    const page = screen(ask({ prompt: 'Differentiate y = x^2 + 3x with respect to x', answerKind: 'expression', form: 'any' } as Partial<QuestionForChild>))
    expect(page.querySelector('[data-keys] button[aria-label="d by dx"] .flex-col')!.textContent).toBe('ddx')
    expect(page.querySelector('[data-keys] button[aria-label="to the power of"] sup')).not.toBeNull()
    expect(page.querySelector('[data-keys] button[aria-label="fraction"] .flex-col')!.textContent).toBe('ab')
    expect(seen(page.querySelector('[data-keys]')!)).not.toMatch(/[/^]/)
  })
})

describe('the typesetting of a line of maths (P129)', () => {
  it('a letter with a digit after it is a letter with a small number below it', () => {
    expect(toLatexRun('(y2 - y1)/(x2 - x1)')).toBe('\\displaystyle \\frac{y_{2}-y_{1}}{x_{2}-x_{1}}')
    expect(toLatexRun('a1 + a2')).toBe('\\displaystyle a_{1}+a_{2}')
    // a cell of a grid, or a capital letter with a number, is not one
    expect(toLatexRun('B2')).toBeNull()
  })

  it('an x between two numbers is the times sign, and a star too', () => {
    const math = (text: string) => segments(text, 'all').filter((s) => s.kind === 'math').map((s) => (s as { latex: string }).latex)
    expect(math('What is 3 x 4?')).toEqual(['\\displaystyle 3\\times 4'])
    expect(math('What is 3 * 4?')).toEqual(['\\displaystyle 3\\times 4'])
    // an x beside a letter or a sign stays a letter
    expect(math('Solve 2 + x = 5')).toEqual(['\\displaystyle 2+x=5'])
  })
})
