import { createHash } from 'node:crypto'
import { describe, expect, test } from 'vitest'
import { z } from 'zod'
import { MemoryStore } from '../src/ai'
import { LessonSchema, MIN_QUESTIONS_PER_LEVEL, PrimaryLessonSchema, SeniorLessonSchema, StoredLessonSchema, type Lesson, type Question } from '../src/schemas/lesson'
import { isWithImages, type ToolContext } from '../src/tools/context'
import { saveLesson } from '../src/tools/save/save-lesson'
import { memoryDb, type MemoryDb } from './helpers/memory-db'

// P117: a lesson that was saved with fewer than 15 questions (`save_lesson` with `dropInvalid` keeps each level at 4 or more) must still open
// for the learner. The write side (`LessonSchema`, the text the model is handed) is unchanged; the read side is `StoredLessonSchema`.
// No database, no network, no model.

const sha = (value: unknown) => createHash('sha256').update(JSON.stringify(z.toJSONSchema(value as z.ZodType))).digest('hex')
/** The model-facing JSON schemas. Recorded answers are found by a hash of this text. The primary one is as it was before P117 and must not move. */
const PRIMARY_SHA = '8d041cfb7de9ba42fd1919b91033c913475831bbd0dbe07e02d7d23efb8dc71c'
/**
 * The senior one and the wide one changed on purpose in P127 (16 Nov 2026): the senior question has a required `steps` (2 to 6 lines of maths), and the
 * wide `LessonSchema` that every reader and writer uses has it optional. Senior lessons have no recorded answer, so no recording depends on them.
 * Before P127 both were 8eb4995287795a596752a2f0406b694d57089b524c10e294d9b99ede40df6aa6.
 * P149 (16 Nov 2026) moved them: a `choices` entry may be an object with `text` and/or a `diagram` (a picture choice), and `truefalse` and `reason` are two more answer
 * kinds. P150 (16 Nov 2026) moved both again, on purpose: three more answer kinds (`list`, `order`, `table`) and four optional question fields (`ordered`, `labels`,
 * `round`, `table`). P148 moved them too: the question has two optional fields, `unit` and `round` (shared with P150), and the answer kinds `time` and `ratio`.
 * Before P148, P149 and P150 they were 95bd01bd191e25f2ee7e8325989c3fde9ccb47893163cffb8a2a4172fc94d41a (senior) and a84500e7bc9893b2cf070f2019ea2e17cb739091f9eb50859981fd8804ae2a3c (wide).
 * P165 (25 Nov 2026) moved both again, on purpose: three more pictures a senior question may carry (`box_plot`, `tree`, `timeline`). Before P165 they were
 * 9edb11fef8145a8846474d36e5e8f8312c52bde0882701f73a57c02b77b0ffee (senior) and f1ebf6ca0fb7833dde0016b2c34e1a616293ac870719896b759654366b690a5d (wide).
 * Every packet that changes the senior schema moves these two: recompute them after a merge.
 */
const SENIOR_SHA = 'cefbe5f5625995071cb58fdf615c104518594a27db3b868f7c60356e7c80d20c'
const WIDE_SHA = 'ea4209d54339ed5585a485b306a982029b46d88659d4b5f258020617bc336371'

type Level = 1 | 2 | 3
const question = (difficulty: Level, i: number, over: Partial<Question> = {}): Question => ({
  prompt: `1/2 + 1/4 (${difficulty}.${i})`,
  render: 'text',
  answer: '3/4',
  answerKind: 'fraction',
  difficulty,
  why: 'The pieces must be the same size first.',
  rightWay: 'Make quarters: 2/4 + 1/4 = 3/4.',
  ...over,
})
/** A lesson with `perLevel` questions at levels 1, 2 and 3 and `warmup` warm-up questions. */
const lessonOf = (perLevel: [number, number, number], warmup = 2, over: Partial<Lesson> = {}): Lesson => ({
  format: 'reading',
  title: 'Adding fractions',
  minutes: 12,
  cards: [{ heading: 'Same size pieces', body: 'Make quarters first.' }],
  warmup: Array.from({ length: warmup }, (_, i) => question(1, 90 + i)),
  questions: ([1, 2, 3] as const).flatMap((d) => Array.from({ length: perLevel[d - 1]! }, (_, i) => question(d, i))),
  ...over,
})

describe('the write side does not change', () => {
  test('the JSON schema text the model is handed: the primary one has the same sha256 as before, the senior and the wide one are pinned anew (P127)', () => {
    expect(sha(PrimaryLessonSchema)).toBe(PRIMARY_SHA)
    expect(sha(SeniorLessonSchema)).toBe(SENIOR_SHA)
    expect(sha(LessonSchema)).toBe(WIDE_SHA)
  })

  test('LessonSchema still wants exactly 15 questions, 5 per level, and a warm-up of 0 or 2', () => {
    expect(LessonSchema.safeParse(lessonOf([5, 5, 5])).success).toBe(true)
    expect(LessonSchema.safeParse(lessonOf([5, 5, 4])).success).toBe(false)
    expect(LessonSchema.safeParse(lessonOf([4, 4, 4])).success).toBe(false)
    expect(LessonSchema.safeParse(lessonOf([5, 5, 5], 1)).success).toBe(false)
  })
})

describe('StoredLessonSchema opens every lesson the write side can leave', () => {
  const COUNTS: [number, number, number][] = [
    [5, 5, 5],
    [5, 5, 4],
    [5, 4, 5],
    [4, 5, 5],
    [5, 4, 4],
    [4, 5, 4],
    [4, 4, 5],
    [4, 4, 4],
  ]

  test('a lesson of 15, 14, 13 or 12 questions, with a warm-up of 0, 1 or 2, opens and comes back unchanged', () => {
    for (const counts of COUNTS) {
      for (const warmup of [0, 1, 2]) {
        const lesson = lessonOf(counts, warmup)
        const parsed = StoredLessonSchema.safeParse(lesson)
        expect(parsed.success, `${counts.join('/')} with a warm-up of ${warmup}`).toBe(true)
        expect(parsed.data).toEqual(lesson)
      }
    }
    expect(COUNTS.map((c) => c[0] + c[1] + c[2]).sort()).toEqual([12, 13, 13, 13, 14, 14, 14, 15])
  })

  test('a lesson of 15 is read exactly as it was, with or without a picture or the senior fields', () => {
    const old = lessonOf([5, 5, 5])
    expect(StoredLessonSchema.parse(old)).toEqual(old)
    expect(StoredLessonSchema.parse(old)).toEqual(LessonSchema.parse(old))
    const senior = lessonOf([4, 4, 4], 1, {
      questions: lessonOf([4, 4, 4]).questions.map((q, i) => (i === 0 ? { ...q, answer: '(x+2)(x-2)', answerKind: 'expression' as const, form: 'factorised' as const } : q)),
    })
    expect(StoredLessonSchema.parse(senior)).toEqual(senior)
  })

  test('the audio and diagram formats open the same way', () => {
    expect(StoredLessonSchema.safeParse(lessonOf([4, 5, 4], 1, { format: 'audio', cards: undefined, audio: { script: 'Hello. Today we add fractions.' } })).success).toBe(true)
    const diagram: NonNullable<NonNullable<Lesson['cards']>[number]['diagram']> = { kind: 'fraction_bar', rows: [{ parts: 4, shaded: 3 }] }
    expect(
      StoredLessonSchema.safeParse(lessonOf([4, 4, 4], 0, { format: 'diagram', cards: undefined, diagram: { title: 't', caption: 'c', steps: [{ caption: 's', diagram }] } })).success,
    ).toBe(true)
  })

  test('what no reader can use is still refused: a level under 4, a warm-up of 3, a broken question', () => {
    expect(MIN_QUESTIONS_PER_LEVEL).toBe(4)
    expect(StoredLessonSchema.safeParse(lessonOf([3, 5, 5])).success).toBe(false)
    expect(StoredLessonSchema.safeParse(lessonOf([5, 5, 0])).success).toBe(false)
    expect(StoredLessonSchema.safeParse(lessonOf([5, 5, 5], 3)).success).toBe(false)
    expect(StoredLessonSchema.safeParse({ ...lessonOf([5, 5, 5]), questions: [] }).success).toBe(false)
    expect(StoredLessonSchema.safeParse({ ...lessonOf([5, 5, 5]), format: 'video' }).success).toBe(false)
    const broken = lessonOf([5, 5, 5])
    broken.questions[0] = { ...broken.questions[0]!, answerKind: 'colour' as never }
    expect(StoredLessonSchema.safeParse(broken).success).toBe(false)
  })

  test('more than 5 at a level is not refused (a seeded or older lesson)', () => {
    expect(StoredLessonSchema.safeParse(lessonOf([6, 5, 5])).success).toBe(true)
  })
})

describe('what save_lesson saves with dropInvalid, StoredLessonSchema opens', () => {
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
  const world = () =>
    memoryDb({
      children: [{ id: CHILD, school_id: SCHOOL, first_name: 'Amina' }],
      sessions: [{ id: SESSION, child_id: CHILD, lesson_id: null, topic_id: null, topic_name: 'Adding fractions', format: 'reading' }],
      lessons: [],
      activity_log: [],
      tool_calls: [],
    })
  const save = async (lesson: Lesson, dropInvalid: boolean) => {
    const db = world()
    const out = await saveLesson.run(ctx(db), { sessionId: SESSION, lesson, dropInvalid })
    if (isWithImages(out)) throw new Error('unexpected images')
    return { db, out, stored: db.tables.lessons![0]!.content as Lesson }
  }
  /** The model wrote a bad answer (one that cannot be read as a fraction) at these positions. */
  const withBad = (at: number[]): Lesson => {
    const lesson = lessonOf([5, 5, 5])
    for (const i of at) lesson.questions[i] = { ...lesson.questions[i]!, answer: 'about half' }
    return lesson
  }
  // Positions 0 to 4 are level 1, 5 to 9 level 2, 10 to 14 level 3.
  const ONE_PER_LEVEL = [0, 5, 10]

  test('a lesson with nothing dropped is the 15 it was, and both schemas open it', async () => {
    const { stored } = await save(lessonOf([5, 5, 5]), true)
    expect(stored.questions).toHaveLength(15)
    expect(LessonSchema.safeParse(stored).success).toBe(true)
    expect(StoredLessonSchema.safeParse(stored).success).toBe(true)
  })

  test('every way of dropping up to one question per level saves a lesson that opens (15, 14, 13 and 12 questions)', async () => {
    const seen = new Set<number>()
    for (let mask = 0; mask < 8; mask++) {
      const bad = ONE_PER_LEVEL.filter((_, bit) => mask & (1 << bit))
      const { stored } = await save(withBad(bad), true)
      expect(stored.questions).toHaveLength(15 - bad.length)
      expect(StoredLessonSchema.safeParse(stored).success, `${bad.length} dropped (${bad.join(', ')})`).toBe(true)
      seen.add(stored.questions.length)
    }
    expect([...seen].sort()).toEqual([12, 13, 14, 15])
  })

  test('the bug P117 fixes: the old reader refused a 14 or 12 question lesson that save_lesson had saved', async () => {
    const { stored } = await save(withBad(ONE_PER_LEVEL), true)
    expect(stored.questions).toHaveLength(12)
    expect(LessonSchema.safeParse(stored).success).toBe(false)
    expect(StoredLessonSchema.safeParse(stored).success).toBe(true)
  })

  test('dropping would leave a level with fewer than 4: save_lesson refuses, as before, and nothing is saved', async () => {
    const db = world()
    await expect(saveLesson.run(ctx(db), { sessionId: SESSION, lesson: withBad([0, 1]), dropInvalid: true })).rejects.toThrow(/level 1 with fewer than 4: each level needs at least 4 questions/)
    expect(db.tables.lessons![0]!.content).toEqual({})
    await expect(saveLesson.run(ctx(db), { sessionId: SESSION, lesson: withBad([0]), dropInvalid: false })).rejects.toThrow(/bad answers/)
  })

  test('the numbers agree: the most a save can drop is what the reader allows', async () => {
    // 5 written, at least MIN_QUESTIONS_PER_LEVEL kept, so one dropped per level at most
    const { stored } = await save(withBad(ONE_PER_LEVEL), true)
    for (const level of [1, 2, 3]) expect(stored.questions.filter((q) => q.difficulty === level)).toHaveLength(MIN_QUESTIONS_PER_LEVEL)
    await expect(save(withBad([0, 1]), true)).rejects.toThrow()
  })
})
