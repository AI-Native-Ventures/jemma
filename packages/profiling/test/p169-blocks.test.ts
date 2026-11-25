import { describe, expect, test } from 'vitest'
import { primaryAnswerBlock } from '../src/ai/primary-answers'
import { makeClassContext } from '../src/ai/subject-profile'
import { blockPlaces, blocksKeyProblem, blocksNumber, blocksOf, blocksProblem } from '../src/logic/answers/blocks'
import { finishAnswer } from '../src/logic/meaning'
import type { Question } from '../src/schemas/lesson'
import { PrimaryExtraQuestionSchema } from '../src/schemas/primary-extra'
import { answerProblem } from '../src/tools/save/save-lesson'

// P169: a number the learner builds with place value blocks (the "Build with pieces" board): rods of ten and single ones (and flats of a hundred) on a mat, at
// most 9 of each, so a number has one way to be built. Marked as a whole number. Asked of a Grade 1 to 3 place value topic. No database, no network, no model.

const klass = (grade: number) => makeClassContext({ classId: 'c', subject: 'Mathematics', grade, country: 'ZA' })
const question = (over: Partial<Question> = {}): Question => ({
  prompt: 'Make 34 with tens and ones.',
  render: 'text',
  answer: '34',
  answerKind: 'whole',
  blocks: { places: ['tens', 'ones'] },
  difficulty: 1,
  why: '34 is 3 tens and 4 ones. The first digit tells you the tens.',
  rightWay: 'Put 3 tens on the mat, then 4 ones: 10, 20, 30, 31, 32, 33, 34.',
  ...over,
})

describe('the blocks', () => {
  test('a number is its digits: hundreds, tens and ones', () => {
    expect(blocksOf(34)).toEqual({ hundreds: 0, tens: 3, ones: 4 })
    expect(blocksOf(307)).toEqual({ hundreds: 3, tens: 0, ones: 7 })
    expect(blocksOf(1000)).toBeNull()
    expect(blocksNumber({ tens: 3, ones: 4 })).toBe(34)
    expect(blocksNumber({ hundreds: 2, tens: 0, ones: 5 })).toBe(205)
    expect(blockPlaces({ places: ['ones', 'hundreds', 'tens'] })).toEqual(['hundreds', 'tens', 'ones'])
  })

  test('a key must be built with the blocks the learner has', () => {
    expect(blocksKeyProblem({ answer: '34', answerKind: 'whole', blocks: { places: ['tens', 'ones'] } })).toBeNull()
    expect(blocksKeyProblem({ answer: '300', answerKind: 'whole', blocks: { places: ['hundreds'] } })).toBeNull()
    expect(blocksKeyProblem({ answer: '134', answerKind: 'whole', blocks: { places: ['tens', 'ones'] } })).toContain('needs hundreds')
    expect(blocksKeyProblem({ answer: '34', answerKind: 'whole', blocks: { places: ['tens'] } })).toContain('needs ones')
    expect(blocksKeyProblem({ answer: '0', answerKind: 'whole', blocks: { places: ['ones'] } })).toContain('1 to 999')
    expect(blocksKeyProblem({ answer: '34', answerKind: 'decimal', blocks: { places: ['tens', 'ones'] } })).toContain('whole answer')
    expect(blocksProblem({ places: [] })).toContain('places')
    expect(blocksProblem({ places: ['tens', 'tens'] })).toContain('once')
  })

  test('the save gate keeps a good question and refuses a bad one', () => {
    expect(PrimaryExtraQuestionSchema.safeParse(question()).success).toBe(true)
    expect(answerProblem(question())).toBeNull()
    expect(answerProblem(question({ answer: '134' }))).toContain('blocks:')
    expect(answerProblem(question({ columns: { op: '+', numbers: ['30', '4'] } }))).toContain('blocks:')
  })

  test('the number built is marked as a whole number always was', () => {
    expect(finishAnswer(question(), '34').correct).toBe(true)
    expect(finishAnswer(question(), '43').correct).toBe(false)
  })
})

describe('the lesson writer', () => {
  test('a place value topic of Grades 1 to 3 is told about blocks; Grades 4 to 6 are not', () => {
    expect(primaryAnswerBlock('place', klass(2))).toContain('- `blocks`: the learner builds a number with place value blocks')
    expect(primaryAnswerBlock('place', klass(4))).not.toContain('`blocks`')
    expect(primaryAnswerBlock('place', klass(2))).not.toContain(String.fromCharCode(0x2014))
  })
})
