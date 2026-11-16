// @vitest-environment node
import type { Question } from '@jemma/profiling/schemas'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AMINA_LESSON } from '../../../supabase/seed/fixtures/marked-state'

// P151: the server tells the screen a learner is young (Grade 1 to 6) from the grade of the session's child, read in the one query that loads the session (an
// embedded `children(grade)`, no second round trip). The flag is on every question the server hands the screen: the first one, the next one, the paper sheet.
// The database, the learner and the agent are stand-ins.

const state = vi.hoisted(() => ({
  lesson: null as unknown,
  children: undefined as unknown,
  inserted: [] as Record<string, unknown>[],
}))

vi.mock('@/lib/agent', () => ({ sendEvent: vi.fn(async () => 'event') }))
vi.mock('@/lib/topics', () => ({ loadShortLabels: async () => (name: string) => name }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServer: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'learner-1' } } }) },
    from: (table: string) => {
      const row =
        table === 'sessions'
          ? {
              id: 's1',
              child_id: 'c1',
              status: 'in_progress',
              lesson_id: 'l1',
              warmup: [],
              topic_id: null,
              topic_name: 'Number patterns',
              question_count: 5,
              right: null,
              minutes: null,
              finished_at: null,
              ...(state.children === undefined ? {} : { children: state.children }),
            }
          : { id: 'l1', topic_id: null, topic_name: 'Number patterns', content: state.lesson, audio_path: null }
      const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: row, error: null }) }
      return chain
    },
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdmin: () => ({
    from: (table: string) => {
      if (table === 'session_items') {
        return {
          select: () => ({ eq: async () => ({ data: [], error: null }) }),
          insert: async (row: Record<string, unknown>) => (state.inserted.push(row), { error: null }),
        }
      }
      // `events` (the paper photo) is read inside a try: a stand-in that throws is "no photo".
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

import { answer, beginSession } from '../app/k/session/[sessionId]/actions'

const PATTERN: Partial<Question> = { prompt: 'What are the next three numbers? 2, 4, 6, 8, ...', answer: '10; 12; 14', answerKind: 'list', ordered: true }

/** The lesson of the seed with every try question replaced by `q` (the paper sheet needs five of them) and no warm-up. */
function lessonOf(q: Partial<Question>) {
  // Each question has its own prompt: the server never asks the same prompt twice in a run.
  const questions = AMINA_LESSON.questions.map((x, i) => ({ ...x, render: 'text' as const, terms: undefined, ...q, prompt: `${q.prompt} (${i + 1})` }))
  return { ...AMINA_LESSON, format: 'reading' as const, cards: [{ heading: 'h', body: 'b' }], diagram: undefined, audio: undefined, warmup: [], questions }
}

beforeEach(() => {
  state.inserted = []
  state.lesson = lessonOf(PATTERN)
  state.children = undefined
})

describe('answer: the next question carries the flag of a young learner', () => {
  it.each([1, 3, 6])('a child of Grade %i: the next question is young', async (grade) => {
    state.children = { grade }
    const { next } = await answer('s1', 1, '10; 12; 14', 4)
    expect(next?.young).toBe(true)
  })

  it.each([7, 10, 12])('a child of Grade %i: no flag', async (grade) => {
    state.children = { grade }
    const { next } = await answer('s1', 1, '10; 12; 14', 4)
    expect(next).not.toBeNull()
    expect(next).not.toHaveProperty('young')
  })

  it('a child whose grade could not be read (no row, no grade, a grade that is not a number) is not young', async () => {
    for (const children of [undefined, null, {}, { grade: null }, { grade: 'six' }, [{ grade: 3 }]]) {
      state.children = children
      state.inserted = []
      const { next } = await answer('s1', 1, '10; 12; 14', 4)
      expect(next, JSON.stringify(children)).not.toHaveProperty('young')
    }
  })

  it('the answer is marked as it always was, whoever the learner is', async () => {
    state.children = { grade: 3 }
    await answer('s1', 1, '10; 12; 14', 4)
    expect(state.inserted[0]).toMatchObject({ answer: '10; 12; 14', correct: true })
  })

  it('a repeated tap on an answer already saved hands back the same question with the flag', async () => {
    state.children = { grade: 4 }
    const again = await answer('s1', 0, '10; 12; 14', 4).catch((e: Error) => e)
    // Position 0 is before the current question (1): the server shows where the child is now, flagged.
    expect(again).toMatchObject({ next: { young: true } })
  })
})

describe('beginSession: the first question and the paper sheet carry the flag', () => {
  it('a child of Grade 2: the first question and every question of the sheet are young', async () => {
    state.children = { grade: 2 }
    const { lesson } = await beginSession('s1')
    expect(lesson.first?.young).toBe(true)
    expect(lesson.paper?.length).toBeGreaterThan(0)
    for (const q of lesson.paper ?? []) expect(q.young).toBe(true)
  })

  it('a child of Grade 9: none of them has it', async () => {
    state.children = { grade: 9 }
    const { lesson } = await beginSession('s1')
    expect(lesson.first).not.toBeNull()
    expect(lesson.first).not.toHaveProperty('young')
    for (const q of lesson.paper ?? []) expect(q).not.toHaveProperty('young')
  })

  it('never sends the key to a young learner', async () => {
    state.children = { grade: 2 }
    const { lesson } = await beginSession('s1')
    expect(JSON.stringify(lesson)).not.toContain('10; 12; 14')
  })
})
