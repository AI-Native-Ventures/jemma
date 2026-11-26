import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { renderPrompt } from '../src/ai/prompt-variants'
import { makeClassContext } from '../src/ai/subject-profile'
import { graphMatchKeyProblem, graphMatchProblem, graphY, prettyEquation, tidyGraphMatch } from '../src/logic/answers/graph-match'
import { degreeGraphOf, finishAnswer, graphEquationOf } from '../src/logic/meaning'
import { pictureProblem } from '../src/logic/picture'
import { SeniorQuestionSchema, type GraphMatchSpec, type Question } from '../src/schemas/lesson'
import { answerProblem } from '../src/tools/save/save-lesson'

// P184: graphs the learner matches to their equations (the "Match pairs" board, "later graphs and their equations"). The answer is a list of equations, marked as
// a list always was; the key is checked against the graphs. Senior classes only. No database, no network, no model.

const PROMPT = readFileSync(new URL('../src/jobs/write_lesson.md', import.meta.url), 'utf8')
const three: GraphMatchSpec = {
  xMin: -5,
  xMax: 5,
  yMin: -5,
  yMax: 5,
  graphs: [{ type: 'parabola', a: 1, q: -4 }, { type: 'line', m: 2, c: 1 }, { type: 'hyperbola', a: 2, q: 1 }],
  equations: ['y = 2x + 1', 'y = 2/x + 1', 'y = x^2 - 4'],
}
const question = (over: Partial<Question> = {}): Question => ({
  prompt: 'Match each graph to its equation.',
  render: 'text',
  steps: ['A parabola has x²', 'A hyperbola has x at the bottom'],
  answer: '3; 1; 2',
  answerKind: 'list',
  graphMatch: three,
  difficulty: 2,
  why: 'The shape tells the kind of graph.',
  rightWay: 'Look for x², x on its own, and x at the bottom of a fraction.',
  ...over,
})
const key = (answer: string, graphMatch = three) => graphMatchKeyProblem({ answer, answerKind: 'list', graphMatch }, graphEquationOf, degreeGraphOf)

describe('graphs matched to their equations', () => {
  test('a good match passes; the senior schema takes it', () => {
    expect(graphMatchProblem(three, pictureProblem)).toBeNull()
    expect(answerProblem(question())).toBeNull()
    expect(SeniorQuestionSchema.safeParse(question()).success).toBe(true)
  })

  test('a graph is worked out as the plane draws it', () => {
    expect(graphY({ type: 'parabola', a: 1, q: -4 }, 2)).toBe(0)
    expect(Number.isNaN(graphY({ type: 'hyperbola', a: 2, q: 1 }, 0))).toBe(true)
    expect(graphY({ type: 'trig', fn: 'sin', a: 2 }, 90)).toBeCloseTo(2, 9)
    expect(graphY({ type: 'exponential', a: 1, b: 2 }, 3)).toBe(8)
  })

  test('graphs that cannot be shown together are refused', () => {
    expect(graphMatchProblem({ ...three, graphs: three.graphs.slice(0, 1), equations: ['y = x^2 - 4'] }, pictureProblem)).toContain('2 to 4 graphs')
    expect(graphMatchProblem({ ...three, equations: ['y = 2x + 1', 'y = 2/x + 1'] }, pictureProblem)).toContain('as many equations')
    expect(graphMatchProblem({ ...three, equations: ['y = 2x + 1', 'y = 2x + 1', 'y = x^2 - 4'] }, pictureProblem)).toContain('there once')
    expect(graphMatchProblem({ ...three, graphs: [three.graphs[0]!, { type: 'trig', fn: 'sin' }, three.graphs[2]!] }, pictureProblem)).toContain('all trig graphs or none')
  })

  test('the key is checked against the graphs: each equation fits its graph and no other', () => {
    expect(key('3; 1; 2')).toBeNull()
    expect(key('3; 2; 1')).toContain('equation 2 is not the equation of graph 2')
    expect(key('1; 2; 3')).toContain('mix up the equations')
    expect(key('3; 3; 1')).toContain('the equation of one graph')
    expect(key('3; 1; 2', { ...three, equations: ['y = 2x + 1', 'two over x', 'y = x^2 - 4'] })).toContain('equation 2 cannot be read')
    expect(key('2; 1', { xMin: 0, xMax: 360, yMin: -3, yMax: 3, graphs: [{ type: 'trig', fn: 'sin', a: 2 }, { type: 'trig', fn: 'cos' }], equations: ['y = cos x', 'y = 2 sin x'] })).toBeNull()
    expect(answerProblem(question({ answer: '3; 2; 1' }))).toContain('graphMatch:')
  })

  test('each pair is marked: the list is ordered, with Graph 1 and so on over its boxes', () => {
    const q = tidyGraphMatch(question())
    expect(q).toMatchObject({ ordered: true, labels: ['Graph 1', 'Graph 2', 'Graph 3'] })
    expect(finishAnswer(q, '3; 1; 2').correct).toBe(true)
    expect(finishAnswer(q, '3; 2; 1').correct).toBe(false)
    expect(prettyEquation('y = -x^2 + 4')).toBe('y = −x² + 4')
  })

  test('the senior writer is told how to ask for it', () => {
    const text = renderPrompt('write_lesson', PROMPT, makeClassContext({ classId: 'c', subject: 'Mathematics', grade: 10, country: 'ZA' }))
    expect(text).toContain('To have the learner match graphs to their equations')
    expect(text).toContain('`graphMatch`')
  })
})
