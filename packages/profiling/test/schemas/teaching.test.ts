import { describe, expect, test } from 'vitest'
import { TeachingLessonSchema, libraryKey, type TeachingLesson } from '../../src/schemas/teaching'

const question = (n: number) => ({
  prompt: `What is ${n} + 1?`,
  render: 'text' as const,
  answer: String(n + 1),
  answerKind: 'whole' as const,
  difficulty: 1 as const,
  why: 'Add one.',
  rightWay: 'Count on one more.',
})

const explain = { kind: 'explain' as const, text: 'A fraction names equal parts of a whole.', speech: 'A fraction names equal parts of a whole.' }
const worked = (n: number) => ({
  kind: 'worked' as const,
  problem: `What is ${n} + 1?`,
  steps: [
    { line: `${n} + 1`, reason: 'Start with the sum.' },
    { line: `${n + 1}`, reason: 'Add one.' },
  ],
  answer: String(n + 1),
  answerKind: 'whole' as const,
  speech: `Add one to ${n}.`,
})
const tryBlock = { kind: 'try' as const, question: question(4), hint: 'Count on.', speech: 'Now you try.' }
const mistake = { kind: 'mistake' as const, wrong: '2 + 1 = 4', right: '2 + 1 = 3', why: 'Count on one, not two.', speech: 'Watch out.' }

const lesson = (blocks: TeachingLesson['blocks']): TeachingLesson => ({
  position: 1,
  title: 'Adding one',
  minutes: 10,
  objectives: ['You will be able to add one.', 'You will be able to count on.'],
  keyWords: [],
  blocks,
  summary: ['Add one by counting on.', 'Check your answer.', 'Practise often.'],
  practice: [1, 2, 3, 4, 5].map(question),
})

const base = [explain, explain, worked(1), worked(2), worked(3), explain, explain]

describe('TeachingLessonSchema', () => {
  test('a lesson with one try and one mistake block parses', () => {
    expect(TeachingLessonSchema.safeParse(lesson([...base, tryBlock, mistake])).success).toBe(true)
  })

  test('a lesson without a try block fails with the reason', () => {
    const result = TeachingLessonSchema.safeParse(lesson([...base, mistake, explain]))
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues.map((i) => i.message)).toContain('needs at least one try block')
  })

  test('a lesson without a mistake block fails with the reason', () => {
    const result = TeachingLessonSchema.safeParse(lesson([...base, tryBlock, explain]))
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues.map((i) => i.message)).toContain('needs at least one mistake block')
  })
})

describe('libraryKey', () => {
  test('a row named with a term opens the same lessons as the plain name', () => {
    expect(libraryKey('Common fractions (Term 4)')).toBe('Common fractions')
    expect(libraryKey('Common fractions')).toBe('Common fractions')
    expect(libraryKey('Functions (term 2)')).toBe('Functions')
  })
})
