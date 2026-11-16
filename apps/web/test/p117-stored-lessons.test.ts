// @vitest-environment node
import { StoredLessonSchema, type Lesson, type Question } from '@jemma/profiling/schemas'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextInSequence, type StoredItem } from '../app/k/session/[sessionId]/logic'
import { fakeDb } from './p89-fake-db'

// P117: a lesson that was saved with fewer than 15 questions (`save_lesson` with `dropInvalid` keeps each level at 4 or more, a warm-up may be 1)
// opens on every screen that reads it: the session, the learner's home and the parent's page of a learner. The database and the signed-in learner
// are stand-ins. No network, no model.

const state = vi.hoisted(() => ({
  session: {} as Record<string, unknown>,
  lesson: null as unknown,
  tables: {} as Record<string, Record<string, unknown>[]>,
}))

vi.mock('@/lib/agent', () => ({ sendEvent: vi.fn(async () => 'event') }))
vi.mock('@/lib/topics', () => ({ loadShortLabels: async () => (name: string) => name, classIdsOfChild: async () => [] }))
vi.mock('@/lib/supabase/server', async () => {
  const { fakeDb: fake } = await import('./p89-fake-db')
  return {
    createSupabaseServer: async () => {
      // The learner's own client for the session screen, and for the loaders that read a fake table.
      const db = fake(state.tables, { userId: 'user-1' }) as unknown as { from: (table: string) => unknown; auth: unknown }
      return {
        auth: db.auth,
        from: (table: string) => {
          if (table === 'sessions' && state.lesson !== null) {
            const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: state.session, error: null }) }
            return chain
          }
          if (table === 'lessons' && state.lesson !== null) {
            const row = { id: 'l1', topic_id: null, topic_name: 'Equivalent fractions', content: state.lesson, audio_path: null }
            const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: row, error: null }) }
            return chain
          }
          return db.from(table)
        },
      }
    },
  }
})
vi.mock('@/lib/supabase/admin', () => {
  const answer = (data: unknown): unknown => {
    const chain: unknown = new Proxy(() => undefined, {
      get: (_t, prop) => (prop === 'then' ? (resolve: (v: unknown) => unknown) => resolve({ data, error: null }) : () => chain),
    })
    return chain
  }
  return { createSupabaseAdmin: () => ({ from: () => answer([]), storage: { from: () => ({ createSignedUrl: async () => ({ data: null }) }) } }) }
})

import { beginSession } from '../app/k/session/[sessionId]/actions'
import { tonightFrom } from '../lib/data/p27'
import { getLearnerDetailExtras } from '../lib/data/p33'

type Level = 1 | 2 | 3
const question = (difficulty: Level, i: number): Question => ({
  prompt: `1/2 + 1/4 (${difficulty}.${i})`,
  render: 'text',
  answer: '3/4',
  answerKind: 'fraction',
  difficulty,
  why: 'The pieces must be the same size first.',
  rightWay: 'Make quarters: 2/4 + 1/4 = 3/4.',
})
const lessonOf = (perLevel: [number, number, number], warmup = 1): Lesson => ({
  format: 'reading',
  title: 'Adding fractions',
  minutes: 12,
  cards: [{ heading: 'Same size pieces', body: 'Make quarters first.' }],
  warmup: Array.from({ length: warmup }, (_, i) => question(1, 90 + i)),
  questions: ([1, 2, 3] as const).flatMap((d) => Array.from({ length: perLevel[d - 1]! }, (_, i) => question(d, i))),
})

/** What `save_lesson` with `dropInvalid` can leave: 15, 14, 13 and 12 questions, with a warm-up of 0, 1 or 2. */
const SAVED: { name: string; lesson: Lesson }[] = [
  { name: '15 questions, a warm-up of 2', lesson: lessonOf([5, 5, 5], 2) },
  { name: '14 questions, a warm-up of 1', lesson: lessonOf([5, 5, 4], 1) },
  { name: '13 questions, a warm-up of 1', lesson: lessonOf([5, 4, 4], 1) },
  { name: '12 questions, a warm-up of 1', lesson: lessonOf([4, 4, 4], 1) },
  { name: '12 questions, no warm-up', lesson: lessonOf([4, 4, 4], 0) },
]

const baseSession = { id: 's1', child_id: 'c1', status: 'in_progress', lesson_id: 'l1', warmup: [], topic_id: null, topic_name: 'Equivalent fractions', question_count: 5, right: null, minutes: null }

beforeEach(() => {
  state.session = { ...baseSession }
  state.lesson = null
  state.tables = {}
})

describe('the session screen opens a lesson saved with fewer than 15 questions', () => {
  for (const { name, lesson } of SAVED) {
    it(`${name}: beginSession hands the child the lesson, five try questions and the warm-up there is`, async () => {
      state.lesson = lesson
      const { lesson: handed } = await beginSession('s1')
      expect(handed.title).toBe('Adding fractions')
      expect(handed.warmupCount).toBe(lesson.warmup.length)
      expect(handed.tryCount).toBe(5)
      // the first thing asked is the warm-up when there is one, else the first try question
      expect(handed.first?.phase).toBe(lesson.warmup.length ? 'warmup' : 'try')
      // the paper sheet still has its five questions (two easy, two middle, one hard)
      expect(handed.paper).toHaveLength(5)
      expect(JSON.stringify(handed)).not.toContain('"rightWay"')
    })
  }

  it('a lesson that no reader can use still says so (a level with fewer than 4)', async () => {
    state.lesson = lessonOf([3, 5, 5])
    await expect(beginSession('s1')).rejects.toThrow('The lesson could not be loaded')
  })
})

describe('the session picks its five try questions from what is there', () => {
  const answerWith = (lesson: Lesson, pattern: (n: number) => boolean) => {
    const items: StoredItem[] = []
    const asked: Question[] = []
    for (let guard = 0; guard < 30; guard++) {
      const next = nextInSequence(lesson.warmup, lesson.questions, 5, items)
      if (!next) break
      asked.push(next.question)
      const n = items.filter((i) => i.phase === 'try').length
      items.push({
        phase: next.phase,
        position: next.index,
        question: next.question,
        answer: '3/4',
        correct: pattern(n),
        difficulty: next.question.difficulty,
        seconds: 5,
      })
    }
    return { asked, tries: asked.filter((_, i) => i >= lesson.warmup.length) }
  }

  for (const { name, lesson } of SAVED) {
    it(`${name}: five distinct try questions, whether the child gets them right, wrong or both`, () => {
      for (const pattern of [() => true, () => false, (n: number) => n % 2 === 0]) {
        const { asked, tries } = answerWith(lesson, pattern)
        expect(tries).toHaveLength(5)
        expect(new Set(tries.map((q) => q.prompt)).size).toBe(5)
        expect(asked).toHaveLength(lesson.warmup.length + 5)
      }
    })
  }

  it('a warm-up of 1 is asked once, before the try questions', () => {
    const lesson = lessonOf([4, 4, 4], 1)
    const { asked } = answerWith(lesson, () => true)
    expect(asked[0]!.prompt).toBe(lesson.warmup[0]!.prompt)
    expect(asked.filter((q) => lesson.warmup.some((w) => w.prompt === q.prompt))).toHaveLength(1)
  })
})

describe("the learner's home and the parent's page of a learner open it too", () => {
  const sessionOf = (lesson_id: string | null) => [{ id: 's1', planned_for: '2026-11-16', lesson_id, topic_name: null, planned_minutes: null, format: null }]

  for (const { name, lesson } of SAVED) {
    it(`${name}: the home names the lesson and shows its picture slot (the lesson was read)`, async () => {
      const db = fakeDb({ lessons: [{ id: 'l1', content: lesson }] }, { userId: 'u1' })
      const tonight = await tonightFrom(db, sessionOf('l1') as never, null, '2026-11-16')
      // topic_name and planned_minutes are empty, so these come from the stored lesson: they are only there when it was read
      expect(tonight).toMatchObject({ sessionId: 's1', topic: 'Adding fractions', minutes: 12, format: 'reading' })
    })

    it(`${name}: the parent's page of the learner names tonight's lesson by its title`, async () => {
      state.tables = {
        attendance: [],
        gaps: [],
        sessions: [{ child_id: 'c1', status: 'planned', topic_name: 'Equivalent fractions', format: 'reading', planned_minutes: 12, created_at: '2026-11-15T10:00:00.000Z', lessons: { content: lesson } }],
      }
      const { tonight } = await getLearnerDetailExtras('c1')
      expect(tonight?.title).toBe('Adding fractions')
    })
  }

  it('every lesson of this list is one the stored schema opens (and so the three readers use the same rule)', () => {
    for (const { name, lesson } of SAVED) expect(StoredLessonSchema.safeParse(lesson).success, name).toBe(true)
  })
})
