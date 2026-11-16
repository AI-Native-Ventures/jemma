import { TeachingLessonSchema, type TeachingBlock, type TeachingLesson } from '@jemma/profiling/schemas'
import { describe, expect, it } from 'vitest'
import { buildEntries, forChild, inLibrary, markLessonQuestion, questionAt, readyLessons, type LessonRow } from '../lib/teaching'

// P142: the pure parts of the teaching library on the learner's side: what the browser may hold before an answer, which stored rows count as the
// lessons of a topic, and how an answer is marked. No database, no router, no model.

const q = (n: number, over: Record<string, unknown> = {}) => ({
  prompt: `Question ${n}`,
  render: 'text' as const,
  answer: `KEY-${n}`,
  answerKind: 'whole' as const,
  steps: [`STEP-A-${n}`, `STEP-B-${n}`],
  difficulty: 1 as const,
  why: `WHY-${n}`,
  rightWay: `WAY-${n}`,
  ...over,
})

const explain = (n: number): TeachingBlock => ({ kind: 'explain', text: `Text ${n}`, speech: `Speech ${n}` })
const worked: TeachingBlock = {
  kind: 'worked',
  problem: 'Worked problem',
  steps: [
    { line: 'line one', reason: 'because one' },
    { line: 'line two', reason: 'because two' },
  ],
  answer: 'WORKED-ANSWER',
  answerKind: 'whole',
  speech: 'Worked speech',
}
const tryBlock = (n: number, over: Record<string, unknown> = {}): TeachingBlock => ({ kind: 'try', question: q(n, over), hint: `Hint ${n}`, speech: 'Try speech' })
const mistake: TeachingBlock = { kind: 'mistake', wrong: 'wrong way', right: 'right way', why: 'because', speech: 'Mistake speech' }

const lesson = (over: Partial<TeachingLesson> = {}): TeachingLesson => ({
  position: 1,
  title: 'A lesson',
  minutes: 12,
  objectives: ['You will be able to one.', 'You will be able to two.'],
  keyWords: [],
  blocks: [explain(1), explain(2), worked, worked, worked, explain(3), tryBlock(100), mistake],
  summary: ['one', 'two', 'three'],
  practice: [1, 2, 3, 4, 5].map((n) => q(n)),
  ...over,
})

describe('the fixture is a real lesson', () => {
  it('parses', () => expect(TeachingLessonSchema.safeParse(lesson()).success).toBe(true))
})

describe('forChild: answers never reach the browser before an answer is sent', () => {
  const sent = forChild(lesson())
  const text = JSON.stringify(sent)

  it('holds no answer, no steps, no why and no right way of a try question or a practice question', () => {
    for (const secret of ['KEY-100', 'STEP-A-100', 'WHY-100', 'WAY-100', 'KEY-1', 'KEY-5', 'STEP-B-3', 'WHY-4', 'WAY-2']) expect(text, secret).not.toContain(secret)
  })

  it('keeps what the learner needs to answer: prompt, kind, choices, form and picture', () => {
    const withChoices = forChild(
      lesson({
        practice: [1, 2, 3, 4, 5].map((n) => q(n, { answerKind: 'choice', choices: ['a', 'b', 'c', 'd'], answer: 'KEY' })),
        blocks: [explain(1), explain(2), worked, worked, worked, explain(3), tryBlock(7, { answerKind: 'expression', form: 'factorised' }), mistake],
      }),
    )
    expect(withChoices.practice[0]).toEqual({ prompt: 'Question 1', render: 'text', answerKind: 'choice', choices: ['a', 'b', 'c', 'd'] })
    const tried = withChoices.blocks.find((b) => b.kind === 'try')
    expect(tried).toMatchObject({ kind: 'try', hint: 'Hint 7', question: { prompt: 'Question 7', answerKind: 'expression', form: 'factorised' } })
  })

  it('keeps the blocks in order, with a worked example whole (it is shown, never typed)', () => {
    expect(sent.blocks.map((b) => b.kind)).toEqual(['explain', 'explain', 'worked', 'worked', 'worked', 'explain', 'try', 'mistake'])
    expect(text).toContain('WORKED-ANSWER')
    expect(sent.practice).toHaveLength(5)
  })
})

describe('questionAt: which question an answer is for', () => {
  const l = lesson()
  it('finds the question of a try block by the number of the block', () => expect(questionAt(l, { kind: 'try', block: 6 })?.answer).toBe('KEY-100'))
  it('finds a practice question by its number', () => expect(questionAt(l, { kind: 'practice', index: 2 })?.answer).toBe('KEY-3'))
  it('finds nothing for a block that is not a try block, or a number that is not there', () => {
    expect(questionAt(l, { kind: 'try', block: 0 })).toBeNull()
    expect(questionAt(l, { kind: 'try', block: 99 })).toBeNull()
    expect(questionAt(l, { kind: 'practice', index: 5 })).toBeNull()
    expect(questionAt(l, { kind: 'practice', index: -1 })).toBeNull()
    expect(questionAt(l, { kind: 'practice', index: 1.5 })).toBeNull()
  })
})

describe('markLessonQuestion: the marking the practice sessions use', () => {
  it('marks a number answer right by value, and a different number wrong', () => {
    const key = q(1, { answer: '4', answerKind: 'number' })
    expect(markLessonQuestion(key, '4').correct).toBe(true)
    expect(markLessonQuestion(key, '4.0').correct).toBe(true)
    expect(markLessonQuestion(key, '5').correct).toBe(false)
  })

  it('marks an equation answer by the values it gives: x = 4 is right for the key x = 4', () => {
    const key = q(1, { answer: 'x = 4', answerKind: 'equation' })
    expect(markLessonQuestion(key, 'x = 4').correct).toBe(true)
    expect(markLessonQuestion(key, 'x=4').correct).toBe(true)
    expect(markLessonQuestion(key, 'x = 5').correct).toBe(false)
  })

  it('marks a fraction answer as the sessions do', () => {
    const key = q(1, { answer: '1/2', answerKind: 'fraction' })
    expect(markLessonQuestion(key, '1/2').correct).toBe(true)
    expect(markLessonQuestion(key, '1/3').correct).toBe(false)
  })

  it('says the right answer, the steps and the right way once the answer is in, and turns a choice letter into the choice', () => {
    const key = q(2, { answer: 'B', answerKind: 'choice', choices: ['ten', 'twelve', 'fourteen', 'sixteen'] })
    const res = markLessonQuestion(key, 'B')
    expect(res).toEqual({ correct: true, answer: 'twelve', steps: ['STEP-A-2', 'STEP-B-2'], rightWay: 'WAY-2', why: 'WHY-2' })
    expect(markLessonQuestion(key, 'A').correct).toBe(false)
  })

  it('leaves the steps out when the question has none', () => {
    const { steps: _steps, ...bare } = q(3, { answer: '9' })
    expect(markLessonQuestion(bare, '9').steps).toBeUndefined()
  })
})

describe('inLibrary: a topic row finds its lessons by the CAPS name without the term', () => {
  const names = new Set(['Common fractions', 'Trigonometry'])
  it('matches the plain name', () => expect(inLibrary(names, 'Common fractions')).toBe(true))
  it('matches the second teaching of the topic: "Common fractions (Term 4)" opens the same lessons', () => expect(inLibrary(names, 'Common fractions (Term 4)')).toBe(true))
  it('does not match another name, such as the class 6B topic', () => {
    expect(inLibrary(names, 'Equivalent fractions')).toBe(false)
    expect(inLibrary(names, 'Common fraction')).toBe(false)
    expect(inLibrary(new Set(), 'Common fractions')).toBe(false)
  })
})

const row = (position: number, version: number, id = `l${position}v${version}`): LessonRow => ({ id, position, version, title: `Lesson ${position}`, minutes: 10 + position })

describe('readyLessons: the lessons of a topic', () => {
  it('keeps the newest version of each lesson, in teaching order', () => {
    const rows = [row(2, 1), row(1, 1), row(1, 2), row(3, 1)]
    expect(readyLessons(rows).map((r) => r.id)).toEqual(['l1v2', 'l2v1', 'l3v1'])
  })

  it('keeps the lessons that passed when one in the middle is missing', () => {
    expect(readyLessons([row(1, 1), row(3, 1)]).map((r) => r.position)).toEqual([1, 3])
  })

  it('shows no library when lesson 1 is not ready (today\'s flow)', () => {
    expect(readyLessons([row(2, 1), row(3, 1)])).toEqual([])
    expect(readyLessons([])).toEqual([])
  })
})

describe('buildEntries: the lesson list of one learner', () => {
  it('ticks the finished lessons and marks the one that was begun', () => {
    const progress = [
      { topic_lesson_id: 'l1v1', started_at: '2026-11-16T09:00:00Z', finished_at: '2026-11-16T09:20:00Z' },
      { topic_lesson_id: 'l2v1', started_at: '2026-11-16T09:30:00Z', finished_at: null },
    ]
    expect(buildEntries([row(1, 1), row(2, 1), row(3, 1)], progress)).toEqual([
      { id: 'l1v1', position: 1, title: 'Lesson 1', minutes: 11, done: true, started: true },
      { id: 'l2v1', position: 2, title: 'Lesson 2', minutes: 12, done: false, started: true },
      { id: 'l3v1', position: 3, title: 'Lesson 3', minutes: 13, done: false, started: false },
    ])
  })

  it('is empty for a topic with no lessons', () => expect(buildEntries([], [])).toEqual([]))
})
