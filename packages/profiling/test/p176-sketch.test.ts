import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { renderPrompt } from '../src/ai/prompt-variants'
import { makeClassContext } from '../src/ai/subject-profile'
import { markSketch, parabolaThrough, plotProblem, sketchCurve, sketchKeyProblem, sketchName, tidyPlot, turningPoint } from '../src/logic/answers/plot'
import { finishAnswer, graphEquationOf, readNumber } from '../src/logic/meaning'
import { SeniorQuestionSchema, type PlotSpec, type Question } from '../src/schemas/lesson'
import { answerProblem } from '../src/tools/save/save-lesson'

// P176: a sketch of a parabola (the "Sketch a graph" board): the learner taps its key points and Jemma joins them into the curve. Three points of the same
// parabola are right, in any order. The key is checked against the equation in the question. Senior classes only. No database, no network, no model.

const PROMPT = readFileSync(new URL('../src/jobs/write_lesson.md', import.meta.url), 'utf8')
const grid: PlotSpec = { xMin: -4, xMax: 4, yMin: -5, yMax: 5, place: ['x-intercept', 'x-intercept', 'turning point'], curve: 'parabola' }
const question = (over: Partial<Question> = {}): Question => ({
  prompt: 'Sketch y = x² − 4. Tap where it cuts the x-axis, and its turning point.',
  render: 'text',
  steps: ['y = 0: x² = 4, so x = 2 or x = −2', 'x = 0: y = −4'],
  answer: '-2; 0; 2; 0; 0; -4',
  answerKind: 'list',
  plot: grid,
  difficulty: 2,
  why: 'Put x = 0: y = 0 − 4 = −4. The x² has a plus in front, so the graph opens up.',
  rightWay: 'Find where y = 0: x² = 4, so x = 2 or x = −2. Then x = 0 gives (0 ; −4).',
  ...over,
})

describe('a sketch of a parabola', () => {
  test('a good sketch passes; the senior schema takes it', () => {
    expect(plotProblem(grid)).toBeNull()
    expect(answerProblem(question())).toBeNull()
    expect(SeniorQuestionSchema.safeParse(question()).success).toBe(true)
  })

  test('the equation of the question is read: y =, f(x) =, a decimal comma, brackets, and the words after it left off', () => {
    const at = (text: string) => {
      const g = graphEquationOf(text)
      return g ? [-1, 0, 1, 2].map((x) => g(x) + 0) : null
    }
    expect(at('Sketch y = x² − 4. Tap where it cuts the x-axis, and its turning point.')).toEqual([-3, -4, -3, 0])
    expect(at('Sketch f(x) = −(x − 1)² + 4. Tap its key points.')).toEqual([0, 3, 4, 3])
    expect(at('Sketch y = 0,5x² − 2, then tap the key points.')).toEqual([-1.5, -2, -1.5, 0])
    expect(at('Sketch y = 2(x + 1)(x − 3) for −2 ≤ x ≤ 4.')).toEqual([0, -6, -8, -6])
    expect(at('Where y = 0, the graph cuts the x-axis. Sketch y = x² − 1.')).toEqual([0, -1, 0, 3])
    expect(at('Sketch the parabola through the points.')).toBeNull()
  })

  test('a key that is not the graph of the question is refused', () => {
    const problem = (over: Partial<Question>) => sketchKeyProblem({ ...question(over), plot: over.plot ?? grid }, readNumber, graphEquationOf)
    expect(problem({ answer: '-2; 0; 2; 0; 0; 4' })).toContain('the key point (0; 4) is not on the graph')
    expect(problem({ answer: '-2; 0; 0; 0; 2; 0' })).toContain('make no parabola')
    expect(problem({ answer: '-2; 0; -2; 3; 2; 0' })).toContain('make no parabola')
    expect(problem({ prompt: 'Sketch the parabola. Tap its key points.' })).toContain('equation of the graph')
    expect(problem({ prompt: 'Sketch y = x² − 9.', answer: '-3; 0; 3; 0; 0; -9' })).toContain('turns inside the grid')
    // Three points of a cubic are on a parabola too, but the graph is not that parabola.
    expect(problem({ prompt: 'Sketch y = x³ − x.', answer: '-1; 0; 0; 0; 1; 0' })).toContain('make no parabola')
    expect(problem({ prompt: 'Sketch y = x³ − 4x + 0,5x².', answer: '-2; 2; 0; 0; 2; 2' })).toContain('is not a parabola')
    expect(answerProblem(question({ answer: '-2; 0; 2; 0; 0; 4' }))).toContain('plot:')
    expect(plotProblem({ ...grid, place: ['A', 'B'] })).toContain('3 key points')
    expect(plotProblem({ ...grid, place: ['an intercept on x', 'x-intercept', 'turning point'] })).toContain('1 to 16 characters')
    expect(plotProblem({ ...grid, given: [{ x: 0, y: 0, label: 'O' }] })).toContain('no given points')
  })

  test('three points of the same parabola are right, in any order; another graph is wrong', () => {
    const q = tidyPlot(question())
    expect(q.labels).toEqual(['First x', 'First y', 'Second x', 'Second y', 'Third x', 'Third y'])
    expect(finishAnswer(q, '-2; 0; 2; 0; 0; -4').correct).toBe(true)
    expect(finishAnswer(q, '0; -4; 2; 0; -2; 0').correct).toBe(true)
    expect(finishAnswer(q, '-1; -3; 1; -3; 3; 5').correct).toBe(true)
    expect(finishAnswer(q, '-2; 0; 2; 0; 0; 4').correct).toBe(false)
    expect(finishAnswer(q, '-2; 0; 0; 0; 2; 0').correct).toBe(false)
    expect(markSketch(q.answer, 'a parabola', readNumber).comparable).toBe(false)
    expect(markSketch(q.answer, '-2; 0; 0; 0; 2; 0', readNumber)).toEqual({ correct: false, comparable: true })
  })

  test('the curve turns where it should and is cut at the edge of the grid', () => {
    const f = parabolaThrough([{ x: -2, y: 0 }, { x: 2, y: 0 }, { x: 0, y: -4 }])!
    expect(f).toEqual({ a: 1, b: 0, c: -4 })
    expect(sketchName(turningPoint(f))).toBe('(0 ; −4)')
    expect(sketchName({ x: 0.5, y: -2.25 })).toBe('(0,5 ; −2,25)')
    const [piece, ...more] = sketchCurve(grid, f)
    expect(more).toHaveLength(0)
    expect(piece![0]!.x).toBeCloseTo(-3, 6)
    expect(piece![0]!.y).toBe(5)
    expect(piece![piece!.length - 1]!.x).toBeCloseTo(3, 6)
    // A parabola that turns below the grid shows its two arms.
    expect(sketchCurve(grid, { a: 1, b: 0, c: -7 })).toHaveLength(2)
  })

  test('the senior writer is told how to ask for it', () => {
    const text = renderPrompt('write_lesson', PROMPT, makeClassContext({ classId: 'c', subject: 'Mathematics', grade: 10, country: 'ZA' }))
    expect(text).toContain('To have the learner sketch a parabola')
    expect(text).toContain('`curve: "parabola"`')
    expect(text).toContain('`-2; 0; 2; 0; 0; -4`')
  })
})
