import { describe, expect, test } from 'vitest'
import { groupsBullet, primaryAnswerBlock } from '../src/ai/primary-answers'
import { makeClassContext } from '../src/ai/subject-profile'
import { groupsAnswer, groupsKeyProblem, groupsOf, groupsProblem, groupsText, tidyGroups } from '../src/logic/answers/groups'
import { finishAnswer } from '../src/logic/meaning'
import type { GroupsSpec, Question } from '../src/schemas/lesson'
import { PrimaryExtraQuestionSchema } from '../src/schemas/primary-extra'
import { answerProblem } from '../src/tools/save/save-lesson'

// P170: things the learner sorts into groups (the "Drag into groups" board). The key is the group of each thing, as a number from 1, in the order of the things,
// so the list marking marks each one. No database, no network, no model.

const klass = (grade: number) => makeClassContext({ classId: 'c', subject: 'Mathematics', grade, country: 'ZA' })
const oddEven: GroupsSpec = { names: ['Odd', 'Even'], items: ['12', '7', '15', '20', '9', '4'] }
const question = (over: Partial<Question> = {}): Question => ({
  prompt: 'Drag each number into its group.',
  render: 'text',
  answer: '2; 1; 1; 2; 1; 2',
  answerKind: 'list',
  groups: oddEven,
  difficulty: 1,
  why: 'Even numbers end in 0, 2, 4, 6 or 8.',
  rightWay: 'Look at the last digit of each number.',
  ...over,
})

describe('groups', () => {
  test.each([
    ['one group', { names: ['Odd'], items: ['1', '2', '3'] }, '2 to 4 groups'],
    ['two groups with one name', { names: ['Odd', 'odd'], items: ['1', '2', '3'] }, 'its own name'],
    ['two things', { names: ['Odd', 'Even'], items: ['1', '2'] }, '3 to 8 things'],
    ['a thing twice', { names: ['Odd', 'Even'], items: ['1', '2', '2'] }, 'there once'],
    ['a long thing', { names: ['Odd', 'Even'], items: ['1', '2', 'a very long word'] }, '1 to 12 characters'],
  ] as [string, GroupsSpec, string][])('%s is refused', (_name, g, why) => {
    expect(groupsProblem(g)).toContain(why)
    expect(answerProblem(question({ groups: g }))).toContain('groups:')
  })

  test('the key is the group of each thing, and every group is used', () => {
    expect(groupsKeyProblem({ answer: '2; 1; 1; 2; 1; 2', answerKind: 'list', groups: oddEven })).toBeNull()
    expect(groupsKeyProblem({ answer: '2; 1; 1', answerKind: 'list', groups: oddEven })).toContain('3 groups for 6 things')
    expect(groupsKeyProblem({ answer: '2; 1; 3; 2; 1; 2', answerKind: 'list', groups: oddEven })).toContain('from 1 to 2')
    expect(groupsKeyProblem({ answer: '1; 1; 1; 1; 1; 1', answerKind: 'list', groups: oddEven })).toContain('every group')
    expect(groupsKeyProblem({ answer: '2', answerKind: 'whole', groups: oddEven })).toContain('list answer')
    expect(answerProblem(question())).toBeNull()
    expect(PrimaryExtraQuestionSchema.safeParse(question()).success).toBe(true)
  })

  test('saved as an ordered list with the name of each thing, and marked thing by thing', () => {
    const q = tidyGroups(question())
    expect(q).toMatchObject({ ordered: true, labels: ['12', '7', '15', '20', '9', '4'] })
    expect(finishAnswer(q, '2; 1; 1; 2; 1; 2').correct).toBe(true)
    expect(finishAnswer(q, '2; 1; 1; 2; 2; 2').correct).toBe(false)
    expect(groupsOf('2; 1', oddEven)).toEqual([2, 1])
    expect(groupsAnswer([1, 0, null])).toBe('')
    expect(groupsAnswer([1, 0, 0])).toBe('2; 1; 1')
    expect(groupsText(oddEven, [2, 1, 1, 2, 2, 2])).toBe('Odd: 7 and 15. Even: 12, 20, 9 and 4.')
  })

  test('the lesson writer is told about groups for counting, shapes, multiplication and young data topics', () => {
    expect(primaryAnswerBlock('numbers', klass(2))).toContain(groupsBullet('numbers'))
    expect(primaryAnswerBlock('shapes', klass(4))).toContain('"3 sides"')
    expect(primaryAnswerBlock('multiply', klass(3))).toContain('times table')
    expect(primaryAnswerBlock('data', klass(1))).toContain('"Fruit"')
    expect(primaryAnswerBlock('data', klass(5))).not.toContain('`groups`')
    expect(groupsBullet('numbers')).not.toContain(String.fromCharCode(0x2014))
  })
})
