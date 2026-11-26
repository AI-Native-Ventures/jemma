import { describe, expect, test } from 'vitest'
import { matchBullet, primaryAnswerBlock, primaryKit } from '../src/ai/primary-answers'
import { makeClassContext } from '../src/ai/subject-profile'
import { matchAnswer, matchKeyProblem, matchProblem, matchText, tidyMatch } from '../src/logic/answers/match'
import { finishAnswer } from '../src/logic/meaning'
import { type MatchSpec, type Question } from '../src/schemas/lesson'
import { PrimaryExtraQuestionSchema } from '../src/schemas/primary-extra'
import { answerProblem } from '../src/tools/save/save-lesson'

// P178: things the learner matches in pairs by tapping one, then the one it goes with (the "Match pairs" board). The answer is a list of partners, marked as a
// list always was. Grades 1 to 6, never the baseline class. No database, no network, no model.

const klass = (grade: number, country = 'ZA') => makeClassContext({ classId: 'c', subject: 'Mathematics', grade, country })
const names: MatchSpec = { left: ['7', '12', '20'], right: ['twelve', 'twenty', 'seven'] }
const question = (over: Partial<Question> = {}): Question => ({
  prompt: 'Match each number to its name.',
  render: 'text',
  answer: '3; 1; 2',
  answerKind: 'list',
  match: names,
  difficulty: 1,
  why: '7 is seven, 12 is twelve and 20 is twenty.',
  rightWay: 'Read each name and find its number.',
  ...over,
})

describe('things to match in pairs', () => {
  test('a good match passes; the primary lesson takes it', () => {
    expect(matchProblem(names)).toBeNull()
    expect(matchProblem({ left: ['triangle', 'square', 'circle'], right: ['circle', 'triangle', 'square'], pictures: true })).toBeNull()
    expect(answerProblem(question())).toBeNull()
    expect(PrimaryExtraQuestionSchema.safeParse(question()).success).toBe(true)
  })

  test('a match it cannot show is refused', () => {
    expect(matchProblem({ left: ['7'], right: ['seven'] })).toContain('2 to 5 pairs')
    expect(matchProblem({ left: ['7', '12'], right: ['seven'] })).toContain('as many things on the right')
    expect(matchProblem({ left: ['7', '7'], right: ['seven', 'six'] })).toContain('there once')
    expect(matchProblem({ left: ['7', ''], right: ['seven', 'six'] })).toContain('1 to 20 characters')
    expect(matchProblem({ left: ['triangle', 'star'], right: ['star', 'triangle'], pictures: true })).toContain('a shape')
    const key = (answer: string, answerKind = 'list') => matchKeyProblem({ answer, answerKind, match: names })
    expect(key('3; 1; 2')).toBeNull()
    expect(key('1; 2; 3')).toContain('mix up the right ones')
    expect(key('3; 3; 1')).toContain('the partner of one')
    expect(key('3; 1')).toContain('2 partners for 3')
    expect(key('3; 1; 4')).toContain('from 1 to 3')
    expect(key('3', 'whole')).toContain('list answer')
    expect(answerProblem(question({ answer: '1; 2; 3' }))).toContain('match:')
    expect(answerProblem(question({ choices: ['3; 1; 2', '1; 2; 3'] }))).toContain('match:')
  })

  test('each pair is marked: the list is ordered, with each left one over its box', () => {
    const q = tidyMatch(question())
    expect(q).toMatchObject({ ordered: true, labels: ['7', '12', '20'] })
    expect(tidyMatch(question({ match: { left: ['triangle', 'square'], right: ['square', 'triangle'], pictures: true }, answer: '2; 1' })).labels).toEqual(['Shape 1', 'Shape 2'])
    expect(finishAnswer(q, '3; 1; 2').correct).toBe(true)
    expect(finishAnswer(q, '3; 2; 1').correct).toBe(false)
    expect(finishAnswer(q, '1; 2; 3').correct).toBe(false)
    expect(matchAnswer([2, 0, 1])).toBe('3; 1; 2')
    expect(matchAnswer([2, null, 1])).toBe('')
    expect(matchText(names, [3, 1, 2])).toBe('7 with seven, 12 with twelve and 20 with twenty')
    expect(matchText(names, [3, null, 1])).toBe('7 with seven and 20 with twelve')
    expect(matchText({ left: ['right_triangle', 'square'], right: ['square', 'right triangle'], pictures: true }, [2, 1])).toBe('right triangle with right triangle and square with square')
  })

  test('the lesson writer of number names, shapes and time is told of it; the baseline class is asked as before', () => {
    expect(primaryKit(klass(1), 'Number symbols and number names (Term 2)')).toBe('numbers')
    expect(primaryKit(klass(6), 'Number symbols and number names')).toBeNull()
    expect(primaryAnswerBlock('numbers', klass(1))).toContain(matchBullet('numbers', klass(1)))
    expect(primaryAnswerBlock('shapes', klass(2))).toContain('`pictures` `true`')
    expect(primaryAnswerBlock('time', klass(2))).toContain(matchBullet('time', klass(2)))
    expect(primaryAnswerBlock('time', klass(6))).not.toContain('`match`')
    expect(matchBullet('numbers', klass(2))).toContain('2 to 4 short things')
    expect(matchBullet('numbers', klass(5))).toContain('2 to 5 short things')
    expect(matchBullet('time', klass(2))).not.toContain('`diagram`')
  })
})
