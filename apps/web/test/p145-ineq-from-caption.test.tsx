import { createHash } from 'node:crypto'
import { render } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { DiagramSpec } from '@jemma/profiling/schemas'
import { describe, expect, test } from 'vitest'
import { DiagramView, NumberLine } from '@/components/diagrams'
import { readCaption } from '@/components/diagrams/inequality'
import { LearnDiagram } from '../app/k/session/_parts/LearnDiagram'
import type { LessonForChild } from '../app/k/session/[sessionId]/types'
import before from './fixtures/p141-before.json'
import { NUMBER_LINES } from './fixtures/p141-specs'

// P145: real lessons label the boundary mark of an inequality with just a number ("3"), and say the inequality in the caption of the step ("running to the
// right of 3"). In a senior lesson the number line reads the caption: a circle and a ray, never hops. A single mark that is a solution ("x = 4", a number, "x")
// is a dot with its label. A primary picture, and a line with no caption, is as it was. react-dom/server only: no browser.

const html = (node: React.ReactElement) => {
  const box = document.createElement('div')
  box.innerHTML = renderToStaticMarkup(node)
  return box
}
const num = (el: Element, name: string) => Number(el.getAttribute(name))
const sha = (markup: string) => createHash('sha256').update(markup).digest('hex')
const X0 = 30
const X1 = 255
const px = (v: number, min: number, max: number) => X0 + ((v - min) / (max - min)) * (X1 - X0)

type Spec = Extract<DiagramSpec, { kind: 'number_line' }>
const line = (min: number, max: number, marks: Spec['marks']): Spec => ({ kind: 'number_line', min, max, step: 1, marks })
const senior = (spec: Spec, caption: string) => html(<NumberLine {...spec} caption={caption} senior />)
const TICK_ROW = 138
const row = (box: HTMLElement) => [...box.querySelectorAll('text')].filter((t) => num(t, 'y') === TICK_ROW).map((t) => t.textContent)

// The two captions of the live lesson, "Equations and inequalities" (16 Nov, Grade 11).
const STEP_CAPTION = 'The answer to 2x − 6 > 0 is a piece of the number line, running to the right of 3 because every x bigger than 3 makes 2x − 6 positive.'
const CONTRAST_CAPTION = 'A sign slip puts the boundary on the wrong side of zero; the boundary of 2x − 6 > 0 comes from 2x = 6, so it sits at 3, not at −3.'
const STEP: Spec = line(-2, 6, [{ label: '3', value: 3 }])
const CONTRAST: Spec = line(-6, 6, [{ label: '−3', value: -3 }])

describe('a senior number line reads the caption of its step', () => {
  test('the step: "running to the right of 3" is an open circle at 3 and a ray to the right, no hop, and the 3 is written once', () => {
    const box = senior(STEP, STEP_CAPTION)
    expect(box.querySelectorAll('path'), 'no hop arcs').toHaveLength(0)
    const open = box.querySelectorAll('circle[data-circle="open"]')
    expect(open).toHaveLength(1)
    expect(box.querySelectorAll('circle[data-circle="filled"]')).toHaveLength(0)
    expect(num(open[0]!, 'cx')).toBeCloseTo(px(3, -2, 6), 0)
    const ray = box.querySelector('[data-ray]')!
    expect(ray.getAttribute('data-ray')).toBe('right')
    expect(Math.max(num(ray, 'x1'), num(ray, 'x2'))).toBeGreaterThanOrEqual(X1)
    expect(box.querySelector('polygon[data-arrow="right"]')).not.toBeNull()
    // the label "3" is the number under the line: it is not written again above the circle
    expect(box.querySelector('[data-mark-label]')).toBeNull()
    expect(row(box)).toEqual(['-2', '-1', '0', '1', '2', '3', '4', '5', '6'])
  })

  test('the contrast: the caption has "> 0" but no direction for -3: an open circle at -3, no ray, no hop', () => {
    const box = senior(CONTRAST, CONTRAST_CAPTION)
    expect(box.querySelectorAll('path'), 'no hop arcs').toHaveLength(0)
    const open = box.querySelectorAll('circle[data-circle="open"]')
    expect(open).toHaveLength(1)
    expect(num(open[0]!, 'cx')).toBeCloseTo(px(-3, -6, 6), 0)
    expect(box.querySelector('[data-ray]')).toBeNull()
    expect(box.querySelector('polygon[data-arrow]')).toBeNull()
    expect(box.querySelector('[data-segment]')).toBeNull()
    expect(box.querySelector('[data-mark-label]')).toBeNull()
    expect(row(box)).toContain('-3')
  })

  test('the same two pictures without the senior flag (a primary lesson) keep their hops, caption or none', () => {
    for (const [spec, caption] of [[STEP, STEP_CAPTION], [CONTRAST, CONTRAST_CAPTION]] as const) {
      expect(html(<NumberLine {...spec} caption={caption} />).querySelectorAll('path').length).toBeGreaterThan(0)
      expect(html(<NumberLine {...spec} />).querySelectorAll('path').length).toBeGreaterThan(0)
      expect(html(<NumberLine {...spec} caption={caption} senior={false} />).querySelector('circle[data-circle]')).toBeNull()
    }
  })

  test('a senior line with no caption is a dot, never hops, for a bare number', () => {
    const box = html(<NumberLine {...STEP} senior />)
    expect(box.querySelectorAll('path')).toHaveLength(0)
    expect(box.querySelector('circle[data-circle]')).toBeNull()
    expect(box.querySelectorAll('circle')).toHaveLength(1)
  })
})

describe('the words and the signs of a caption that give a direction at a mark', () => {
  const cases: [string, number, 'left' | 'right', boolean][] = [
    ['The answer is to the right of 3.', 3, 'right', false],
    ['Everything to the left of 4 works.', 4, 'left', false],
    ['The answer is bigger than 3.', 3, 'right', false],
    ['x has to be greater than −3 here.', -3, 'right', false],
    ['The values are more than 2.', 2, 'right', false],
    ['It has to be less than 5.', 5, 'left', false],
    ['Smaller than 5 is allowed.', 5, 'left', false],
    ['The number is at least 3.', 3, 'right', true],
    ['The number is at most 3.', 3, 'left', true],
    ['x can be greater than or equal to 2.', 2, 'right', true],
    ['x can be less than or equal to 2,5.', 2.5, 'left', true],
    ['3 or more is fine.', 3, 'right', true],
    ['So x > 3.', 3, 'right', false],
    ['So x ≥ 3.', 3, 'right', true],
    ['So x ≤ −3.', -3, 'left', true],
    ['So x <= 3 and nothing else.', 3, 'left', true],
    ['It means 3 < x.', 3, 'right', false],
    ['It means −3 ≥ x.', -3, 'left', true],
  ]
  for (const [caption, value, dir, closed] of cases) {
    test(`"${caption}" at ${value}: a ${closed ? 'filled' : 'open'} circle, ray to the ${dir}`, () => {
      const hi = Math.max(6, Math.ceil(value) + 3)
      const lo = Math.min(-6, Math.floor(value) - 3)
      const box = senior(line(lo, hi, [{ label: String(value).replace('.', ',').replace('-', '−'), value }]), caption)
      expect(box.querySelectorAll('path')).toHaveLength(0)
      expect(box.querySelectorAll(`circle[data-circle="${closed ? 'filled' : 'open'}"]`)).toHaveLength(1)
      expect(box.querySelector('[data-ray]')!.getAttribute('data-ray')).toBe(dir)
    })
  }

  test('a number that is not the mark is not read for it: "right of 3" with the mark at 4 gives an open circle only', () => {
    const box = senior(line(-2, 8, [{ label: '4', value: 4 }]), 'It runs to the right of 3, so x > 3.')
    expect(box.querySelector('[data-ray]')).toBeNull()
    expect(box.querySelectorAll('circle[data-circle="open"]')).toHaveLength(1)
    expect(box.querySelectorAll('path')).toHaveLength(0)
  })

  test('a coefficient is not a boundary: "2x > 6" says nothing at 6 (open circle only), and "2 − x > 3" says nothing at 3', () => {
    expect(senior(line(0, 8, [{ label: '6', value: 6 }]), 'Now 2x > 6.').querySelector('[data-ray]')).toBeNull()
    expect(senior(line(0, 8, [{ label: '6', value: 6 }]), 'Now 2x > 6.').querySelectorAll('circle[data-circle="open"]')).toHaveLength(1)
    expect(senior(line(-6, 8, [{ label: '3', value: 3 }]), 'Now 2 − x > 3.').querySelector('[data-ray]')).toBeNull()
    expect(senior(line(0, 8, [{ label: '4', value: 4 }]), 'Then x + 1 > 4.').querySelector('[data-ray]')).toBeNull()
  })

  test('a caption with no sign and no direction leaves a bare number a dot (no open circle, no hop)', () => {
    const box = senior(line(0, 8, [{ label: '4', value: 4 }]), 'The solution is the number 4.')
    expect(box.querySelectorAll('path')).toHaveLength(0)
    expect(box.querySelector('circle[data-circle]')).toBeNull()
  })

  test('a caption with an inequality sign and two or more marks keeps the dots (they are not boundaries)', () => {
    const box = senior(line(0, 8, [{ label: '4', value: 4 }, { label: '5', value: 5 }]), 'Both 4 and 5 are solutions of x + 1 > 3.')
    expect(box.querySelector('circle[data-circle]')).toBeNull()
  })

  test('a segment in the caption: -2 < x <= 3 with marks at -2 and 3 is one shaded segment, open at -2 and filled at 3', () => {
    const box = senior(line(-4, 6, [{ label: '−2', value: -2 }, { label: '3', value: 3 }]), 'So the answer is −2 < x ≤ 3.')
    expect(box.querySelectorAll('path')).toHaveLength(0)
    const seg = box.querySelector('[data-segment]')!
    expect(num(seg, 'x1')).toBeCloseTo(px(-2, -4, 6), 0)
    expect(num(seg, 'x2')).toBeCloseTo(px(3, -4, 6), 0)
    expect(box.querySelectorAll('circle[data-circle="open"]')).toHaveLength(1)
    expect(box.querySelectorAll('circle[data-circle="filled"]')).toHaveLength(1)
    expect(box.querySelector('[data-ray]')).toBeNull()
  })

  test('a mark whose own label is an inequality is drawn from its label, as P141 did, and the caption does not change it', () => {
    const box = senior(line(-3, 8, [{ label: 'x < 4', value: 4 }]), 'It runs to the right of 4.')
    expect(box.querySelector('[data-ray]')!.getAttribute('data-ray')).toBe('left')
    expect(box.querySelectorAll('circle[data-circle]')).toHaveLength(1)
  })

  test('a mark outside the line gets nothing from the caption', () => {
    const box = senior(line(0, 8, [{ label: '40', value: 40 }]), 'It runs to the right of 40.')
    expect(box.querySelector('[data-ray]')).toBeNull()
  })

  test('a mark with a label of its own ("x = 3") that the caption gives a direction to: a ray, and its label above the circle', () => {
    const box = senior(line(-2, 8, [{ label: 'x = 3', value: 3 }]), 'The answer runs to the right of 3.')
    expect(box.querySelector('[data-ray]')!.getAttribute('data-ray')).toBe('right')
    expect(box.querySelector('[data-mark-label]')!.textContent).toBe('x = 3')
  })
})

describe('a single mark that is a solution is a dot with its label, in a senior lesson', () => {
  for (const label of ['x = 4', 'x = −4', 'x', '4', '−4', '4,5']) {
    test(`"${label}": no hop, one dot, its label written`, () => {
      const box = senior(line(-6, 8, [{ label, value: 4 }]), 'The solution of the equation is marked.')
      expect(box.querySelectorAll('path'), label).toHaveLength(0)
      expect(box.querySelectorAll('circle'), label).toHaveLength(1)
      expect(box.querySelector('circle[data-circle]'), label).toBeNull()
      expect(box.textContent, label).toContain(label)
    })
  }

  test('"x = 4" keeps the hops outside a senior lesson', () => {
    expect(html(<NumberLine {...line(0, 10, [{ label: 'x = 4', value: 4 }])} />).querySelectorAll('path').length).toBeGreaterThan(0)
    expect(html(<NumberLine {...line(0, 10, [{ label: 'x = 4', value: 4 }])} caption="Solve x = 4." />).querySelectorAll('path').length).toBeGreaterThan(0)
  })

  test('hops stay in a senior lesson for a mark that is an expression (counting on to 2x + 3), and for several marks', () => {
    expect(senior(line(0, 12, [{ label: '2x + 3', value: 11 }]), 'Count on.').querySelectorAll('path').length).toBeGreaterThan(0)
    expect(senior(line(0, 12, [{ label: 'A', value: 2 }, { label: 'B', value: 5 }]), 'Two jumps.').querySelectorAll('path').length).toBeGreaterThan(0)
    expect(senior(line(0, 12, [{ label: '2', value: 2 }, { label: '5', value: 5 }]), 'Two jumps.').querySelectorAll('path').length).toBeGreaterThan(0)
  })

  test('a ray with extra dots (x > 3 and the marks 4 and 5) is the ray and two dots, with no hop', () => {
    const spec = line(-2, 8, [{ label: 'x > 3', value: 3 }, { label: '4', value: 4 }, { label: '5', value: 5 }])
    const box = senior(spec, 'The answer is every number bigger than 3, like 4 and 5.')
    expect(box.querySelectorAll('path')).toHaveLength(0)
    expect(box.querySelector('[data-ray]')!.getAttribute('data-ray')).toBe('right')
    expect(box.querySelectorAll('circle[data-circle="open"]')).toHaveLength(1)
    // the two dots of 4 and 5 are plain marks
    expect(box.querySelectorAll('circle:not([data-circle])')).toHaveLength(2)
    // not senior: as P141 drew it
    expect(html(<NumberLine {...spec} />).querySelectorAll('path').length).toBeGreaterThan(0)
  })
})

// The pins are those of P141 (fixtures/p141-before.json). They were re-pinned by the South African colours (23 Nov 2026): only the colours moved, and
// the note above the pinned pictures in p141-diagram-fixes.test.tsx says how that was proved.
describe('what is not senior does not move', () => {
  const was = before as Record<string, string>
  for (const [name, spec] of Object.entries(NUMBER_LINES)) {
    test(`number line "${name}": byte for byte the markup of the code before P141 with a caption but no senior flag, and with the senior flag but no caption`, () => {
      expect(sha(renderToStaticMarkup(<NumberLine {...spec} caption="It runs to the right of 3, so x > 3." />))).toBe(was[name])
      expect(sha(renderToStaticMarkup(<DiagramView spec={spec} variant="learn" caption="It runs to the right of 3, so x > 3." />))).toBe(was[name])
    })
  }

  test('DiagramView hands the caption and the flag to the number line, and to nothing else', () => {
    const box = html(<DiagramView spec={STEP} variant="learn" caption={STEP_CAPTION} senior />)
    expect(box.querySelector('circle[data-circle="open"]')).not.toBeNull()
    const bars = html(<DiagramView spec={{ kind: 'fraction_bar', rows: [{ parts: 4, shaded: 2 }] }} variant="learn" caption="to the right of 3" senior />)
    expect(bars.querySelector('svg')).not.toBeNull()
  })
})

describe('readCaption', () => {
  test('finds the rays, in the order of the text, and says if there is a sign', () => {
    const r = readCaption('So x > 3, and the other side is x ≤ −1.')
    expect(r.rays).toEqual([{ value: 3, dir: 'right', closed: false }, { value: -1, dir: 'left', closed: true }])
    expect(r.symbol).toBe(true)
  })

  test('a caption with no sign and no direction word gives nothing', () => {
    expect(readCaption('Count on from zero.')).toEqual({ rays: [], segments: [], symbol: false })
  })

  test('the sign alone, with a boundary that is not one number, is a sign and no ray', () => {
    expect(readCaption('The line 2x − 6 > 0 is solved.')).toEqual({ rays: [], segments: [], symbol: true })
  })
})

describe('the lesson screen', () => {
  const lesson = (steps: { caption: string; diagram: DiagramSpec }[], contrast?: { caption: string; diagram: DiagramSpec }): LessonForChild => ({
    title: 'Equations and inequalities',
    format: 'diagram',
    minutes: 5,
    topicName: 'Equations',
    warmupCount: 2,
    tryCount: 5,
    first: null,
    diagram: { title: 'T', caption: 'C', steps, ...(contrast ? { contrast } : {}) },
  })

  test('a senior lesson draws the ray of its step and the open circle of its contrast', () => {
    const { container } = render(
      <LearnDiagram
        lesson={lesson([{ caption: STEP_CAPTION, diagram: STEP }], { caption: CONTRAST_CAPTION, diagram: CONTRAST })}
        onReady={() => {}}
      />,
    )
    expect(container.querySelectorAll('svg[role="img"] path').length, 'no hops').toBe(0)
    expect(container.querySelectorAll('[data-ray="right"]')).toHaveLength(1)
    expect(container.querySelectorAll('circle[data-circle="open"]')).toHaveLength(2)
  })

  test('a primary lesson (no algebra in a caption) keeps its hops', () => {
    const { container } = render(
      <LearnDiagram lesson={lesson([{ caption: 'Count on to the right of 3 and stop.', diagram: line(0, 6, [{ label: '3', value: 3 }]) }])} onReady={() => {}} />,
    )
    expect(container.querySelectorAll('svg[role="img"] path').length).toBeGreaterThan(0)
    expect(container.querySelector('[data-ray]')).toBeNull()
  })
})
