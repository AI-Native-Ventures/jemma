import type { TeachingBlock, TeachingLesson } from '@jemma/profiling/schemas'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// P142: the three server actions of a teaching lesson, with the learner, the stored lesson and the database as doubles: an answer is marked on the server,
// a lesson that is not there says so, the progress a learner writes is held to what the lesson allows. No database, no router, no model.

const state = vi.hoisted(() => ({ lesson: null as unknown, writes: [] as { table: string; row: Record<string, unknown>; options: unknown }[], fail: false, sessionHandover: false }))

vi.mock('../lib/data/p27', () => ({ myChild: async () => ({ supabase: {}, child: { id: 'child-1' } }) }))
vi.mock('../lib/data/teaching', () => ({
  storedLesson: async () => (state.lesson ? { lesson: state.lesson, source: { kind: 'none', title: '', credit: '' } } : null),
  underSessionHandover: async () => state.sessionHandover,
}))
vi.mock('../lib/supabase/admin', () => ({
  createSupabaseAdmin: () => ({
    from: (table: string) => ({
      upsert: async (row: Record<string, unknown>, options: unknown) => {
        state.writes.push({ table, row, options })
        return { error: state.fail ? { message: 'write failed' } : null }
      },
    }),
  }),
}))

import { answerLessonQuestion, finishTopicLesson, startTopicLesson } from '../app/k/learn/actions'

const q = (n: number, over: Record<string, unknown> = {}) => ({
  prompt: `Question ${n}`,
  render: 'text' as const,
  answer: String(n),
  answerKind: 'whole' as const,
  steps: [`step ${n}a`, `step ${n}b`],
  difficulty: 1 as const,
  why: `why ${n}`,
  rightWay: `way ${n}`,
  ...over,
})
const explain: TeachingBlock = { kind: 'explain', text: 'Text', speech: 'Speech' }
const lesson = (): TeachingLesson => ({
  position: 1,
  title: 'A lesson',
  minutes: 12,
  objectives: ['You will be able to one.', 'You will be able to two.'],
  keyWords: [],
  blocks: [explain, explain, explain, explain, explain, explain, { kind: 'try', question: q(40), hint: 'Hint', speech: 'Try' }, { kind: 'mistake', wrong: 'a', right: 'b', why: 'c', speech: 'd' }],
  summary: ['one', 'two', 'three'],
  practice: [1, 2, 3, 4, 5, 6].map((n) => q(n)),
})

beforeEach(() => {
  state.lesson = lesson()
  state.writes = []
  state.fail = false
  state.sessionHandover = false
})

describe('answerLessonQuestion', () => {
  it('marks a practice answer on the server and says the right answer, the steps and the right way', async () => {
    expect(await answerLessonQuestion('lesson-1', { kind: 'practice', index: 2 }, '3')).toEqual({ correct: true, answer: '3', steps: ['step 3a', 'step 3b'], rightWay: 'way 3', why: 'why 3' })
    expect((await answerLessonQuestion('lesson-1', { kind: 'practice', index: 2 }, '4')).correct).toBe(false)
  })

  it('marks the question of a try block by the place of the block', async () => {
    expect((await answerLessonQuestion('lesson-1', { kind: 'try', block: 6 }, '40')).correct).toBe(true)
    expect((await answerLessonQuestion('lesson-1', { kind: 'try', block: 6 }, '41')).correct).toBe(false)
  })

  it('does not take an empty answer, an answer longer than the marking reads, or a question that is not there', async () => {
    await expect(answerLessonQuestion('lesson-1', { kind: 'practice', index: 0 }, '   ')).rejects.toThrow('Write an answer first')
    await expect(answerLessonQuestion('lesson-1', { kind: 'practice', index: 0 }, '1'.repeat(61))).rejects.toThrow('Write an answer first')
    await expect(answerLessonQuestion('lesson-1', { kind: 'try', block: 0 }, '1')).rejects.toThrow('not in this lesson')
    await expect(answerLessonQuestion('lesson-1', { kind: 'practice', index: 6 }, '1')).rejects.toThrow('not in this lesson')
  })

  it('says so when the lesson is not there or not ready', async () => {
    state.lesson = null
    await expect(answerLessonQuestion('lesson-9', { kind: 'practice', index: 0 }, '1')).rejects.toThrow('not available')
  })
})

describe('startTopicLesson', () => {
  it('remembers the first start of the learner and leaves a later one alone', async () => {
    await startTopicLesson('lesson-1')
    expect(state.writes).toEqual([{ table: 'topic_lesson_progress', row: { child_id: 'child-1', topic_lesson_id: 'lesson-1' }, options: { onConflict: 'child_id,topic_lesson_id', ignoreDuplicates: true } }])
  })

  it('says so when the lesson is not there', async () => {
    state.lesson = null
    await expect(startTopicLesson('lesson-9')).rejects.toThrow('not available')
    expect(state.writes).toEqual([])
  })
})

describe('finishTopicLesson', () => {
  it('ticks the lesson with the practice score, the total being the lesson\'s own', async () => {
    await finishTopicLesson('lesson-1', 4, 999)
    expect(state.writes).toHaveLength(1)
    expect(state.writes[0]!.row).toMatchObject({ child_id: 'child-1', topic_lesson_id: 'lesson-1', practice_right: 4, practice_total: 6 })
    expect(typeof state.writes[0]!.row.finished_at).toBe('string')
    expect(state.writes[0]!.row).not.toHaveProperty('started_at')
  })

  it('holds the right count between none and all', async () => {
    await finishTopicLesson('lesson-1', 50, 6)
    await finishTopicLesson('lesson-1', -3, 6)
    await finishTopicLesson('lesson-1', Number.NaN, 6)
    expect(state.writes.map((w) => w.row.practice_right)).toEqual([6, 0, 0])
  })

  it('says so when the write fails', async () => {
    state.fail = true
    await expect(finishTopicLesson('lesson-1', 3, 6)).rejects.toThrow('write failed')
  })
})

describe('a parent\'s hand-over of one session', () => {
  it('does not open the lessons: no answer is marked and no progress is written for it', async () => {
    state.sessionHandover = true
    await expect(answerLessonQuestion('lesson-1', { kind: 'practice', index: 0 }, '1')).rejects.toThrow('not available')
    await expect(startTopicLesson('lesson-1')).rejects.toThrow('not available')
    await expect(finishTopicLesson('lesson-1', 3, 6)).rejects.toThrow('not available')
    expect(state.writes).toEqual([])
  })
})
