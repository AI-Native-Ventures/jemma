import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { renderPrompt } from '../src/ai/prompt-variants'
import { makeClassContext } from '../src/ai/subject-profile'
import { cubicThrough, curveThrough, curveWords, hyperbolaThrough, markSketch, plotProblem, sketchCurve, sketchKeyProblem, tidyPlot, turningPoints } from '../src/logic/answers/plot'
import { finishAnswer, graphEquationOf, readNumber } from '../src/logic/meaning'
import { SeniorQuestionSchema, type PlotSpec, type Question } from '../src/schemas/lesson'
import { answerProblem } from '../src/tools/save/save-lesson'

// P181: the rest of the "Sketch a graph" board: a hyperbola through 3 points (its asymptotes drawn) and a cubic graph through 4 key points. Like a parabola,
// the answer is marked by its curve. Senior classes only. No database, no network, no model.

const PROMPT = readFileSync(new URL('../src/jobs/write_lesson.md', import.meta.url), 'utf8')
const hyp: PlotSpec = { xMin: -5, xMax: 5, yMin: -5, yMax: 5, place: ['x-intercept', 'point', 'point'], curve: 'hyperbola' }
const cub: PlotSpec = { xMin: -2, xMax: 4, yMin: -5, yMax: 5, place: ['x-intercept', 'x-intercept', 'x-intercept', 'y-intercept'], curve: 'cubic' }
const question = (over: Partial<Question> = {}): Question => ({
  prompt: 'Sketch y = 2/x + 1. Tap where it cuts the x-axis, and two more points of the graph.',
  render: 'text',
  steps: ['y = 0: 2/x = −1, so x = −2', 'x = 1: y = 3; x = 2: y = 2'],
  answer: '-2; 0; 1; 3; 2; 2',
  answerKind: 'list',
  plot: hyp,
  difficulty: 2,
  why: 'The asymptotes are x = 0 and y = 1.',
  rightWay: 'Put y = 0 to find x = −2, then work out two more points.',
  ...over,
})
const cubic = (over: Partial<Question> = {}): Question =>
  question({ prompt: 'Sketch y = (x + 1)(x − 1)(x − 3). Tap where it cuts the axes.', answer: '-1; 0; 1; 0; 3; 0; 0; 3', plot: cub, ...over })

describe('a hyperbola and a cubic graph', () => {
  test('good sketches pass; the senior schema takes them', () => {
    expect(plotProblem(hyp)).toBeNull()
    expect(plotProblem(cub)).toBeNull()
    expect(answerProblem(question())).toBeNull()
    expect(answerProblem(cubic())).toBeNull()
    expect(SeniorQuestionSchema.safeParse(question()).success).toBe(true)
    expect(SeniorQuestionSchema.safeParse(cubic()).success).toBe(true)
  })

  test('three points make one hyperbola and four make one cubic graph', () => {
    expect(hyperbolaThrough([{ x: -2, y: 0 }, { x: 1, y: 3 }, { x: 2, y: 2 }])).toMatchObject({ a: 2, q: 1 })
    expect(Math.abs(hyperbolaThrough([{ x: -2, y: 0 }, { x: 1, y: 3 }, { x: 2, y: 2 }])!.p)).toBe(0)
    expect(hyperbolaThrough([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }])).toBeNull()
    expect(hyperbolaThrough([{ x: -2, y: 0 }, { x: 1, y: 3 }, { x: 2, y: 3 }])).toBeNull()
    expect(cubicThrough([{ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 3, y: 0 }, { x: 0, y: 3 }])).toEqual({ a: 1, b: -3, c: -1, d: 3 })
    expect(cubicThrough([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 4 }, { x: 3, y: 9 }])).toBeNull()
    expect(cubicThrough([{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 2, y: 4 }, { x: 3, y: 9 }])).toBeNull()
  })

  test('a curve is said by its asymptotes or where it turns', () => {
    expect(curveWords(curveThrough('hyperbola', [{ x: -2, y: 0 }, { x: 1, y: 3 }, { x: 2, y: 2 }])!)).toBe('has asymptotes x = 0 and y = 1')
    expect(curveWords(curveThrough('cubic', [{ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 3, y: 0 }, { x: 0, y: 3 }])!)).toBe('turns at (−0,15 ; 3,08) and (2,15 ; −3,08)')
    expect(curveWords(curveThrough('cubic', [{ x: -1, y: -1 }, { x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 8 }])!)).toBe('has no turning point')
    expect(turningPoints(curveThrough('hyperbola', [{ x: -2, y: 0 }, { x: 1, y: 3 }, { x: 2, y: 2 }])!)).toEqual([])
  })

  test('any points of the same curve are right, in any order', () => {
    const h = tidyPlot(question())
    expect(h.labels).toEqual(['First x', 'First y', 'Second x', 'Second y', 'Third x', 'Third y'])
    expect(finishAnswer(h, '2; 2; -1; -1; 4; 1,5').correct).toBe(true)
    expect(finishAnswer(h, '2; 2; -1; -1; 4; 2').correct).toBe(false)
    const c = tidyPlot(cubic())
    expect(c.labels).toHaveLength(8)
    expect(finishAnswer(c, '0; 3; 3; 0; -1; 0; 2; -3').correct).toBe(true)
    expect(finishAnswer(c, '0; 3; 3; 0; -1; 0; 2; -2').correct).toBe(false)
    expect(markSketch('-2; 0; 1; 3; 2; 2', '-2; 0; 1; 3; 2; 2', readNumber, 'parabola').correct).toBe(true)
  })

  test('a key that is not the graph of the question, or does not show its shape, is refused', () => {
    const problem = (q: Question) => sketchKeyProblem({ ...q, plot: q.plot! }, readNumber, graphEquationOf)
    expect(problem(question({ answer: '-2; 0; 1; 3; 2; 3' }))).toContain('make no hyperbola')
    expect(problem(question({ prompt: 'Sketch y = 2/(x − 6) + 1.', answer: '4; 0; 5; -1; 3; 0,333' }))).toContain('both asymptotes')
    expect(problem(question({ prompt: 'Sketch y = 3/x + 1.' }))).toContain('is not on the graph of the question')
    expect(problem(cubic({ prompt: 'Sketch y = (x + 1)(x − 1)(x − 2).' }))).toContain('is not on the graph of the question')
    expect(problem(cubic({ answer: '-1; 0; 1; 0; 2; 0; 0; 0' }))).toContain('make no cubic graph')
    expect(problem(cubic({ plot: { ...cub, yMin: -3, yMax: 3 } }))).toContain('turns inside the grid')
    expect(plotProblem({ ...cub, place: ['a', 'b', 'c'] })).toContain('a cubic graph is sketched through 4 key points')
    expect(answerProblem(question({ answer: '-2; 0; 1; 3; 2; 3' }))).toContain('plot:')
  })

  test('a hyperbola is drawn on each side of its asymptote, never across it', () => {
    const pieces = sketchCurve(hyp, curveThrough('hyperbola', [{ x: -2, y: 0 }, { x: 1, y: 3 }, { x: 2, y: 2 }])!)
    expect(pieces).toHaveLength(2)
    expect(pieces[0]!.every((pt) => pt.x < 0)).toBe(true)
    expect(pieces[1]!.every((pt) => pt.x > 0)).toBe(true)
  })

  test('the senior writer is told how to ask for them', () => {
    const text = renderPrompt('write_lesson', PROMPT, makeClassContext({ classId: 'c', subject: 'Mathematics', grade: 12, country: 'ZA' }))
    expect(text).toContain('`curve: "hyperbola"`')
    expect(text).toContain('`curve: "cubic"`')
    expect(text).toContain('`-1; 0; 1; 0; 3; 0; 0; 3`')
  })
})
