import { describe, expect, test } from 'vitest'
import { clockFaceBullet, primaryAnswerBlock } from '../src/ai/primary-answers'
import { makeClassContext } from '../src/ai/subject-profile'
import { clockFaceProblem } from '../src/logic/answers/clock'
import { finishAnswer } from '../src/logic/meaning'
import { type Question } from '../src/schemas/lesson'
import { PrimaryExtraQuestionSchema } from '../src/schemas/primary-extra'
import { answerProblem } from '../src/tools/save/save-lesson'

// P183: a clock face in a Grade 1 to 6 time question, to read ("What time does the clock show?"), drawn by the clock of P177. Its key is the time it shows,
// read on a face of 12 hours. Never the baseline class. No database, no network, no model.

const klass = (grade: number, country = 'ZA') => makeClassContext({ classId: 'c', subject: 'Mathematics', grade, country })
const question = (over: Partial<Question> = {}): Question => ({
  prompt: 'What time does the clock show?',
  render: 'text',
  answer: '4:30',
  answerKind: 'time',
  clockFace: { time: '4:30' },
  difficulty: 1,
  why: 'The long hand is on the 6 and the short hand is between the 4 and the 5.',
  rightWay: 'Long hand on the 6 is half past. The short hand has gone past the 4.',
  ...over,
})

describe('a clock face to read', () => {
  test('a good question passes; the primary lesson takes it', () => {
    expect(answerProblem(question())).toBeNull()
    expect(answerProblem(question({ answerKind: 'choice', answer: 'B', choices: ['3:30', '4:30', '5:30'] }))).toBeNull()
    expect(PrimaryExtraQuestionSchema.safeParse(question()).success).toBe(true)
  })

  test('the key is the time the face shows; a face it cannot show is refused', () => {
    const face = (over: Partial<Question>) => clockFaceProblem({ ...question(over), clockFace: over.clockFace ?? { time: '4:30' } })
    expect(face({ answer: '16:30' })).toBeNull()
    expect(face({ answer: '5:30' })).toContain('the time the clock face shows')
    expect(face({ answerKind: 'choice', answer: 'A', choices: ['3:30', '4:30'] })).toContain('right choice is the time')
    expect(face({ clockFace: { time: '16:30' }, answer: '4:30' })).toContain('from 1:00 to 12:59')
    expect(face({ clockFace: { time: 'half past 4' } })).toContain('written like 4:30')
    expect(face({ answerKind: 'whole', answer: '4' })).toContain('asks for the time it shows')
    expect(answerProblem(question({ answer: '5:30' }))).toContain('clockFace:')
    expect(answerProblem(question({ clock: { step: 30 } }))).toContain('clockFace:')
  })

  test('the time read is marked on a face of 12 hours', () => {
    const q = question()
    expect(finishAnswer(q, '4:30').correct).toBe(true)
    expect(finishAnswer(q, '16:30').correct).toBe(true)
    expect(finishAnswer(q, '4:30 pm').correct).toBe(true)
    expect(finishAnswer(q, '4:00').correct).toBe(false)
  })

  test('the time lesson writer is told of it, simply for Grades 1 to 3; the baseline class is asked as before', () => {
    expect(primaryAnswerBlock('time', klass(2))).toContain(clockFaceBullet(klass(2)))
    expect(clockFaceBullet(klass(2))).toContain("o'clock or half past")
    expect(clockFaceBullet(klass(5))).toContain('5 minute mark')
    expect(primaryAnswerBlock('time', klass(6))).not.toContain('`clockFace`')
    expect(primaryAnswerBlock('time', klass(6, 'US'))).toContain('`clockFace`')
  })
})
