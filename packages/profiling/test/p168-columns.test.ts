import { readFileSync } from 'node:fs'
import { describe, expect, test, vi } from 'vitest'
import { columnsBullet, primaryAnswerBlock, primaryKit } from '../src/ai/primary-answers'
import { makeClassContext } from '../src/ai/subject-profile'
import { columnsAnswer, columnsBoxes, columnsKeyProblem, columnsPlaces, columnsProblem, columnsResult } from '../src/logic/answers/columns'
import { finishAnswer } from '../src/logic/meaning'
import { LessonSchema, type ColumnsSpec, type Question } from '../src/schemas/lesson'
import { PrimaryExtraQuestionSchema } from '../src/schemas/primary-extra'
import { answerProblem } from '../src/tools/save/save-lesson'
import { askedFor, CHILD_INFO } from './helpers/write-lesson-world'

// P168: a sum the learner works in columns (the "Write digits in columns" board): two or three numbers added, or one taken from another, the answer written digit
// by digit from the ones. Only the answer is marked, as a whole number. Asked of a Grade 2 to 6 addition and subtraction topic. No database, no network, no model.

const state = vi.hoisted(() => ({ topic: 'Addition and subtraction' }))
vi.mock('../src/tools/read/get-child-context', () => ({
  getChildContext: { run: vi.fn(async () => ({ ...CHILD_INFO, session: { ...CHILD_INFO.session, topicName: state.topic } })) },
}))
vi.mock('../src/tools/context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/tools/context')>()),
  contextFor: async (ctx: unknown) => ctx,
}))

const PROMPT = readFileSync(new URL('../src/jobs/write_lesson.md', import.meta.url), 'utf8')
const klass = (grade: number, country = 'ZA') => makeClassContext({ classId: 'c', subject: 'Mathematics', grade, country })

const add: ColumnsSpec = { op: '+', numbers: ['347', '285'] }
const take: ColumnsSpec = { op: '-', numbers: ['503', '286'] }
const question = (over: Partial<Question> = {}): Question => ({
  prompt: 'Work out 347 + 285 in columns.',
  render: 'text',
  answer: '632',
  answerKind: 'whole',
  columns: add,
  difficulty: 2,
  why: '4 + 8 + 1 = 13 tens: write 3 and carry 1.',
  rightWay: 'Add each column from the right. Carry when a column makes 10 or more.',
  ...over,
})

describe('the sum', () => {
  test('is worked exactly on its digits', () => {
    expect(columnsResult(add)).toBe('632')
    expect(columnsResult(take)).toBe('217')
    expect(columnsResult({ op: '+', numbers: ['999999', '999999', '999999'] })).toBe('2999997')
    expect(columnsResult({ op: '-', numbers: ['286', '503'] })).toBeNull()
  })

  test('has a box for each column, and one more for an addition, so the boxes never tell the length of the answer', () => {
    expect(columnsBoxes(add)).toBe(4)
    expect(columnsBoxes({ op: '+', numbers: ['547', '485'] })).toBe(4)
    expect(columnsBoxes(take)).toBe(3)
    expect(columnsBoxes({ op: '+', numbers: ['45', '1203'] })).toBe(5)
  })

  test.each([
    ['a take away of three numbers', { op: '-', numbers: ['9', '5', '1'] }, '2 numbers'],
    ['an addition of four numbers', { op: '+', numbers: ['1', '2', '3', '4'] }, '2 to 3 numbers'],
    ['a number with a space', { op: '+', numbers: ['4 503', '286'] }, 'digits only'],
    ['a decimal', { op: '+', numbers: ['3,5', '2'] }, 'digits only'],
    ['a number with a 0 in front', { op: '+', numbers: ['0347', '285'] }, 'digits only'],
    ['seven digits', { op: '+', numbers: ['1234567', '1'] }, 'at most 6 digits'],
    ['a take away below 0', { op: '-', numbers: ['286', '503'] }, 'at least the second'],
  ] as [string, ColumnsSpec, string][])('%s is refused', (_name, c, why) => {
    expect(columnsProblem(c)).toContain(why)
    expect(answerProblem(question({ columns: c }))).toContain('columns:')
  })

  test('the key must be the true answer, as a whole number', () => {
    expect(columnsKeyProblem({ answer: '632', answerKind: 'whole', columns: add })).toBeNull()
    expect(columnsKeyProblem({ answer: '532', answerKind: 'whole', columns: add })).toContain('is 632, not 532')
    expect(columnsKeyProblem({ answer: '632', answerKind: 'decimal', columns: add })).toContain('whole answer')
    expect(answerProblem(question({ answer: '622' }))).toContain('columns:')
  })

  test('a sum in columns has no other picture, no graph and no choices', () => {
    expect(answerProblem(question({ diagram: { kind: 'place_value', columns: ['H', 'T', 'U'], digits: ['3', '4', '7'] } }))).toContain('no picture')
    expect(answerProblem(question())).toBeNull()
  })
})

describe('the answer boxes', () => {
  test('hold an answer once the ones are written and no box is empty in between', () => {
    expect(columnsAnswer(['', '6', '3', '2'])).toBe('632')
    expect(columnsAnswer(['1', '0', '3', '2'])).toBe('1032')
    expect(columnsAnswer(['', '', '', '2'])).toBe('2')
    expect(columnsAnswer(['', '6', '', '2'])).toBe('')
    expect(columnsAnswer(['', '6', '3', ''])).toBe('')
    expect(columnsAnswer(['', '', '', ''])).toBe('')
  })

  test('the answer is marked as a whole number always was', () => {
    expect(finishAnswer(question(), '632').correct).toBe(true)
    expect(finishAnswer(question(), '0632').correct).toBe(true)
    expect(finishAnswer(question(), '532').correct).toBe(false)
  })

  test('the results mark each box: the hundreds of 532 are wrong, the rest are right', () => {
    expect(columnsPlaces(add, '532')).toEqual([
      { wrote: '', right: '', ok: true },
      { wrote: '5', right: '6', ok: false },
      { wrote: '3', right: '3', ok: true },
      { wrote: '2', right: '2', ok: true },
    ])
    expect(columnsPlaces(add, '').every((p) => p.wrote === '')).toBe(true)
    expect(columnsPlaces(take, '317').map((p) => p.ok)).toEqual([false, true, true])
  })
})

describe('the lesson writer', () => {
  test('addition and subtraction has a kit of its own; counting and rounding keep theirs', () => {
    expect(primaryKit(klass(3), 'Addition and subtraction')).toBe('addsub')
    expect(primaryKit(klass(2, 'US'), 'Add and subtract within 1,000')).toBe('addsub')
    expect(primaryKit(klass(3), 'Rounding')).toBe('numbers')
    expect(primaryKit(klass(6), 'Addition and subtraction')).toBeNull()
  })

  test('from Grade 2 it is told about sums in columns; Grade 1 is not', () => {
    expect(columnsBullet(klass(1))).toBeNull()
    expect(primaryAnswerBlock('addsub', klass(1))).not.toContain('`columns`')
    expect(primaryAnswerBlock('addsub', klass(2))).toContain('2 or 3 digits')
    expect(primaryAnswerBlock('addsub', klass(5))).toContain('up to 6 digits')
    for (const grade of [2, 5]) {
      const text = primaryAnswerBlock('addsub', klass(grade))
      expect(text).toContain('`answerKind` is `whole`')
      expect(text).not.toContain(String.fromCharCode(0x2014))
    }
  })

  test('a Grade 4 addition and subtraction lesson is asked with the columns line, and a sum in columns parses', async () => {
    state.topic = 'Addition and subtraction'
    const seen = await askedFor({ subject: 'Mathematics', grade: 4, country: 'ZA', topicName: 'Addition and subtraction' }, PROMPT)
    expect(seen.system).toContain('- `columns`: the learner works a sum in columns')
    expect(PrimaryExtraQuestionSchema.safeParse(question()).success).toBe(true)
    expect(JSON.stringify(LessonSchema.shape.questions.element.shape.columns)).toBeDefined()
  })
})
