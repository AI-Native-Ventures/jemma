import { describe, expect, test } from 'vitest'
import { z } from 'zod'
import { MemoryStore } from '../src/ai'
import { cleanSteps } from '../src/logic/steps'
import { LessonSchema, PrimaryLessonSchema, PrimaryQuestionSchema, QuestionSchema, SeniorLessonSchema, SeniorQuestionSchema, StoredLessonSchema, type Lesson, type Question } from '../src/schemas/lesson'
import { isWithImages, type ToolContext } from '../src/tools/context'
import { saveLesson } from '../src/tools/save/save-lesson'
import { memoryDb, type MemoryDb } from './helpers/memory-db'

// P127: every question of a senior lesson has `steps`, 2 to 6 short lines of maths from the question to the answer, for the "How to get there" of the
// results screen. The schema the model is handed asks for them (required); every reader and the save path take a lesson without them (optional), so
// an old saved lesson still opens and a missing or unusable `steps` never refuses a lesson. No database, no network, no model.

const STEPS = ['x/2 + 6 = 10', 'x/2 = 4', 'x = 8']
const q = (difficulty: 1 | 2 | 3, i: number, over: Partial<Question> = {}): Question => ({
  prompt: `Solve: x/2 + 6 = 10 (${difficulty}.${i})`,
  render: 'text',
  answer: 'x = 8',
  answerKind: 'equation',
  difficulty,
  why: 'The 6 is taken away before the halving is undone.',
  rightWay: 'Take 6 from both sides, then double.',
  ...over,
})
const lessonOf = (over: Partial<Question> = {}, warmup = 0): Lesson => ({
  format: 'reading',
  title: 'Solving equations',
  minutes: 12,
  cards: [{ heading: 'Undo each step', body: 'Do the opposite to both sides.' }],
  warmup: Array.from({ length: warmup }, (_, i) => q(1, 90 + i, { answer: 'A', answerKind: 'choice', choices: ['2', '4', '8'], ...over })),
  questions: ([1, 2, 3] as const).flatMap((d) => [0, 1, 2, 3, 4].map((i) => q(d, i, over))),
})
const withSteps = (steps: string[] = STEPS, warmup = 0) => lessonOf({ steps }, warmup)

describe('the schema the senior model is handed asks for steps', () => {
  test('every question needs steps: 2 to 6 lines of text', () => {
    expect(SeniorLessonSchema.safeParse(withSteps()).success).toBe(true)
    expect(SeniorLessonSchema.safeParse(withSteps(['a', 'b'])).success).toBe(true)
    expect(SeniorLessonSchema.safeParse(withSteps(['a', 'b', 'c', 'd', 'e', 'f'])).success).toBe(true)
    expect(SeniorLessonSchema.safeParse(lessonOf()).success).toBe(false)
    expect(SeniorLessonSchema.safeParse(withSteps(['x = 8'])).success).toBe(false)
    expect(SeniorLessonSchema.safeParse(withSteps(['a', 'b', 'c', 'd', 'e', 'f', 'g'])).success).toBe(false)
    expect(SeniorLessonSchema.safeParse(withSteps([])).success).toBe(false)
    expect(SeniorQuestionSchema.safeParse(q(1, 1)).success).toBe(false)
    expect(SeniorQuestionSchema.safeParse(q(1, 1, { steps: STEPS })).success).toBe(true)
  })

  test('the warm-up questions need them too', () => {
    const l = withSteps(STEPS, 2)
    expect(SeniorLessonSchema.safeParse(l).success).toBe(true)
    expect(SeniorLessonSchema.safeParse({ ...l, warmup: [{ ...l.warmup[0]!, steps: undefined }, l.warmup[1]] }).success).toBe(false)
  })

  test('its JSON text lists steps as required on a question, with the 2 and the 6', () => {
    const json = z.toJSONSchema(SeniorLessonSchema) as unknown as { properties: { questions: { items: { required: string[]; properties: { steps: { minItems: number; maxItems: number; type: string } } } } } }
    const item = json.properties.questions.items
    expect(item.required).toContain('steps')
    expect(item.properties.steps).toMatchObject({ type: 'array', minItems: 2, maxItems: 6 })
  })

  test('steps come before the answer in the question, so the model works the maths first', () => {
    const keys = Object.keys((z.toJSONSchema(SeniorQuestionSchema) as unknown as { properties: Record<string, unknown> }).properties)
    expect(keys.indexOf('steps')).toBeGreaterThan(-1)
    expect(keys.indexOf('steps')).toBeLessThan(keys.indexOf('answer'))
  })
})

describe('every reader and the save path take a lesson without steps', () => {
  test('LessonSchema and QuestionSchema: steps are optional and kept when there', () => {
    expect(LessonSchema.safeParse(lessonOf()).success).toBe(true)
    expect(QuestionSchema.safeParse(q(1, 1)).success).toBe(true)
    expect(LessonSchema.parse(withSteps()).questions[0]!.steps).toEqual(STEPS)
    const json = z.toJSONSchema(LessonSchema) as unknown as { properties: { questions: { items: { required: string[] } } } }
    expect(json.properties.questions.items.required).not.toContain('steps')
  })

  test('StoredLessonSchema (P117): an old lesson opens as it was, and a lesson with steps keeps them', () => {
    const old = lessonOf()
    expect(StoredLessonSchema.parse(old)).toEqual(old)
    const fresh = withSteps()
    expect(StoredLessonSchema.parse(fresh).questions.every((x) => x.steps?.length === 3)).toBe(true)
  })

  test('the primary schema has no steps: a primary lesson is read as it was, and the field is not kept', () => {
    const parsed = PrimaryLessonSchema.parse(lessonOf({ answer: '3/4', answerKind: 'fraction', steps: STEPS })) as { questions: Array<Record<string, unknown>> }
    expect(parsed.questions[0]).not.toHaveProperty('steps')
    expect(Object.keys(PrimaryQuestionSchema.shape)).not.toContain('steps')
  })
})

describe('cleanSteps: which lines are usable', () => {
  test('trims the lines and leaves out empty ones', () => {
    expect(cleanSteps(['  x/2 + 6 = 10 ', '', '   ', 'x/2 = 4', 'x = 8'])).toEqual(STEPS)
  })
  test('fewer than 2 usable lines, more than 6, or a line that is not short: none (the question stays)', () => {
    expect(cleanSteps(undefined)).toBeUndefined()
    expect(cleanSteps([])).toBeUndefined()
    expect(cleanSteps(['x = 8'])).toBeUndefined()
    expect(cleanSteps(['x = 8', ' '])).toBeUndefined()
    expect(cleanSteps(['1', '2', '3', '4', '5', '6', '7'])).toBeUndefined()
    expect(cleanSteps(['x = 8', 'y'.repeat(161)])).toBeUndefined()
    expect(cleanSteps(['1', '2', '3', '4', '5', '6'])).toHaveLength(6)
    expect(cleanSteps(['x = 8', 'y'.repeat(160)])).toHaveLength(2)
  })
})

describe('save_lesson keeps steps and never refuses a lesson for them', () => {
  const SCHOOL = '11111111-1111-4111-8111-111111111111'
  const CHILD = '33333333-3333-4333-8333-333333333333'
  const SESSION = '55555555-5555-4555-8555-555555555555'
  const ctx = (db: MemoryDb): ToolContext => ({
    db,
    schoolId: SCHOOL,
    eventId: null,
    env: { replayStore: new MemoryStore(), LLM_MODEL: 'test/model:free' },
    now: () => new Date('2026-11-16T09:00:00.000Z'),
  })
  const save = async (lesson: Lesson) => {
    const db = memoryDb({
      children: [{ id: CHILD, school_id: SCHOOL, first_name: 'Amina' }],
      sessions: [{ id: SESSION, child_id: CHILD, lesson_id: null, topic_id: null, topic_name: 'Solving equations', format: 'reading' }],
      lessons: [],
      activity_log: [],
      tool_calls: [],
    })
    const out = await saveLesson.run(ctx(db), { sessionId: SESSION, lesson, dropInvalid: true })
    if (isWithImages(out)) throw new Error('unexpected images')
    return { out, stored: db.tables.lessons![0]!.content as Lesson }
  }

  test('the steps of every question and warm-up question are saved, and the lesson opens for the learner', async () => {
    const { stored } = await save(withSteps(STEPS, 2))
    expect(stored.questions).toHaveLength(15)
    expect(stored.questions.every((x) => JSON.stringify(x.steps) === JSON.stringify(STEPS))).toBe(true)
    expect(stored.warmup.every((x) => JSON.stringify(x.steps) === JSON.stringify(STEPS))).toBe(true)
    expect(StoredLessonSchema.safeParse(stored).success).toBe(true)
  })

  test('a lesson without steps is saved exactly as before: no steps appear', async () => {
    const { stored } = await save(lessonOf())
    expect(stored.questions).toHaveLength(15)
    expect(stored.questions.some((x) => 'steps' in x)).toBe(false)
  })

  test('lines are trimmed; a question whose steps are unusable is kept without them, and the other questions keep theirs', async () => {
    const lesson = withSteps(['  x/2 + 6 = 10 ', '', 'x/2 = 4', 'x = 8'])
    lesson.questions[0] = { ...lesson.questions[0]!, steps: ['x = 8'] }
    lesson.questions[1] = { ...lesson.questions[1]!, steps: ['1', '2', '3', '4', '5', '6', '7'] }
    const { stored } = await save(lesson)
    expect(stored.questions).toHaveLength(15)
    expect(stored.questions[0]).not.toHaveProperty('steps')
    expect(stored.questions[1]).not.toHaveProperty('steps')
    expect(stored.questions[2]!.steps).toEqual(STEPS)
  })

  test('a step that is a label on the learner leaves that question without steps, says so, and keeps the rest of the lesson', async () => {
    const lesson = withSteps()
    lesson.questions[3] = { ...lesson.questions[3]!, steps: ['x/2 + 6 = 10', 'You are so gifted.', 'x = 8'] }
    const { out, stored } = await save(lesson)
    expect(stored.questions).toHaveLength(15)
    expect(stored.questions[3]).not.toHaveProperty('steps')
    expect(stored.questions[4]!.steps).toEqual(STEPS)
    expect(out.dropped?.some((d) => d.field === 'question 4 steps')).toBe(true)
  })
})
