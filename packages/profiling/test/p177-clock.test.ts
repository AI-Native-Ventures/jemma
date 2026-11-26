import { describe, expect, test } from 'vitest'
import { clockBullet, primaryAnswerBlock } from '../src/ai/primary-answers'
import { makeClassContext } from '../src/ai/subject-profile'
import { clockAnswer, clockKeyProblem, clockOf, clockProblem, clockWords, handAngles, hourAt, markClock, minuteAt } from '../src/logic/answers/clock'
import { finishAnswer } from '../src/logic/meaning'
import { type Question } from '../src/schemas/lesson'
import { PrimaryExtraQuestionSchema } from '../src/schemas/primary-extra'
import { answerProblem } from '../src/tools/save/save-lesson'

// P177: a clock the learner sets by dragging its hands (the "Move the clock hands" board). The answer is a time, so it is marked as a time always was, on a
// clock face of 12 hours. Grades 1 to 6, never the baseline class. No database, no network, no model.

const klass = (grade: number, country = 'ZA') => makeClassContext({ classId: 'c', subject: 'Mathematics', grade, country })
const question = (over: Partial<Question> = {}): Question => ({
  prompt: 'Show half past 4 on the clock.',
  render: 'text',
  answer: '4:30',
  answerKind: 'time',
  clock: { step: 30 },
  difficulty: 1,
  why: 'At half past 4, the short hand has gone past 4 but not yet reached 5.',
  rightWay: 'Long hand on 6 for half past. Short hand halfway between 4 and 5.',
  ...over,
})

describe('a clock to set', () => {
  test('a good clock passes; the primary lesson takes it', () => {
    expect(clockProblem({ step: 30 })).toBeNull()
    expect(clockProblem({})).toBeNull()
    expect(answerProblem(question())).toBeNull()
    expect(PrimaryExtraQuestionSchema.safeParse(question()).success).toBe(true)
  })

  test('a clock it cannot show is refused', () => {
    expect(clockProblem({ step: 10 })).toContain('every 1, 5, 15, 30 minutes')
    const key = (answer: string, step = 30, answerKind = 'time') => clockKeyProblem({ answer, answerKind, clock: { step } })
    expect(key('4:30 pm')).toContain('no am or pm')
    expect(key('16:30')).toContain('from 1:00 to 12:59')
    expect(key('0:30')).toContain('from 1:00 to 12:59')
    expect(key('4:15')).toContain('a multiple of 30')
    expect(key('4:15', 15)).toBeNull()
    expect(key('12:00')).toContain('starts at 12:00')
    expect(key('12:30')).toBeNull()
    expect(key('2 h')).toContain('written like 4:30')
    expect(key('4', 30, 'whole')).toContain('a time answer')
    expect(answerProblem(question({ answer: '12:00' }))).toContain('clock:')
    expect(answerProblem(question({ choices: ['4:30', '5:30'] }))).toContain('clock:')
  })

  test('the time on the face is right, twelve hours apart or not', () => {
    const q = question()
    expect(finishAnswer(q, '4:30').correct).toBe(true)
    expect(finishAnswer(q, '16:30').correct).toBe(true)
    expect(finishAnswer(q, '4:30 pm').correct).toBe(true)
    expect(finishAnswer(q, '5:30').correct).toBe(false)
    expect(finishAnswer(q, '4:00').correct).toBe(false)
    expect(markClock('4:30', 'half past 4')).toEqual({ correct: false, comparable: false })
    expect(markClock('4:30', '2 h')).toEqual({ correct: false, comparable: false })
    expect(clockOf('16:30')).toEqual({ hour: 4, minute: 30 })
    expect(clockOf('0:15')).toEqual({ hour: 12, minute: 15 })
  })

  test('a time is said the way it is said', () => {
    expect(clockWords({ hour: 4, minute: 30 })).toBe('half past 4')
    expect(clockWords({ hour: 7, minute: 0 })).toBe("7 o'clock")
    expect(clockWords({ hour: 3, minute: 15 })).toBe('quarter past 3')
    expect(clockWords({ hour: 12, minute: 45 })).toBe('quarter to 1')
    expect(clockWords({ hour: 8, minute: 35 })).toBe('25 to 9')
    expect(clockWords({ hour: 8, minute: 20 })).toBe('20 past 8')
    expect(clockWords({ hour: 8, minute: 13 })).toBe('13 minutes past 8')
    expect(clockWords({ hour: 8, minute: 59 })).toBe('1 minute to 9')
    expect(clockAnswer({ hour: 9, minute: 5 })).toBe('9:05')
  })

  test('the hands: the short hand sits between the numbers as far as the minutes have gone; a drag stops on the stops', () => {
    expect(handAngles({ hour: 4, minute: 30 })).toEqual({ hour: 135, minute: 180 })
    expect(handAngles({ hour: 12, minute: 0 })).toEqual({ hour: 0, minute: 0 })
    expect(minuteAt(178, 5)).toBe(30)
    expect(minuteAt(178, 30)).toBe(30)
    expect(minuteAt(100, 30)).toBe(30)
    expect(minuteAt(80, 30)).toBe(0)
    expect(minuteAt(357, 1)).toBe(0)
    expect(minuteAt(-90, 5)).toBe(45)
    expect(hourAt(131, 30)).toBe(4)
    expect(hourAt(5, 0)).toBe(12)
    expect(hourAt(-25, 0)).toBe(11)
  })

  test('the time lesson writer is told of the clock, simply for Grades 1 to 3; the baseline class is asked as before', () => {
    expect(primaryAnswerBlock('time', klass(2))).toContain(clockBullet(klass(2)))
    expect(clockBullet(klass(2))).toContain('`step` `30`')
    expect(clockBullet(klass(4))).toContain('`step` `5`')
    expect(primaryAnswerBlock('time', klass(5, 'US'))).toContain('- `clock`:')
    const baseline = primaryAnswerBlock('time', klass(6))
    expect(baseline).not.toContain('`clock`')
    expect(baseline).toContain('- There is no clock picture, so never ask the learner to read a clock face.')
    for (const grade of [1, 3, 4, 6]) expect(primaryAnswerBlock('time', klass(grade))).not.toContain(String.fromCharCode(0x2014))
  })
})
