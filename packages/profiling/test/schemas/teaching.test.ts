import { describe, expect, test } from 'vitest'
import { libraryKey, TeachingLessonSchema, type TeachingBlock, type TeachingLesson } from '../../src/schemas/teaching'

// P141 and P144: the shape of one teaching lesson, and the name a library entry is stored under. No database, no model.

const question = (n: number) => ({
  prompt: `Question ${n}: what is 1/2 + 1/4?`,
  render: 'text' as const,
  answer: '3/4',
  answerKind: 'fraction' as const,
  difficulty: 1 as const,
  why: 'Halves become quarters.',
  rightWay: '1/2 is 2/4, and 2/4 + 1/4 = 3/4.',
})

const explain = (n: number): TeachingBlock => ({ kind: 'explain', text: `Part ${n} of the idea.`, speech: `Part ${n} of the idea.` })
const worked = (n: number): TeachingBlock => ({
  kind: 'worked',
  problem: `Worked example ${n}`,
  steps: [
    { line: '1/2 = 2/4', reason: 'Same bottom number.' },
    { line: '2/4 + 1/4 = 3/4', reason: 'Add the tops.' },
  ],
  answer: '3/4',
  answerKind: 'fraction',
  speech: 'One half is two quarters. Two quarters and one quarter make three quarters.',
})
const tryBlock: TeachingBlock = { kind: 'try', question: question(0), hint: 'Make the bottoms the same.', speech: 'Now you try.' }
const mistake: TeachingBlock = { kind: 'mistake', wrong: '1/2 + 1/4 = 2/6', right: '1/2 + 1/4 = 3/4', why: 'Never add the bottoms.', speech: 'Do not add the bottom numbers.' }

const lesson = (blocks: TeachingBlock[]): TeachingLesson => ({
  position: 1,
  title: 'Adding fractions',
  minutes: 12,
  objectives: ['You will be able to add fractions.', 'You will be able to find a common bottom number.'],
  keyWords: [{ word: 'denominator', meaning: 'The bottom number of a fraction.' }],
  blocks,
  summary: ['Make the bottoms the same.', 'Add the tops.', 'Keep the bottom.'],
  practice: [1, 2, 3, 4, 5].map(question),
})

const eight = [explain(1), explain(2), worked(1), worked(2), worked(3), explain(3), explain(4)]

describe('TeachingLessonSchema', () => {
  test('a lesson with one try block and one mistake block parses', () => {
    expect(TeachingLessonSchema.safeParse(lesson([...eight, tryBlock, mistake])).success).toBe(true)
  })

  test('a lesson without a try block fails with "needs at least one try block"', () => {
    const result = TeachingLessonSchema.safeParse(lesson([...eight, explain(5), mistake]))
    expect(result.success).toBe(false)
    expect(result.error?.issues.map((i) => i.message)).toContain('needs at least one try block')
  })

  test('a lesson without a mistake block fails with "needs at least one mistake block"', () => {
    const result = TeachingLessonSchema.safeParse(lesson([...eight, explain(5), tryBlock]))
    expect(result.success).toBe(false)
    expect(result.error?.issues.map((i) => i.message)).toContain('needs at least one mistake block')
  })
})

describe('libraryKey', () => {
  test('takes the " (Term N)" off the end of a CAPS name', () => {
    expect(libraryKey('Common fractions (Term 4)')).toBe('Common fractions')
    expect(libraryKey('Common fractions')).toBe('Common fractions')
  })
})
