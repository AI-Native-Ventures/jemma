import { renderToStaticMarkup } from 'react-dom/server'
import type { CoordinatePlaneSpec, TriangleSpec } from '@jemma/profiling/schemas'
import { describe, expect, it } from 'vitest'
import { CoordinatePlane, DiagramView, Shape2D, Triangle } from '@/components/diagrams'
import { RichHtml, labelRuns, plainLabel, raisedLabel, type Run } from '@/components/diagrams/math-label'
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
    expect(joined(runs)).toBe(`θ = sin${MINUS}1(opposite / hypotenuse)`)
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
