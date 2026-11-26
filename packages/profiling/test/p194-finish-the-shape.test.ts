import { describe, expect, test } from 'vitest'
import { MIRROR_BULLET, primaryAnswerBlock, pictureBullet } from '../src/ai/primary-answers'
import { makeClassContext } from '../src/ai/subject-profile'
import { finishAnswer } from '../src/logic/meaning'
import { mirrorKey, mirrorSquare, shadeKeyProblem, shadeProblem } from '../src/logic/answers/shade'
import type { Question, ShadeSpec } from '../src/schemas/lesson'
import { PrimaryExtraQuestionSchema } from '../src/schemas/primary-extra'
import { answerProblem } from '../src/tools/save/save-lesson'

// P194: a shape to finish, from the "Shapes and position" board ("Finish the shape so the dashed line is a line of symmetry."): a grid with a dashed mirror line and
// some squares shaded already. The learner taps squares to shade them, and the key is the squares that finish the shape, in any order. No database, no network,
// no model.

const klass = (grade: number, country = 'ZA') => makeClassContext({ classId: 'c', subject: 'Mathematics', grade, country })

const SHAPE: ShadeSpec = { shape: 'grid', rows: 6, cols: 8, mirror: 'vertical', given: [3, 10, 11, 17, 18, 19, 21, 25, 33] }
const KEY = '6; 14; 15; 20; 22; 23; 24; 32; 40'

const question = (over: Partial<Question> = {}): Question => ({
  prompt: 'Finish the shape so the dashed line is a line of symmetry.',
  render: 'text',
  answer: KEY,
  answerKind: 'list',
  shade: SHAPE,
  difficulty: 2,
  why: 'Each square has a twin the same distance from the line on the other side.',
  rightWay: 'Shade the mirror image of every gold square.',
  ...over,
})

describe('the squares of a shape to finish', () => {
  test('a square and its mirror image, down the middle or across it', () => {
    expect(mirrorSquare(SHAPE, 3)).toBe(6)
    expect(mirrorSquare(SHAPE, 21)).toBe(20)
    expect(mirrorSquare({ ...SHAPE, mirror: 'horizontal' }, 3)).toBe(43)
    expect(mirrorKey(SHAPE).join('; ')).toBe(KEY)
  })

  test('a shape that makes sense, and the ones that do not', () => {
    expect(shadeProblem(SHAPE)).toBeNull()
    expect(shadeProblem({ ...SHAPE, shape: 'bar', parts: 8 })).toContain('is a grid')
    expect(shadeProblem({ ...SHAPE, cols: 7 })).toContain('even number')
    expect(shadeProblem({ ...SHAPE, mirror: 'horizontal', rows: 5 })).toContain('even number')
    expect(shadeProblem({ ...SHAPE, given: [] })).toContain('squares of the grid')
    expect(shadeProblem({ ...SHAPE, given: [3, 3] })).toContain('named once')
    expect(shadeProblem({ ...SHAPE, given: [99] })).toContain('squares of the grid')
    // A shape that is finished already has nothing left to shade.
    expect(shadeProblem({ ...SHAPE, given: [3, 6] })).toContain('at least one square')
    expect(shadeProblem({ shape: 'grid', rows: 2, cols: 2, given: [1] })).toContain('only a shape to finish')
  })

  test('the key is every square that finishes it, in any order, and nothing more', () => {
    expect(shadeKeyProblem({ answer: KEY, answerKind: 'list', shade: SHAPE })).toBeNull()
    expect(shadeKeyProblem({ answer: '40; 32; 24; 23; 22; 20; 15; 14; 6', answerKind: 'list', shade: SHAPE })).toBeNull()
    expect(shadeKeyProblem({ answer: '6; 14', answerKind: 'list', shade: SHAPE })).toContain(KEY)
    expect(shadeKeyProblem({ answer: '9', answerKind: 'whole', shade: SHAPE })).toContain('list answer')
    expect(shadeKeyProblem({ answer: KEY, answerKind: 'list', shade: SHAPE, ordered: true })).toContain('any order')
  })
})

describe('the save gate and the marking', () => {
  test('a question of Grades 1 to 6 may carry one, and the gate takes a good one', () => {
    expect(PrimaryExtraQuestionSchema.safeParse(question()).success).toBe(true)
    expect(answerProblem(question())).toBeNull()
    expect(answerProblem(question({ answer: '6; 14; 15' }))).toContain('shade:')
    expect(answerProblem(question({ diagram: { kind: 'fraction_bar', rows: [{ parts: 2, shaded: 1 }] } }))).toContain('no choices')
  })

  test('the squares the learner shades are marked in any order', () => {
    expect(finishAnswer(question(), KEY).correct).toBe(true)
    expect(finishAnswer(question(), '40; 32; 24; 23; 22; 20; 15; 14; 6').correct).toBe(true)
    expect(finishAnswer(question(), '6; 14; 15; 20; 22; 23; 24; 32').correct).toBe(false)
    expect(finishAnswer(question(), `${KEY}; 48`).correct).toBe(false)
  })
})

describe('the lesson writer', () => {
  test('a symmetry topic is told how to ask for a shape to finish', () => {
    expect(primaryAnswerBlock('symmetry', klass(4))).toBe(`${pictureBullet('symmetry', klass(4))}\n${MIRROR_BULLET}`)
    expect(MIRROR_BULLET).toContain('`mirror`')
    expect(MIRROR_BULLET).toContain('`given`')
    expect(MIRROR_BULLET).not.toContain(String.fromCharCode(0x2014))
  })
})
