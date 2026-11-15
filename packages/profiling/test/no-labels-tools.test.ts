import { describe, expect, test } from 'vitest'
import type { z } from 'zod'
import { MemoryStore } from '../src/ai'
import type { Lesson, Question } from '../src/schemas/lesson'
import { isWithImages, type ToolContext, type ToolDef } from '../src/tools/context'
import { classGapReport } from '../src/tools/save/class-gap-report'
import { saveLesson } from '../src/tools/save/save-lesson'
import { subjectGuidance } from '../src/tools/save/subject-guidance'
import { memoryDb, type MemoryDb } from './helpers/memory-db'

// P104: no label, ranking or career talk is saved in a text the AI writes about a learner, whichever tool saves it.
// The Long view has its own test. These are the other three save tools, run in memory: no database, no network, no model.

type Row = Record<string, unknown>

const SCHOOL = '11111111-1111-4111-8111-111111111111'
const CLASS = '22222222-2222-4222-8222-222222222222'
const CHILD = '33333333-3333-4333-8333-333333333333'
const TEST = '44444444-4444-4444-8444-444444444444'
const SESSION = '55555555-5555-4555-8555-555555555555'
const MAP = '66666666-6666-4666-8666-666666666666'
const TOPIC = '77777777-7777-4777-8777-777777777777'
const PAPER = '88888888-8888-4888-8888-888888888888'
const RESULT = '99999999-9999-4999-8999-999999999999'
const OTHER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const NOW = new Date('2026-11-15T09:00:00.000Z')

/** `upsert` is the one call the guidance card needs that the in-memory database does not have. */
function withUpsert(db: MemoryDb): MemoryDb {
  const from = db.from.bind(db)
  ;(db as unknown as { from: (table: string) => unknown }).from = (table: string) => {
    const q = from(table as never) as unknown as Record<string, unknown>
    q.upsert = async (row: Row, opts: { onConflict: string }) => {
      const rows = (db.tables[table] ??= [])
      const at = rows.findIndex((r) => r[opts.onConflict] === row[opts.onConflict])
      if (at >= 0) rows[at] = { ...rows[at], ...row }
      else rows.push({ ...row })
      return { data: null, error: null }
    }
    return q
  }
  return db
}

const ctxOf = (db: MemoryDb): ToolContext => ({
  db,
  schoolId: SCHOOL,
  eventId: null,
  env: { replayStore: new MemoryStore(), LLM_MODEL: 'test/model:free' },
  now: () => NOW,
})

// These tools never return images, so narrow the union.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function plain<T extends ToolDef<any, any>>(tool: T, c: ToolContext, input: z.infer<T['input']>): Promise<z.infer<T['output']>> {
  const out = await tool.run(c, input)
  if (isWithImages(out)) throw new Error('unexpected images')
  return out
}

const lastCall = (db: MemoryDb, tool: string) => db.tables.tool_calls!.filter((r) => r.tool === tool).at(-1) as { ok: boolean; output: unknown; error: string | null; input: unknown }

describe('subject_guidance leaves out a sentence with a label and keeps the rest', () => {
  const world = (firstName = 'Amina', topicName = 'Adding fractions') =>
    withUpsert(
      memoryDb({
        schools: [{ id: SCHOOL, kind: 'school' }],
        children: [{ id: CHILD, school_id: SCHOOL, first_name: firstName }],
        question_results: [{ id: RESULT, child_id: CHILD, topic_name: topicName }],
        guidance_cards: [],
        guidance_drafts: [],
        observations: [],
        activity_log: [],
        tool_calls: [],
      }),
    )
  const item = (title: string, why: string) => ({ title, why, evidence: [{ label: 'Test 2 Q1', resultIds: [RESULT] }] })
  // A school child's card is a draft until the teacher sends it (P106); a learner's own record has its card written at once.
  const saved = (db: MemoryDb, table: 'guidance_drafts' | 'guidance_cards' = 'guidance_drafts') => db.tables[table]![0]!.content as { headline: string; focus: { title: string; why: string }[]; lookingAhead: string }

  test('it drops "gifted", "slow learner" and "should become an engineer", saves the rest, and says what it left out', async () => {
    const db = world()
    const out = await plain(subjectGuidance, ctxOf(db), {
      childId: CHILD,
      guidance: {
        headline: 'Amina is doing well. She is a gifted child.',
        focus: [item('Adding fractions', 'The tops and bottoms are added. She is a slow learner and needs more time.')],
        lookingAhead: 'Next up is subtracting fractions. She should become an engineer one day.',
      },
    })
    expect(saved(db)).toEqual({
      headline: 'Amina is doing well.',
      focus: [{ title: 'Adding fractions', why: 'The tops and bottoms are added.', evidence: [{ label: 'Test 2 Q1', resultIds: [RESULT] }] }],
      lookingAhead: 'Next up is subtracting fractions.',
    })
    expect(out).toEqual({
      updated: true,
      dropped: [
        { field: 'headline', text: 'She is a gifted child.', reason: 'uses the word "gifted"' },
        { field: 'focus item 1 why', text: 'She is a slow learner and needs more time.', reason: 'uses the word "slow"' },
        { field: 'lookingAhead', text: 'She should become an engineer one day.', reason: 'uses the word "engineer"' },
      ],
    })
  })

  test('what it left out is on the tool log row of the call', async () => {
    const db = world()
    await plain(subjectGuidance, ctxOf(db), {
      childId: CHILD,
      guidance: { headline: 'Amina is doing well. She is gifted.', focus: [], lookingAhead: 'Next is subtracting fractions.' },
    })
    const row = lastCall(db, 'subject_guidance')
    expect(row.ok).toBe(true)
    expect(row.output).toEqual({ updated: true, dropped: [{ field: 'headline', text: 'She is gifted.', reason: 'uses the word "gifted"' }] })
  })

  test('a focus item whose title or reason is only a label goes, and the others stay', async () => {
    const db = world()
    const out = await plain(subjectGuidance, ctxOf(db), {
      childId: CHILD,
      guidance: {
        headline: 'Amina is doing well.',
        focus: [item('Adding fractions', 'The tops and bottoms are added.'), item('A weak learner', 'Needs help.'), item('Decimals', 'A lazy child.')],
        lookingAhead: 'Next is subtracting fractions.',
      },
    })
    expect(saved(db).focus.map((f) => f.title)).toEqual(['Adding fractions'])
    expect(out.dropped!.map((d) => d.field)).toEqual(['focus item 2 title', 'focus item 2', 'focus item 3 why', 'focus item 3'])
  })

  test('a headline that is only a label refuses the save, with a plain error, and nothing is written', async () => {
    const db = world()
    await expect(
      plain(subjectGuidance, ctxOf(db), { childId: CHILD, guidance: { headline: 'A gifted child.', focus: [], lookingAhead: 'Next is subtracting fractions.' } }),
    ).rejects.toThrow(/Not saved: the headline had nothing left after leaving out a sentence that uses the word "gifted"/)
    expect(db.tables.guidance_cards).toEqual([])
    expect(db.tables.guidance_drafts).toEqual([])
    const row = lastCall(db, 'subject_guidance')
    expect(row.ok).toBe(false)
    expect(row.error).toMatch(/uses the word "gifted"/)
  })

  test('a clean card is saved exactly as before and the output has no dropped list', async () => {
    const db = world()
    const guidance = { headline: 'Amina is doing well. One thing to work on this week: adding fractions.', focus: [item('Adding fractions', 'Two papers show tops and bottoms added.')], lookingAhead: 'Next up is subtracting fractions.' }
    const out = await plain(subjectGuidance, ctxOf(db), { childId: CHILD, guidance })
    expect(out).toEqual({ updated: true })
    expect(saved(db)).toEqual(guidance)
  })

  test('a learner called Clever is not labelled by her own name, but the word about her still is', async () => {
    const db = world('Clever')
    const out = await plain(subjectGuidance, ctxOf(db), {
      childId: CHILD,
      guidance: { headline: 'Clever is doing well. Clever is a clever girl.', focus: [], lookingAhead: 'Next is subtracting fractions.' },
    })
    expect(saved(db).headline).toBe('Clever is doing well.')
    expect(out.dropped).toEqual([{ field: 'headline', text: 'Clever is a clever girl.', reason: 'uses the word "clever"' }])
  })

  test('a topic of the learner that holds a banned word is not a label', async () => {
    const db = world('Amina', 'Rank and file')
    const out = await plain(subjectGuidance, ctxOf(db), {
      childId: CHILD,
      guidance: { headline: 'Amina is doing well.', focus: [item('Rank and file', 'Two papers show a mix up.')], lookingAhead: 'Next is subtracting fractions.' },
    })
    expect(out).toEqual({ updated: true })
  })

  test('a learner of her own workspace gets the same check (the same tool)', async () => {
    const db = world()
    ;(db.tables.children![0] as Row).private_of = OTHER
    const out = await plain(subjectGuidance, ctxOf(db), {
      childId: CHILD,
      guidance: { headline: 'Amina is doing well. She is the top of the class.', focus: [], lookingAhead: 'Next is subtracting fractions.' },
    })
    expect(saved(db, 'guidance_cards').headline).toBe('Amina is doing well.')
    expect(db.tables.guidance_drafts).toEqual([])
    expect(out.dropped).toHaveLength(1)
  })
})

describe('save_lesson leaves out a sentence that speaks about the learner with a label, and never touches the maths', () => {
  const question = (difficulty: 1 | 2 | 3, i: number, over: Partial<Question> = {}): Question => ({
    prompt: `1/2 + 1/4 (${difficulty}.${i})`,
    render: 'text',
    answer: '3/4',
    answerKind: 'fraction',
    difficulty,
    why: 'The pieces must be the same size first.',
    rightWay: 'Make quarters: 2/4 + 1/4 = 3/4.',
    ...over,
  })
  const lessonOf = (format: 'audio' | 'reading', over: Partial<Lesson> = {}, questions?: Question[]): Lesson => {
    const all = questions ?? ([1, 2, 3] as const).flatMap((d) => [0, 1, 2, 3, 4].map((i) => question(d, i)))
    const base = { format, title: 'Adding fractions', minutes: 12, warmup: [question(1, 90), question(1, 91)], questions: all }
    return format === 'audio'
      ? { ...base, audio: { script: 'Hello Amina. Today we add fractions.' }, ...over }
      : { ...base, cards: [{ heading: 'Same size pieces', body: 'Make quarters first.' }], ...over }
  }
  const world = (format: string, firstName = 'Amina') =>
    memoryDb({
      children: [{ id: CHILD, school_id: SCHOOL, first_name: firstName }],
      sessions: [{ id: SESSION, child_id: CHILD, lesson_id: null, topic_id: null, topic_name: 'Adding fractions', format }],
      lessons: [],
      activity_log: [],
      tool_calls: [],
    })
  const stored = (db: MemoryDb) => db.tables.lessons![0]!.content as Lesson

  test('the spoken script: it drops "gifted" and "slow learner" sentences that name or address the learner, and keeps the greeting and the maths', async () => {
    const db = world('audio')
    const lesson = lessonOf('audio', {
      audio: { script: 'Hello Amina. You are so gifted. Today we add fractions. Thabo is a slow learner. First make the pieces the same size. You should become an engineer one day.' },
    })
    const out = await plain(saveLesson, ctxOf(db), { sessionId: SESSION, lesson })
    expect(stored(db).audio!.script).toBe('Hello Amina. Today we add fractions. First make the pieces the same size.')
    expect(out.dropped).toEqual([
      { field: 'spoken script', text: 'You are so gifted.', reason: 'uses the word "gifted"' },
      { field: 'spoken script', text: 'Thabo is a slow learner.', reason: 'uses the word "slow"' },
      { field: 'spoken script', text: 'You should become an engineer one day.', reason: 'uses the word "engineer"' },
    ])
    expect(lastCall(db, 'save_lesson').output).toMatchObject({ dropped: [{ field: 'spoken script' }, { field: 'spoken script' }, { field: 'spoken script' }] })
  })

  test('a maths line with "clever trick" is kept, and so are "top and bottom of", "slow down" and "the track"', async () => {
    const db = world('reading')
    const questions = ([1, 2, 3] as const).flatMap((d) => [0, 1, 2, 3, 4].map((i) => question(d, i)))
    questions[0] = question(1, 0, { rightWay: 'Use a clever trick: double the top and the bottom of one half.', why: 'Slow down: the pieces must match.' })
    questions[1] = question(1, 1, { prompt: 'The track is 3/4 km. A doctor and an engineer walk 1/4 km more. How far is that?' })
    const lesson = lessonOf('reading', { cards: [{ heading: 'A clever trick', body: 'Here is a clever trick. Multiply the top and bottom of one half by two.' }] }, questions)
    const out = await plain(saveLesson, ctxOf(db), { sessionId: SESSION, lesson })
    expect(out.dropped).toBeUndefined()
    expect(stored(db)).toEqual(lesson)
  })

  test('a label in a question\'s feedback is dropped when it names the learner or says you, and the other sentences stay', async () => {
    const db = world('reading')
    const questions = ([1, 2, 3] as const).flatMap((d) => [0, 1, 2, 3, 4].map((i) => question(d, i)))
    questions[2] = question(1, 2, { why: 'The pieces must match. You are slow at this.', rightWay: 'Make quarters first. Amina is smart.' })
    const out = await plain(saveLesson, ctxOf(db), { sessionId: SESSION, lesson: lessonOf('reading', {}, questions) })
    expect(stored(db).questions[2]).toMatchObject({ why: 'The pieces must match.', rightWay: 'Make quarters first.' })
    expect(out.dropped!.map((d) => d.field)).toEqual(['question 3 why', 'question 3 right way'])
  })

  test('a card whose text is only a label goes, and the others stay', async () => {
    const db = world('reading')
    const lesson = lessonOf('reading', {
      cards: [
        { heading: 'Same size pieces', body: 'Make quarters first.' },
        { heading: 'For you', body: 'You are a genius.' },
        { heading: 'Add the tops', body: 'Now add the tops. You are a lazy learner.' },
      ],
    })
    const out = await plain(saveLesson, ctxOf(db), { sessionId: SESSION, lesson })
    expect(stored(db).cards).toEqual([
      { heading: 'Same size pieces', body: 'Make quarters first.' },
      { heading: 'Add the tops', body: 'Now add the tops.' },
    ])
    expect(out.dropped!.map((d) => d.field)).toEqual(['card 2 text', 'card 2', 'card 3 text'])
  })

  test('a script that is only labels refuses the save, with a plain error, and no lesson is written', async () => {
    const db = world('audio')
    const lesson = lessonOf('audio', { audio: { script: 'You are a genius.' } })
    await expect(plain(saveLesson, ctxOf(db), { sessionId: SESSION, lesson })).rejects.toThrow(/Not saved: the spoken script had nothing left after leaving out a sentence that uses the word "genius"/)
    expect(db.tables.lessons![0]!.content).toEqual({})
  })

  test('a lesson with nothing to leave out is saved as it was and the output has no dropped list', async () => {
    const db = world('audio')
    const lesson = lessonOf('audio')
    const out = await plain(saveLesson, ctxOf(db), { sessionId: SESSION, lesson })
    expect(out.dropped).toBeUndefined()
    expect(stored(db)).toEqual(lesson)
  })

  test('a learner called Bright: "Hello Bright" is kept, "You are bright" is not', async () => {
    const db = world('audio', 'Bright')
    const lesson = lessonOf('audio', { audio: { script: 'Hello Bright. You are bright. Today we add fractions.' } })
    await plain(saveLesson, ctxOf(db), { sessionId: SESSION, lesson })
    expect(stored(db).audio!.script).toBe('Hello Bright. Today we add fractions.')
  })

  test('a learner of her own workspace gets the same check (the same tool)', async () => {
    const db = world('audio')
    ;(db.tables.children![0] as Row).private_of = OTHER
    const lesson = lessonOf('audio', { audio: { script: 'Hello Amina. You are lazy. Today we add fractions.' } })
    const out = await plain(saveLesson, ctxOf(db), { sessionId: SESSION, lesson })
    expect(stored(db).audio!.script).toBe('Hello Amina. Today we add fractions.')
    expect(out.dropped).toHaveLength(1)
  })
})

describe('class_gap_report leaves out a sentence about learners that carries a label', () => {
  const reteach = { title: 'Adding fractions', minutes: 10, audience: 'Amina, Thabo and Sipho', youNeed: 'Fraction strips', steps: [{ minutes: 10, text: 'Lay two quarter strips on top of the half.' }], exitQuestion: 'What is 1/3 + 1/6?' }
  const world = () =>
    memoryDb({
      classes: [{ id: CLASS, school_id: SCHOOL, teacher_id: OTHER, subject: 'Mathematics', grade: 6 }],
      tests: [{ id: TEST, class_id: CLASS }],
      papers: [{ id: PAPER, test_id: TEST, status: 'marked', child_id: CHILD }],
      children: [
        { id: CHILD, school_id: SCHOOL, first_name: 'Amina' },
        { id: OTHER, school_id: SCHOOL, first_name: 'Thabo' },
      ],
      enrolments: [
        { class_id: CLASS, child_id: CHILD, created_at: '2026-01-01T00:00:00Z' },
        { class_id: CLASS, child_id: OTHER, created_at: '2026-01-01T00:00:00Z' },
      ],
      curriculum_maps: [{ id: MAP, class_id: CLASS }],
      topics: [{ id: TOPIC, map_id: MAP, name: 'Adding fractions', term: 1, position: 1 }],
      question_results: [
        { id: RESULT, paper_id: PAPER, child_id: CHILD, n: 1, prompt: '1/2 + 1/4', answer_read: '2/6', correct: false, topic_name: 'Adding fractions', gap_topic_id: TOPIC, misconception: 'Adds the tops and the bottoms' },
      ],
      reteach_plans: [],
      activity_log: [],
      tool_calls: [],
    })
  const plan = (db: MemoryDb) => db.tables.reteach_plans![0] as { why: string; explanation: string | null; content: { audience: string; steps: { text: string }[] } }

  test('it drops "slow learner", "gifted" and "should become an engineer" from the lines about learners, keeps the rest, and says what it left out', async () => {
    const db = world()
    const out = await plain(classGapReport, ctxOf(db), {
      classId: CLASS,
      testId: TEST,
      why: 'They add the tops and the bottoms. Thabo is a slow learner.',
      reteach: { ...reteach, audience: 'Amina, who is gifted. The group of Thabo and Sipho.' },
      missingBasic: 'Equivalent fractions',
      explanation: 'Make the bottoms match first. Amina should become an engineer.',
    })
    expect(plan(db)).toMatchObject({
      why: 'They add the tops and the bottoms.',
      explanation: 'Make the bottoms match first.',
      content: { audience: 'The group of Thabo and Sipho.' },
    })
    expect(out.dropped).toEqual([
      { field: 'why', text: 'Thabo is a slow learner.', reason: 'uses the word "slow"' },
      { field: 'explanation', text: 'Amina should become an engineer.', reason: 'uses the word "engineer"' },
      { field: 'audience', text: 'Amina, who is gifted.', reason: 'uses the word "gifted"' },
    ])
    expect(lastCall(db, 'class_gap_report').output).toMatchObject({ dropped: [{ field: 'why' }, { field: 'explanation' }, { field: 'audience' }] })
  })

  test('the reteach steps are maths: "on top of" is not a ranking', async () => {
    const db = world()
    const out = await plain(classGapReport, ctxOf(db), { classId: CLASS, testId: TEST, why: 'They add the tops and the bottoms.', reteach, explanation: 'Make the bottoms match first.' })
    expect(out.dropped).toBeUndefined()
    expect(plan(db).content.steps[0]!.text).toBe('Lay two quarter strips on top of the half.')
  })

  test('an explanation that is only a label becomes empty, and the report is still saved', async () => {
    const db = world()
    const out = await plain(classGapReport, ctxOf(db), { classId: CLASS, testId: TEST, why: 'They add the tops and the bottoms.', reteach, explanation: 'Amina is a slow learner.' })
    expect(plan(db).explanation).toBeNull()
    expect(out.dropped).toHaveLength(1)
  })

  test('a why that is only a label refuses the save, with a plain error, and nothing is written', async () => {
    const db = world()
    await expect(plain(classGapReport, ctxOf(db), { classId: CLASS, testId: TEST, why: 'Thabo is a slow learner.', reteach })).rejects.toThrow(
      /Not saved: the why line had nothing left after leaving out a sentence that uses the word "slow"/,
    )
    expect(db.tables.reteach_plans).toEqual([])
    expect(lastCall(db, 'class_gap_report').ok).toBe(false)
  })

  test('a learner called Smart is not labelled by his own name', async () => {
    const db = world()
    ;(db.tables.children![1] as Row).first_name = 'Smart'
    const out = await plain(classGapReport, ctxOf(db), { classId: CLASS, testId: TEST, why: 'Smart adds the tops and the bottoms.', reteach: { ...reteach, audience: 'Amina and Smart' } })
    expect(out.dropped).toBeUndefined()
    expect(plan(db).why).toBe('Smart adds the tops and the bottoms.')
  })

  test('a test with no gap writes nothing and refuses nothing', async () => {
    const db = world()
    db.tables.question_results = []
    const out = await plain(classGapReport, ctxOf(db), { classId: CLASS, testId: TEST, why: '', reteach: { ...reteach, title: '', audience: '', steps: [], exitQuestion: '' } })
    expect(out).toEqual({ gaps: [], reteachId: null })
  })
})
