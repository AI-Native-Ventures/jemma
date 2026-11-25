import { describe, expect, test } from 'vitest'
import { primaryAnswerBlock, TAP_BULLET } from '../src/ai/primary-answers'
import { makeClassContext } from '../src/ai/subject-profile'
import { finishAnswer } from '../src/logic/meaning'
import { tapAnswer, tapKeyProblem, tapPicks, tapProblem, tidyTap } from '../src/logic/answers/tap'
import type { Question, TapSpec } from '../src/schemas/lesson'
import { PrimaryExtraQuestionSchema } from '../src/schemas/primary-extra'
import { answerProblem } from '../src/tools/save/save-lesson'

// P173: shapes the learner taps to pick (the "Tap on the picture" board). The key is the numbers of the shapes to pick, in any order. No database, no network.

const klass = (grade: number) => makeClassContext({ classId: 'c', subject: 'Mathematics', grade, country: 'ZA' })
const shapes: TapSpec = {
  shapes: [
    { shape: 'triangle' }, { shape: 'square' }, { shape: 'triangle', turn: 180 }, { shape: 'circle' },
    { shape: 'rectangle' }, { shape: 'right_triangle' }, { shape: 'hexagon' }, { shape: 'triangle', turn: 90 },
  ],
}
const question = (over: Partial<Question> = {}): Question => ({
  prompt: 'Tap all the triangles.',
  render: 'text',
  answer: '1; 3; 6; 8',
  answerKind: 'list',
  tap: shapes,
  difficulty: 1,
  why: 'A triangle has 3 straight sides. Turned upside down, it is still a triangle.',
  rightWay: 'Count the sides of each shape. 3 sides means a triangle.',
  ...over,
})

describe('shapes to tap', () => {
  test('a good picture passes', () => {
    expect(tapProblem(shapes)).toBeNull()
    expect(answerProblem(question())).toBeNull()
    expect(PrimaryExtraQuestionSchema.safeParse(question()).success).toBe(true)
  })

  test.each([
    ['three shapes', { shapes: shapes.shapes.slice(0, 3) }, '4 to 9 shapes'],
    ['ten shapes', { shapes: [...shapes.shapes, { shape: 'oval' }, { shape: 'kite' }] }, '4 to 9 shapes'],
    ['a turn of 45', { shapes: [{ shape: 'square', turn: 45 }, ...shapes.shapes.slice(1)] }, '0, 90, 180 or 270'],
  ] as [string, TapSpec, string][])('%s is refused', (_name, t, why) => {
    expect(tapProblem(t)).toContain(why)
    expect(answerProblem(question({ tap: t }))).toContain('tap:')
  })

  test('the key is 2 or more of its shapes, each once, and not all of them', () => {
    expect(tapKeyProblem({ answer: '1', answerKind: 'list', tap: shapes })).toContain('at least 2')
    expect(tapKeyProblem({ answer: '1; 1', answerKind: 'list', tap: shapes })).toContain('once')
    expect(tapKeyProblem({ answer: '1; 9', answerKind: 'list', tap: shapes })).toContain('from 1 to 8')
    expect(tapKeyProblem({ answer: '1; 2; 3; 4; 5; 6; 7; 8', answerKind: 'list', tap: shapes })).toContain('not picked')
    expect(tapKeyProblem({ answer: '3', answerKind: 'whole', tap: shapes })).toContain('list answer')
    expect(tapPicks('8; 1', shapes)).toEqual([8, 1])
    expect(tapAnswer([true, false, true])).toBe('1; 3')
    expect(tapAnswer([true, false, false])).toBe('')
  })

  test('the picks are marked in any order; one missed or one too many is wrong', () => {
    const q = tidyTap(question())
    expect(q.ordered).toBe(false)
    expect(finishAnswer(q, '8; 6; 3; 1').correct).toBe(true)
    expect(finishAnswer(q, '1; 6; 8').correct).toBe(false)
    expect(finishAnswer(q, '1; 2; 3; 6; 8').correct).toBe(false)
  })

  test('a shapes topic is told how to ask for it', () => {
    expect(primaryAnswerBlock('shapes', klass(1))).toContain(TAP_BULLET)
    expect(TAP_BULLET).not.toContain(String.fromCharCode(0x2014))
  })
})
