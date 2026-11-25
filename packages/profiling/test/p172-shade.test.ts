import { describe, expect, test } from 'vitest'
import { primaryAnswerBlock, SHADE_BULLET } from '../src/ai/primary-answers'
import { makeClassContext } from '../src/ai/subject-profile'
import { finishAnswer } from '../src/logic/meaning'
import { shadeKeyProblem, shadeProblem, shadeTotal } from '../src/logic/answers/shade'
import type { Question, ShadeSpec } from '../src/schemas/lesson'
import { PrimaryExtraQuestionSchema } from '../src/schemas/primary-extra'
import { answerProblem } from '../src/tools/save/save-lesson'

// P172: parts of a shape the learner shades by tapping (the "Shade parts" board): a circle or a bar cut into equal parts, or a grid of squares. The key is how
// many parts to shade. No database, no network, no model.

const klass = (grade: number) => makeClassContext({ classId: 'c', subject: 'Mathematics', grade, country: 'ZA' })
const circle: ShadeSpec = { shape: 'circle', parts: 8 }
const question = (over: Partial<Question> = {}): Question => ({
  prompt: 'Shade 3/8 of the circle.',
  render: 'text',
  answer: '3',
  answerKind: 'whole',
  shade: circle,
  difficulty: 1,
  why: 'The 8 says the circle has 8 equal parts. The 3 says how many of them to shade.',
  rightWay: 'Count 3 parts and shade them.',
  ...over,
})

describe('a shape to shade', () => {
  test('a circle, a bar and a hundred square', () => {
    expect(shadeTotal(circle)).toBe(8)
    expect(shadeTotal({ shape: 'grid', rows: 10, cols: 10 })).toBe(100)
    for (const s of [circle, { shape: 'bar', parts: 6 }, { shape: 'grid', rows: 10, cols: 10 }] as ShadeSpec[]) expect(shadeProblem(s)).toBeNull()
    expect(answerProblem(question())).toBeNull()
    expect(PrimaryExtraQuestionSchema.safeParse(question()).success).toBe(true)
  })

  test.each([
    ['a circle of 1 part', { shape: 'circle', parts: 1 }, '2 to 12'],
    ['a bar of 20 parts', { shape: 'bar', parts: 20 }, '2 to 12'],
    ['a grid of 11 rows', { shape: 'grid', rows: 11, cols: 2 }, '1 to 10 rows'],
    ['a grid with no columns', { shape: 'grid', rows: 3 }, '1 to 10 rows'],
  ] as [string, ShadeSpec, string][])('%s is refused', (_name, s, why) => {
    expect(shadeProblem(s)).toContain(why)
    expect(answerProblem(question({ shade: s }))).toContain('shade:')
  })

  test('the key is how many parts, from 1 to all of them', () => {
    expect(shadeKeyProblem({ answer: '9', answerKind: 'whole', shade: circle })).toContain('from 1 to 8')
    expect(shadeKeyProblem({ answer: '0', answerKind: 'whole', shade: circle })).toContain('from 1 to 8')
    expect(shadeKeyProblem({ answer: '3/8', answerKind: 'fraction', shade: circle })).toContain('whole answer')
    expect(finishAnswer(question(), '3').correct).toBe(true)
    expect(finishAnswer(question(), '4').correct).toBe(false)
  })

  test('a fraction topic is told how to ask for it', () => {
    expect(primaryAnswerBlock('fractions', klass(3))).toContain(SHADE_BULLET)
    expect(SHADE_BULLET).not.toContain(String.fromCharCode(0x2014))
  })
})
