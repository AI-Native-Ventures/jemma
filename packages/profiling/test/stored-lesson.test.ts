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
 * P167 (25 Nov 2026) moved the wide one alone, on purpose: a question may have a `graph` the learner draws (asked of a Grade 1 to 6 data topic only, so the senior
 * one did not move). Before P167 the wide one was ea4209d54339ed5585a485b306a982029b46d88659d4b5f258020617bc336371.
 * P168 (25 Nov 2026) moved the wide one alone again: a question may have a sum the learner works in `columns`. Before P168 it was
 * 212253f558d1990c7b03e827427e0364a28746f22a78f1aa3c758d4bc570ba21.
 * P169 (25 Nov 2026) moved the wide one alone again: a question may have `blocks` to build a number with. Before P169 it was
 * 15a1bebff43c08f97af708afce271db5f67aeaf50bf29ea256da8a6a227a9df2.
 * P170 (25 Nov 2026) moved the wide one alone again: a question may have `groups` to sort things into. Before P170 it was
 * e210b4f13d61b06765fb9315a6034b969ed6fff44dba0c56cc0314f184d78105.
 * P171 (26 Nov 2026) moved both, on purpose: a senior question may have a `plot`, a grid the learner places points on. Before P171 they were
 * cefbe5f5625995071cb58fdf615c104518594a27db3b868f7c60356e7c80d20c (senior) and 448fde0232cf5c00cd57ba4afc6030bcf588317682a3e58c6cd7b8de0011775d (wide).
 * P172 (26 Nov 2026) moved the wide one alone: a question may have a `shade`, a shape to shade parts of. Before P172 it was
 * 1734ac8542437e926116af04d17d7b173b64768e6912b70e66bcd27561818c4f.
 * P173 (26 Nov 2026) moved the wide one alone: a question may have a `tap`, shapes to tap. Before P173 it was
 * 0aec7274bd2caa1476812b340ab457ac353a5050e8e168b82abbaf3235a69b83.
 * P174 (26 Nov 2026) moved both, on purpose: a senior question may have a `line`, a grid the learner draws a straight line on. Before P174 they were
 * a0a5757599a5581b0f5a1b1ba801e5c16ca4133a4f283a0a0d8feb84d343421b (senior) and 23bb70daa29d650f43d1cadae7ffe32970b090f666d095ea17ce15488fa2fb1b (wide).
 * P175 (26 Nov 2026) moved the wide one alone: a question may have a `pin`, a number line to put a pin on. Before P175 it was
 * 6cf648b0b27725042e61fde110d4bdb8fa04527b5173848cfc8ba56108f13c4b.
 * P176 (26 Nov 2026) moved both, on purpose: a senior grid to place points on may be a `curve`, a sketch of a parabola through its key points. Before P176
 * they were 8dcdb55a3011410428a8664db696386b5cd7904d7ac89557dd998b0dd7c177bf (senior) and 6e04f1e23d09c24c91de670dfeeef035456ae194dadd71a509f1b1b35a92e910 (wide).
 * P177 (26 Nov 2026) moved the wide one alone: a question may have a `clock`, a clock to set. Before P177 it was
 * 0836f720710671e34acafb345b833bd08344e4781e280ce1f96297bfd0124c47.
 * P178 (26 Nov 2026) moved the wide one alone: a question may have a `match`, things to match in pairs. Before P178 it was
 * e4f270893f8dff6dd1f4c0891384937e01e0eca3409be2579359345f56cd5686.
 * P179 (26 Nov 2026) moved both, on purpose: a senior question may have a `proof`, an identity to prove line by line. Before P179 they were
 * 02e4320fe0f7a380ddd0da9cb0442e4cec5345610d47776f5a5773756f9a6912 (senior) and 1308d8aba8ea1c57a3413968f1aa2a6fc471ef0621d36bf13cf10fffa565113f (wide).
 * P180 (26 Nov 2026) moved both, on purpose: a senior question may have `general`, the frame of every solution of a trig equation. Before P180 they were
 * 66113f9361512f0c77b4f3721be66e308cc9fac22ed0722d444cbe856546cfda (senior) and fd34f3b4fedd5b60709d915e022419917cdaf88e88fbf3e37783a5e28e25649c (wide).
 * P181 (26 Nov 2026) moved both, on purpose: the `curve` of a sketch may also be a hyperbola or a cubic graph. Before P181 they were
 * 20da21b0517a0bcc2fa4bc4f5eb84cdd7dff1809842bb494155173f024082835 (senior) and 5159c5291b9034c7e1deb85d78a1dcf35c7d09140fc9755395fb02fc12aca3ce (wide).
 * P182 (26 Nov 2026) moved both, on purpose: a sketch may be a trig graph on a grid in degrees (`curve: "trig"`, `xStep`). Before P182 they were
 * 32b5982d8faf9ea58f30b71f41bfb14e566daa96d2e028c928c1126e31cdebaf (senior) and afa8764da0e665dde02b91576a535ba42625038116c6233f53e0d1714634a0a3 (wide).
 * P183 (26 Nov 2026) moved the wide one alone: a question may have a `clockFace`, a clock face to read. Before P183 it was
 * cc232a2bed945067c97c557c2e17d02c40a113124ddbbc5e7d9bc9455492a3b8.
 * P184 (26 Nov 2026) moved both, on purpose: a senior question may have a `graphMatch`, graphs to match to their equations. Before P184 they were
 * 96e1cd58f52b8b4e324e4c64af6fbd0abbb94ea2c02fca8e518845a8e9d9b84d (senior) and 2e3c548cae57d87537dad0df4c6a9f46bcea0cb2f9361272fc724ecaa6feade4 (wide).
 * P185 (26 Nov 2026) moved both, on purpose: a senior question may have `firstPrinciples`, a derivative to find from first principles. Before P185 they were
 * 953e2754a7599f5b1bf4d0cfef5e731b464ba17b35dc1e393006c0aa82e58a57 (senior) and 429f5d922d17252dea0ac797c4bbb62efbeb4f8faf78a0f8008c63e5ef2bf8e2 (wide).
 * P188 (26 Nov 2026) moved both, on purpose: a picture may be objects to count, a ten-frame, base-ten blocks, part of a hundred chart, a dot array or two numbers to
 * compare. Before P188 they were 41ec5a552ff9be433b5122dc63a831603e7d7fa904d1cf58f21ea98f75149390 (senior) and
 * 2c5926eb11be580ac73dcd6e3d8442fe30dd1387e82f0f18e9f0425b5f44ee30 (wide).
 * P189 (26 Nov 2026) moved both, on purpose: a picture may be a factor tree, fraction circles, a percentage bar, a calendar or coins and notes, and objects may have
 * gold groups. Before P189 they were cf542cece448d1f036b57f3eb609f974653262e2c98f1953be3bd0b3f3dc2e3a (senior) and
 * 807a2e3e56cbb4278aa7ac53668c811ddc6062c2916279a9ca57cba5388e4940 (wide).
 * P190 (26 Nov 2026) moved both, on purpose: a picture may be a ruler, a kitchen scale, a measuring jug, a thermometer, a box of cubes or the net of a box. Before
 * P190 they were 6bea83d193575e4e405eef814017d187b1b179eef22867e747286ee50ff1eb92 (senior) and 11253beb7d0758835262c370d3f58ee6abb26a0b2dd73f2eb29a116188a1c6d8 (wide).
 * P191 (26 Nov 2026) moved both, on purpose: a picture may be a growing pattern of tiles, a flow diagram, a balance scale or a graph of a trip. Before P191 they were
 * 9d9b73e8279db69469a12fb555bda6234a340a2c345f9b74d36ed9436367154b (senior) and 7e4aca87219297c5121079f3d17a2d840e9e2648391eb447b6a009c6a543b6df (wide).
 * P192 (26 Nov 2026) moved both, on purpose: a picture may be a map on a grid, a 3D object, a shape of cubes or lines across a shape. Before P192 they were
 * a3e10dd03ef5af58da843cfb966ad67e4d22f6a2fcdaed7d45a7292f81e7f1a1 (senior) and d99ba82498e544c58128d08ec56d20579e3c0e8bed2f1f07d740479d47a5f65b (wide).
 * P193 (26 Nov 2026) moved both, on purpose: a picture may be an angle, a protractor, parallel lines or an enlargement. Before P193 they were
 * b371ec9b701dac93d2f61b6b8d9f3ca1b10f787544d7dd7b20f520085c5add5a (senior) and 8f33c454b0f01429224f5c16393c55a6314eb7a67fe043a4a34ed69178184d20 (wide).
 * P194 (26 Nov 2026) moved the wide one only, on purpose: a shape to shade may have a mirror line and squares shaded already (a shape to finish). Before P194 it
 * was accc3ad04cab97b3fda70e7ab92de9ce1c1c5646e20f84fe196cd37767ba65f6 (wide).
 * Every packet that changes the senior schema moves these two: recompute them after a merge.
 */
const SENIOR_SHA = '9edfb914e6e159709f3495e5ceed77e81ac72776f1c49f4e2c083842a484372a'
const WIDE_SHA = 'a5fe2558146c09d87c97001d736960b0126fba895efafe74f656171207bec66a'

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
