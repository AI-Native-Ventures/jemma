import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { renderPrompt } from '../src/ai/prompt-variants'
import { makeClassContext } from '../src/ai/subject-profile'
import { readNumber } from '../src/logic/meaning'
import { plotAnswer, plotKeyProblem, plotPoints, plotProblem, tidyPlot } from '../src/logic/answers/plot'
import { finishAnswer } from '../src/logic/meaning'
import { SeniorQuestionSchema, type PlotSpec, type Question } from '../src/schemas/lesson'
import { PrimaryExtraQuestionSchema } from '../src/schemas/primary-extra'
import { answerProblem } from '../src/tools/save/save-lesson'

// P171: points the learner places on a grid by tapping it (the "Plot points on a grid" board): a reflection, a translation, points from a table. The key is
// the x and the y of each point, in order, marked number by number. Senior classes only. No database, no network, no model.

const PROMPT = readFileSync(new URL('../src/jobs/write_lesson.md', import.meta.url), 'utf8')
const reflect: PlotSpec = {
  xMin: -5,
  xMax: 5,
  yMin: -1,
  yMax: 5,
  given: [{ x: -4, y: 1, label: 'A' }, { x: -1, y: 1, label: 'B' }, { x: -1, y: 4, label: 'C' }],
  shape: true,
  place: ["A'", "B'", "C'"],
}
const question = (over: Partial<Question> = {}): Question => ({
  prompt: "Reflect triangle ABC in the y-axis. Tap where A', B' and C' go.",
  render: 'text',
  steps: ['(x; y) → (−x; y)', "A'(4; 1), B'(1; 1), C'(1; 4)"],
  answer: '4; 1; 1; 1; 1; 4',
  answerKind: 'list',
  plot: reflect,
  difficulty: 2,
  why: 'y stays the same and x changes sign.',
  rightWay: 'Count the squares to the y-axis, then the same on the other side.',
  ...over,
})

describe('a grid to place points on', () => {
  test('a good one passes, and the senior schema takes it; a Grade 1 to 6 lesson is not asked for it', () => {
    expect(plotProblem(reflect)).toBeNull()
    expect(answerProblem(question())).toBeNull()
    expect(SeniorQuestionSchema.safeParse(question()).success).toBe(true)
    expect(Object.keys(PrimaryExtraQuestionSchema.shape)).not.toContain('plot')
  })

  test.each([
    ['half steps', { ...reflect, xMax: 5.5 }, 'whole steps'],
    ['a grid backwards', { ...reflect, xMin: 5, xMax: -5 }, 'xMin below xMax'],
    ['too wide', { ...reflect, xMin: -15, xMax: 15 }, 'at most 20'],
    ['five points to place', { ...reflect, place: ['A', 'B', 'C', 'D', 'E'] }, '1 to 4 points'],
    ['a given point off the grid', { ...reflect, given: [{ x: 9, y: 1, label: 'A' }] }, 'on a corner'],
    ['a shape of two points', { ...reflect, given: [{ x: 1, y: 1, label: 'A' }, { x: 2, y: 2, label: 'B' }] }, '3 or more'],
  ] as [string, PlotSpec, string][])('%s is refused', (_name, p, why) => {
    expect(plotProblem(p)).toContain(why)
    expect(answerProblem(question({ plot: p }))).toContain('plot:')
  })

  test('the key is a point on the grid for each point to place', () => {
    expect(plotKeyProblem({ answer: '4; 1; 1; 1', answerKind: 'list', plot: reflect }, readNumber)).toContain('2 points for 3')
    expect(plotKeyProblem({ answer: '4; 1; 1; 1; 1', answerKind: 'list', plot: reflect }, readNumber)).toContain('the x and the y')
    expect(plotKeyProblem({ answer: '4; 1; 1; 1; 1; 9', answerKind: 'list', plot: reflect }, readNumber)).toContain('on a corner')
    expect(plotKeyProblem({ answer: '(4; 1)', answerKind: 'point', plot: reflect }, readNumber)).toContain('list answer')
    expect(plotPoints('4; 1; -1; 4', readNumber)).toEqual([{ x: 4, y: 1 }, { x: -1, y: 4 }])
    expect(plotAnswer([{ x: 4, y: 1 }, null])).toBe('')
    expect(plotAnswer([{ x: 4, y: 1 }, { x: -1, y: 4 }])).toBe('4; 1; -1; 4')
  })

  test('saved as an ordered list with a name over each box, and marked number by number', () => {
    const q = tidyPlot(question())
    expect(q.labels).toEqual(["A' x", "A' y", "B' x", "B' y", "C' x", "C' y"])
    expect(finishAnswer(q, '4; 1; 1; 1; 1; 4').correct).toBe(true)
    expect(finishAnswer(q, '4; 1; 1; 1; 2; 4').correct).toBe(false)
  })

  test('the senior writer is told how to ask for it', () => {
    const text = renderPrompt('write_lesson', PROMPT, makeClassContext({ classId: 'c', subject: 'Mathematics', grade: 8, country: 'ZA' }))
    expect(text).toContain('To have the learner place points on a grid by tapping it')
    expect(text).toContain('`4; 1; 1; 1; 1; 4`')
    const primary = renderPrompt('write_lesson', PROMPT, makeClassContext({ classId: 'c', subject: 'Mathematics', grade: 5, country: 'ZA' }))
    expect(primary).not.toContain('`plot`')
  })
})
