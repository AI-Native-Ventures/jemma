import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { renderPrompt } from '../src/ai/prompt-variants'
import { makeClassContext } from '../src/ai/subject-profile'
import { curveThrough, curveWords, plotProblem, sketchKeyProblem, smoothAt, tidyPlot } from '../src/logic/answers/plot'
import { degreeGraphOf, finishAnswer, graphEquationOf, readNumber } from '../src/logic/meaning'
import { SeniorQuestionSchema, type PlotSpec, type Question } from '../src/schemas/lesson'
import { answerProblem } from '../src/tools/save/save-lesson'

// P182: a sin or cos graph sketched on a grid in degrees (the "Sketch a graph" board): the learner taps its key points and Jemma joins them into the wave.
// Right when they are the key points, in any order. Senior classes only. No database, no network, no model.

const PROMPT = readFileSync(new URL('../src/jobs/write_lesson.md', import.meta.url), 'utf8')
const grid: PlotSpec = { xMin: 0, xMax: 360, yMin: -2, yMax: 4, xStep: 30, place: ['0°', '90°', '180°', '270°', '360°'], curve: 'trig' }
const KEY = '0; 1; 90; 3; 180; 1; 270; -1; 360; 1'
const question = (over: Partial<Question> = {}): Question => ({
  prompt: 'Sketch y = 2 sin x + 1 for 0° ≤ x ≤ 360°. Tap its 5 key points.',
  render: 'text',
  steps: ['x = 90°: y = 2(1) + 1 = 3', 'x = 270°: y = 2(−1) + 1 = −1'],
  answer: KEY,
  answerKind: 'list',
  plot: grid,
  difficulty: 2,
  why: 'sin x goes from −1 to 1, so 2 sin x + 1 goes from −1 to 3.',
  rightWay: 'Work out y at 0°, 90°, 180°, 270° and 360°.',
  ...over,
})
const problem = (q: Question) => sketchKeyProblem({ ...q, plot: q.plot! }, readNumber, graphEquationOf, degreeGraphOf)

describe('a sin or cos graph on a grid in degrees', () => {
  test('a good sketch passes; the senior schema takes it', () => {
    expect(plotProblem(grid)).toBeNull()
    expect(answerProblem(question())).toBeNull()
    expect(SeniorQuestionSchema.safeParse(question()).success).toBe(true)
  })

  test('a trig grid has its degrees per square, and only a trig grid does', () => {
    expect(plotProblem({ ...grid, xStep: 20 })).toContain('15, 30, 45, 90 degrees')
    expect(plotProblem({ ...grid, xStep: undefined })).toContain('`xStep`')
    expect(plotProblem({ xMin: -5, xMax: 5, yMin: -5, yMax: 5, place: ['A'], xStep: 30 })).toContain('`xStep`')
    expect(plotProblem({ ...grid, xMax: 350 })).toContain('multiples of xStep')
    expect(plotProblem({ ...grid, place: ['a', 'b', 'c', 'd', 'e', 'f'] })).toContain('3 to 5 key points')
  })

  test('the equation is read in degrees: x or θ', () => {
    const g = degreeGraphOf('Sketch y = 2 sin x + 1 for 0° ≤ x ≤ 360°.')!
    expect([0, 90, 180, 270, 360].map((x) => Math.round(g(x) * 1e9) / 1e9)).toEqual([1, 3, 1, -1, 1])
    expect(Math.round(degreeGraphOf('Sketch y = cos(θ − 30°).')!(30) * 1e9) / 1e9).toBe(1)
  })

  test('the key points of one wave are joined into the true wave', () => {
    const g = degreeGraphOf('y = 2 sin x + 1')!
    const pts = [{ x: 0, y: 1 }, { x: 90, y: 3 }, { x: 180, y: 1 }, { x: 270, y: -1 }, { x: 360, y: 1 }]
    for (const x of [20, 45, 135, 200, 300]) expect(smoothAt(pts, x)).toBeCloseTo(g(x), 9)
    expect(Number.isNaN(smoothAt(pts, 400))).toBe(true)
    expect(curveWords(curveThrough('trig', pts)!)).toBe('goes through (0° ; 1), (90° ; 3), (180° ; 1), (270° ; −1) and (360° ; 1)')
    expect(curveThrough('trig', [{ x: 0, y: 1 }, { x: 0, y: 2 }, { x: 90, y: 3 }])).toBeNull()
  })

  test('the key points are right in any order; another point is wrong', () => {
    const q = tidyPlot(question())
    expect(q.labels).toHaveLength(10)
    expect(q.labels!.slice(-2)).toEqual(['Fifth x', 'Fifth y'])
    expect(finishAnswer(q, KEY).correct).toBe(true)
    expect(finishAnswer(q, '360; 1; 0; 1; 270; -1; 90; 3; 180; 1').correct).toBe(true)
    expect(finishAnswer(q, '0; 1; 90; 2; 180; 1; 270; -1; 360; 1').correct).toBe(false)
  })

  test('a key that is not the key points of the graph is refused', () => {
    expect(problem(question({ answer: '0; 1; 90; 2; 180; 1; 270; -1; 360; 1' }))).toContain('is not on the graph of the question')
    expect(problem(question({ answer: '0; 1; 90; 3; 180; 1; 300; 0; 360; 1' }))).toContain('evenly spaced')
    expect(problem(question({ prompt: 'Sketch y = sin 2x for 0° ≤ x ≤ 360°.', answer: '0; 0; 90; 0; 180; 0; 270; 0; 360; 0' }))).toContain('high or a low point at about x = 45°')
    expect(problem(question({ plot: { ...grid, yMax: 2 } }))).toContain('stays inside the grid')
    expect(problem(question({ prompt: 'Sketch the graph. Tap its key points.' }))).toContain('equation of the graph')
    expect(answerProblem(question({ answer: '0; 1; 90; 2; 180; 1; 270; -1; 360; 1' }))).toContain('plot:')
  })

  test('the senior writer is told how to ask for it', () => {
    const text = renderPrompt('write_lesson', PROMPT, makeClassContext({ classId: 'c', subject: 'Mathematics', grade: 10, country: 'ZA' }))
    expect(text).toContain('`curve: "trig"`')
    expect(text).toContain('`0; 1; 90; 3; 180; 1; 270; -1; 360; 1`')
  })
})
