import { createHash } from 'node:crypto'
import { describe, expect, test } from 'vitest'
import { z } from 'zod'
import { LessonSchema, PrimaryLessonSchema, QuestionSchema, SeniorLessonSchema, type Lesson, type Question } from '../src/schemas/lesson'

// P86, decision 1: two schemas for the model, one wide schema for every reader.

const sha = (value: unknown) => createHash('sha256').update(JSON.stringify(z.toJSONSchema(value as z.ZodType))).digest('hex')

/** sha256 of JSON.stringify(z.toJSONSchema(LessonSchema)) on develop b11ae36, before P86. The recorded demo lessons were made with this text. */
const PRIMARY_SHA = '8d041cfb7de9ba42fd1919b91033c913475831bbd0dbe07e02d7d23efb8dc71c'

const q = (difficulty: 1 | 2 | 3, i: number, over: Partial<Question> = {}): Question => ({
  prompt: `Question ${difficulty}.${i}`,
  render: 'text',
  answer: '3/4',
  answerKind: 'fraction',
  difficulty,
  why: 'why',
  rightWay: 'right way',
  ...over,
})
const lesson = (over: Partial<Question> = {}): Lesson => ({
  format: 'reading',
  title: 'T',
  minutes: 12,
  cards: [{ heading: 'h', body: 'b' }],
  warmup: [],
  questions: ([1, 2, 3] as const).flatMap((d) => [0, 1, 2, 3, 4].map((i) => q(d, i, over))),
})

describe('the primary schema is the lesson as it was', () => {
  test('its JSON schema text has the sha256 it had before P86 (the recorded demo lessons depend on it)', () => {
    expect(sha(PrimaryLessonSchema)).toBe(PRIMARY_SHA)
  })

  test('it has the six old answer kinds and no form', () => {
    const json = JSON.stringify(z.toJSONSchema(PrimaryLessonSchema))
    expect(json).toContain('"fraction","mixed","decimal","whole","money","choice"')
    for (const word of ['"expression"', '"equation"', '"point"', '"form"', '"factorised"']) expect(json).not.toContain(word)
  })

  test('a senior kind is refused by it', () => {
    expect(PrimaryLessonSchema.safeParse(lesson({ answer: '2x + 3', answerKind: 'expression' })).success).toBe(false)
    expect(PrimaryLessonSchema.safeParse(lesson()).success).toBe(true)
  })
})

describe('the senior schema adds four answer kinds and one optional field', () => {
  test('its JSON schema is not the primary one, and it names the four kinds and the three forms', () => {
    expect(sha(SeniorLessonSchema)).not.toBe(PRIMARY_SHA)
    const json = JSON.stringify(z.toJSONSchema(SeniorLessonSchema))
    for (const word of ['"number"', '"expression"', '"equation"', '"point"', '"form"', '"any"', '"factorised"', '"expanded"']) expect(json).toContain(word)
  })

  test('form is optional, and the question of a senior lesson parses with or without it', () => {
    expect(SeniorLessonSchema.safeParse(lesson({ answer: '2x + 3', answerKind: 'expression' })).success).toBe(true)
    expect(SeniorLessonSchema.safeParse(lesson({ answer: '(x+2)(x-2)', answerKind: 'expression', form: 'factorised' })).success).toBe(true)
    expect(SeniorLessonSchema.safeParse(lesson({ answer: 'x', answerKind: 'expression', form: 'sideways' as never })).success).toBe(false)
  })

  test('the two lesson rules are the same: 15 questions, 5 per level; a warm-up of 0 or 2', () => {
    const l = lesson()
    expect(SeniorLessonSchema.safeParse({ ...l, questions: l.questions.slice(1) }).success).toBe(false)
    expect(SeniorLessonSchema.safeParse({ ...l, warmup: [q(1, 90)] }).success).toBe(false)
    expect(SeniorLessonSchema.safeParse({ ...l, warmup: [q(1, 90), q(1, 91)] }).success).toBe(true)
    expect(PrimaryLessonSchema.safeParse({ ...l, questions: l.questions.slice(1) }).success).toBe(false)
  })
})

describe('every reader uses the wide shape', () => {
  test('LessonSchema is the senior shape, and a lesson of the primary shape parses with it, unchanged', () => {
    expect(sha(LessonSchema)).toBe(sha(SeniorLessonSchema))
    const old = PrimaryLessonSchema.parse(lesson())
    expect(LessonSchema.parse(old)).toEqual(old)
  })

  test('QuestionSchema takes the four new kinds, and the old ones as before', () => {
    for (const answerKind of ['number', 'expression', 'equation', 'point', 'fraction', 'mixed', 'decimal', 'whole', 'money', 'choice'] as const) {
      expect(QuestionSchema.safeParse(q(1, 1, { answerKind })).success).toBe(true)
    }
    expect(QuestionSchema.safeParse(q(1, 1, { answerKind: 'matrix' as never })).success).toBe(false)
  })
})
