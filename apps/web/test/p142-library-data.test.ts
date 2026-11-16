import { beforeEach, describe, expect, it, vi } from 'vitest'

// P142: the reads of the teaching library that decide who sees what: a topic is the learner's only when it is in one of their classes, a session is theirs
// only when it is one of theirs, a lesson list is the ready lessons (newest version, lesson 1 present) by grade and by the name without "(Term N)", and
// a parent's hand-over of one session gets no lessons. The database is a small fake that filters rows the way the queries ask: no database, no server.

type Row = Record<string, unknown>
const state = vi.hoisted(() => ({
  childId: 'child-1',
  handover: null as null | { sessionId: string; childId: string },
  tables: {} as Record<string, Row[]>,
}))

function fakeDb(tables: Record<string, Row[]>) {
  return {
    from(name: string) {
      let rows = [...(tables[name] ?? [])]
      let cols = ''
      const shaped = () => (cols.includes('minutes:content->>minutes') ? rows.map((r) => ({ ...r, minutes: String((r.content as Row | undefined)?.minutes) })) : rows)
      const q = {
        select(c: string) {
          cols = c
          return q
        },
        eq(col: string, value: unknown) {
          rows = rows.filter((r) => r[col] === value)
          return q
        },
        in(col: string, values: unknown[]) {
          rows = rows.filter((r) => values.includes(r[col]))
          return q
        },
        maybeSingle: async () => ({ data: shaped()[0] ?? null, error: null }),
        then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve({ data: shaped(), error: null }).then(resolve, reject),
      }
      return q
    },
  }
}

vi.mock('../lib/supabase/admin', () => ({ createSupabaseAdmin: () => fakeDb(state.tables) }))
vi.mock('../lib/data/p27', () => ({ myChild: async () => ({ supabase: fakeDb(state.tables), child: { id: state.childId } }) }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => ({ value: 'cookie' }) }) }))
vi.mock('../lib/handover', () => ({ HANDOVER_COOKIE: 'jemma_handover', verifyHandover: async () => state.handover, isOwnHandover: (h: { sessionId: string } | null) => h?.sessionId === 'own' }))

import { libraryFor, libraryNames, resolveTopic, sessionLibrary, storedLesson, topicLesson, trialsFor } from '../lib/data/teaching'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const TOPIC_CF = id(1) // Grade 6 "Common fractions (Term 4)", class 6 (child 1)
const TOPIC_FN = id(2) // Grade 11 "Functions", class 11 (child 2 only)
const TOPIC_EQ = id(3) // Grade 6 "Equivalent fractions": the class 6B kind of name, no lessons
const TOPIC_TR = id(4) // Grade 6 "Trigonometry" whose lesson 1 failed
const S_ONE = id(11)
const S_OTHER = id(12)
const S_NO_TOPIC = id(13)
const S_EQ = id(14)
const L = (n: number) => id(100 + n)

const block = (kind: string) => {
  if (kind === 'try') return { kind, question: { prompt: 'Q', render: 'text', answer: 'SECRET-KEY', answerKind: 'whole', steps: ['SECRET-STEP', 'second'], difficulty: 1, why: 'SECRET-WHY', rightWay: 'SECRET-WAY' }, hint: 'Hint', speech: 'Speech' }
  if (kind === 'mistake') return { kind, wrong: 'w', right: 'r', why: 'y', speech: 'Speech' }
  if (kind === 'worked') return { kind, problem: 'p', steps: [{ line: 'a', reason: 'b' }, { line: 'c', reason: 'd' }], answer: 'WORKED', answerKind: 'whole', speech: 'Speech' }
  return { kind: 'explain', text: 'Text', speech: 'Speech' }
}
const content = (position: number, minutes = 14) => ({
  position,
  title: `Lesson ${position}`,
  minutes,
  objectives: ['You will be able to one.', 'You will be able to two.'],
  keyWords: [],
  blocks: ['explain', 'explain', 'worked', 'worked', 'worked', 'explain', 'try', 'mistake'].map(block),
  summary: ['one', 'two', 'three'],
  practice: [1, 2, 3, 4, 5].map((n) => ({ prompt: `P${n}`, render: 'text', answer: `PKEY-${n}`, answerKind: 'whole', difficulty: 1, why: 'w', rightWay: 'r' })),
})
const lessonRow = (n: number, grade: number, base: string, position: number, version = 1, status = 'ready', over: Row = {}): Row => ({
  id: L(n),
  grade,
  base_name: base,
  family: 'fractions',
  position,
  version,
  status,
  title: `${base} lesson ${position} v${version}`,
  content: content(position),
  source: { kind: 'siyavula', title: 'Everything Maths', credit: 'Based on Siyavula Everything Maths, Grade 6, fractions, CC BY 3.0' },
  ...over,
})

beforeEach(() => {
  state.childId = 'child-1'
  state.handover = null
  state.tables = {
    classes: [{ id: 'class-6', grade: 6 }, { id: 'class-11', grade: 11 }],
    enrolments: [{ child_id: 'child-1', class_id: 'class-6' }, { child_id: 'child-2', class_id: 'class-11' }],
    curriculum_maps: [{ id: 'map-6', class_id: 'class-6' }, { id: 'map-11', class_id: 'class-11' }],
    topics: [
      { id: TOPIC_CF, name: 'Common fractions (Term 4)', family: 'fractions', map_id: 'map-6' },
      { id: TOPIC_FN, name: 'Functions', family: 'functions', map_id: 'map-11' },
      { id: TOPIC_EQ, name: 'Equivalent fractions', family: 'fractions', map_id: 'map-6' },
      { id: TOPIC_TR, name: 'Trigonometry', family: 'shapes', map_id: 'map-6' },
    ],
    sessions: [
      { id: S_ONE, child_id: 'child-1', topic_id: TOPIC_CF },
      { id: S_OTHER, child_id: 'child-2', topic_id: TOPIC_FN },
      { id: S_NO_TOPIC, child_id: 'child-1', topic_id: null },
      { id: S_EQ, child_id: 'child-1', topic_id: TOPIC_EQ },
    ],
    topic_lessons: [
      lessonRow(1, 6, 'Common fractions', 1, 1),
      lessonRow(2, 6, 'Common fractions', 1, 2), // a newer version of lesson 1
      lessonRow(3, 6, 'Common fractions', 2, 1),
      lessonRow(4, 6, 'Common fractions', 3, 1, 'failed'),
      lessonRow(5, 11, 'Functions', 1, 1),
      lessonRow(6, 6, 'Trigonometry', 2, 1), // lesson 1 of this topic is not there
      lessonRow(7, 6, 'Trigonometry', 1, 1, 'failed'),
    ],
    topic_lesson_progress: [
      { child_id: 'child-1', topic_lesson_id: L(2), started_at: '2026-11-16T09:00:00Z', finished_at: '2026-11-16T09:20:00Z' },
      { child_id: 'child-1', topic_lesson_id: L(3), started_at: '2026-11-16T09:30:00Z', finished_at: null },
      { child_id: 'child-2', topic_lesson_id: L(1), started_at: '2026-11-16T09:00:00Z', finished_at: '2026-11-16T09:20:00Z' },
    ],
    format_trials: [
      { child_id: 'child-1', format: 'diagram', score: 4, topic_family: 'fractions' },
      { child_id: 'child-1', format: 'audio', score: 5, topic_family: 'functions' },
      { child_id: 'child-2', format: 'reading', score: 3, topic_family: 'fractions' },
    ],
  }
})

describe('resolveTopic: a topic is the learner\'s only when it is in one of their classes', () => {
  it('gives the name, the part of Mathematics and the grade of the class whose map it is in', async () => {
    expect(await resolveTopic(TOPIC_CF)).toEqual({ id: TOPIC_CF, name: 'Common fractions (Term 4)', family: 'fractions', grade: 6 })
  })

  it('gives nothing for a topic of a class the learner is not in', async () => {
    expect(await resolveTopic(TOPIC_FN)).toBeNull()
    state.childId = 'child-2'
    expect(await resolveTopic(TOPIC_FN)).toEqual({ id: TOPIC_FN, name: 'Functions', family: 'functions', grade: 11 })
    expect(await resolveTopic(TOPIC_CF)).toBeNull()
  })

  it('gives nothing for an id that is not a topic, or is not an id at all', async () => {
    expect(await resolveTopic(id(99))).toBeNull()
    expect(await resolveTopic('not-an-id')).toBeNull()
    expect(await resolveTopic("1' or '1'='1")).toBeNull()
  })
})

describe('libraryNames: the topics of a grade that have lessons', () => {
  it('holds the names whose first lesson is ready, for that grade only', async () => {
    expect([...(await libraryNames(6))]).toEqual(['Common fractions'])
    expect([...(await libraryNames(11))]).toEqual(['Functions'])
    expect([...(await libraryNames(8))]).toEqual([])
  })
})

describe('libraryFor: the lessons of a topic for this learner', () => {
  it('finds the lessons of "Common fractions (Term 4)" under the name without the term, newest version of each, with the learner\'s ticks', async () => {
    expect(await libraryFor(6, 'Common fractions (Term 4)')).toEqual([
      { id: L(2), position: 1, title: 'Common fractions lesson 1 v2', minutes: 14, done: true, started: true },
      { id: L(3), position: 2, title: 'Common fractions lesson 2 v1', minutes: 14, done: false, started: true },
    ])
  })

  it('never lists a lesson that failed its checks, and shows another learner\'s progress to nobody', async () => {
    const mine = await libraryFor(6, 'Common fractions')
    expect(mine.map((e) => e.position)).toEqual([1, 2])
    state.childId = 'child-2'
    expect((await libraryFor(6, 'Common fractions')).map((e) => [e.position, e.done, e.started])).toEqual([[1, false, false], [2, false, false]])
  })

  it('is empty for a topic with no lessons, a topic of another grade, and a topic whose lesson 1 is not ready', async () => {
    expect(await libraryFor(6, 'Equivalent fractions')).toEqual([])
    expect(await libraryFor(7, 'Common fractions')).toEqual([])
    expect(await libraryFor(6, 'Trigonometry')).toEqual([])
  })
})

describe('sessionLibrary: the lessons for the Learn step of a practice', () => {
  it('gives the lessons and the topic of the session of this learner', async () => {
    const lib = await sessionLibrary(S_ONE)
    expect(lib.topicId).toBe(TOPIC_CF)
    expect(lib.entries.map((e) => e.position)).toEqual([1, 2])
  })

  it('gives nothing for a session that is another learner\'s', async () => {
    expect(await sessionLibrary(S_OTHER)).toEqual({ topicId: null, entries: [] })
  })

  it('gives nothing for a session with no topic of the map, a topic with no lessons, or an id that is not one', async () => {
    expect(await sessionLibrary(S_NO_TOPIC)).toEqual({ topicId: null, entries: [] })
    expect(await sessionLibrary(S_EQ)).toEqual({ topicId: null, entries: [] })
    expect(await sessionLibrary('nope')).toEqual({ topicId: null, entries: [] })
  })

  it('gives nothing under a parent\'s hand-over of this one session (it cannot open the lessons), and gives the lessons under the own hand-over', async () => {
    state.handover = { sessionId: S_ONE, childId: 'child-1' }
    expect(await sessionLibrary(S_ONE)).toEqual({ topicId: null, entries: [] })
    state.handover = { sessionId: 'own', childId: 'child-1' }
    expect((await sessionLibrary(S_ONE)).topicId).toBe(TOPIC_CF)
  })
})

describe('storedLesson and topicLesson', () => {
  it('give the whole stored lesson to the server, and the lesson without any answer to the screen', async () => {
    const stored = await storedLesson(L(2))
    expect(stored?.lesson.practice[0]?.answer).toBe('PKEY-1')
    const shown = await topicLesson(L(2))
    expect(shown?.entry).toEqual({ id: L(2), position: 1, title: 'Lesson 1', minutes: 14, done: true, started: true })
    expect(shown?.source.credit).toContain('Siyavula Everything Maths')
    const text = JSON.stringify(shown?.lesson)
    for (const secret of ['SECRET-KEY', 'SECRET-STEP', 'SECRET-WHY', 'SECRET-WAY', 'PKEY-1', 'PKEY-5']) expect(text, secret).not.toContain(secret)
    // a worked example is shown, so its answer goes with it
    expect(text).toContain('WORKED')
  })

  it('give nothing for a lesson that failed its checks, is not there, is not an id, or does not hold a lesson', async () => {
    expect(await storedLesson(L(4))).toBeNull()
    expect(await topicLesson(L(4))).toBeNull()
    expect(await topicLesson(id(999))).toBeNull()
    expect(await topicLesson('nope')).toBeNull()
    state.tables.topic_lessons!.push(lessonRow(8, 6, 'Broken', 1, 1, 'ready', { content: { title: 'no blocks' } }))
    expect(await topicLesson(L(8))).toBeNull()
  })

  it('a lesson never opened by this learner has no tick and is not started', async () => {
    state.childId = 'child-2'
    expect((await topicLesson(L(3)))?.entry).toMatchObject({ done: false, started: false })
  })
})

describe('trialsFor: the formats the learner did best in', () => {
  it('gives the trials of the part of Mathematics when there are some', async () => {
    expect(await trialsFor('fractions')).toEqual([{ format: 'diagram', score: 4 }])
    expect(await trialsFor('functions')).toEqual([{ format: 'audio', score: 5 }])
  })

  it('gives every trial of the learner when the part has none, and none when the learner has none', async () => {
    expect(await trialsFor('shapes')).toEqual([{ format: 'diagram', score: 4 }, { format: 'audio', score: 5 }])
    state.childId = 'child-3'
    expect(await trialsFor('fractions')).toEqual([])
  })
})
