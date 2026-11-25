// @vitest-environment node
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { pictureProblem, treeProbability } from '@jemma/profiling/logic'
import { SeniorDiagramSpecSchema, type SeniorDiagramSpec, type TimelineSpec } from '@jemma/profiling/schemas'
import { DiagramView } from '../components/diagrams/DiagramView'
import { shownPeriods } from '../components/diagrams/Timeline'

// P165: three more pictures for Grades 10 to 12: a box and whisker plot, a probability tree and a time line of financial maths.

const box = { kind: 'box_plot', min: 32, q1: 48, median: 61, q3: 74, max: 93, scaleMin: 0, scaleMax: 100, step: 10, title: '12A test marks (%)' } as const
const tree = {
  kind: 'tree',
  first: [{ label: 'A', p: '0,4' }, { label: 'not A', p: '?' }],
  second: [
    [{ label: 'B', p: '0,7' }, { label: 'not B', p: '?' }],
    [{ label: 'B', p: '0,7' }, { label: 'not B', p: '?' }],
  ],
} as const
const timeline = { kind: 'timeline', from: 0, to: 36, unit: 'month', every: { from: 1, to: 36, label: 'R500' }, marks: [{ at: 36, label: 'F = ?' }] } as const

const draw = (spec: unknown) => renderToStaticMarkup(<DiagramView spec={spec} variant="question" />)
const label = (html: string) => /aria-label="([^"]+)"/.exec(html)?.[1] ?? ''

describe('the new pictures', () => {
  it('are pictures a senior question may carry', () => {
    for (const spec of [box, tree, timeline]) {
      const parsed = SeniorDiagramSpecSchema.safeParse(spec)
      expect(parsed.success).toBe(true)
      expect(pictureProblem(parsed.data as SeniorDiagramSpec)).toBeNull()
    }
  })

  it('draw a box plot that is read off its scale, and say what it shows', () => {
    const html = draw(box)
    expect(html).toContain('data-box=""')
    expect(label(html)).toBe('12A test marks (%). Box and whisker plot on a scale from 0 to 100. Minimum 32, lower quartile 48, median 61, upper quartile 74, maximum 93.')
    expect(html).not.toMatch(/>61</)
  })

  it('draw a tree with its blanks, and say which branches are blank', () => {
    const html = draw(tree)
    expect((html.match(/data-blank=""/g) ?? []).length).toBe(3)
    expect(label(html)).toBe('Tree diagram. First branches: A with probability 0,4 and not A, blank. After A: B with probability 0,7 and not B, blank. After not A: B with probability 0,7 and not B, blank.')
  })

  it('draw a long time line with a break, the payments and the labels', () => {
    expect(shownPeriods(SeniorDiagramSpecSchema.parse(timeline) as TimelineSpec)).toEqual([0, 1, 2, 35, 36])
    const html = draw(timeline)
    expect(html).toContain('data-break=""')
    expect(html).toContain('R500')
    expect(label(html)).toBe('Time line from month 0 to month 36. R500 at the end of months 1 to 36. F = ? at month 36.')
  })

  it('refuse a picture that makes no sense, which then never reaches a learner', () => {
    const bad: unknown[] = [
      { ...box, q1: 70 },
      { ...box, max: 120 },
      { ...box, step: 1 },
      { ...tree, first: [{ label: 'A', p: '1,4' }, { label: 'not A', p: '?' }] },
      { ...tree, second: [[{ label: 'B', p: '0,7' }]] },
      { ...timeline, to: 0 },
      { ...timeline, every: { from: 1, to: 40, label: 'R500' } },
    ]
    for (const spec of bad) {
      expect(pictureProblem(SeniorDiagramSpecSchema.parse(spec))).not.toBeNull()
      expect(draw(spec)).toContain('Picture missing')
    }
    expect([treeProbability('0,4'), treeProbability('0.25'), treeProbability('2/5'), treeProbability('1'), treeProbability('7/5'), treeProbability('abc')]).toEqual([0.4, 0.25, 0.4, 1, null, null])
  })
})
