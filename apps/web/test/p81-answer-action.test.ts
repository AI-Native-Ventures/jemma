// @vitest-environment node
import type { Question } from '@jemma/profiling/schemas'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AMINA_LESSON } from '../../../supabase/seed/fixtures/marked-state'

// The server action that takes one typed answer. The database, the signed-in learner and the agent are stand-ins:
// the point is that the server completes and marks the answer from the stored question, whatever the browser sent.

const state = vi.hoisted(() => ({
  lesson: null as unknown,
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
          ? { id: 's1', child_id: 'c1', status: 'in_progress', lesson_id: 'l1', warmup: [], topic_id: null, topic_name: 'Equivalent fractions', question_count: 5, right: null, minutes: null }
          : { id: 'l1', topic_id: null, topic_name: 'Equivalent fractions', content: state.lesson, audio_path: null }
      const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: row, error: null }) }
      return chain
    },
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdmin: () => ({
    from: (table: string) => {
      if (table !== 'session_items') throw new Error(`unexpected table ${table}`)
      return {
        select: () => ({ eq: async () => ({ data: [], error: null }) }),
        insert: async (row: Record<string, unknown>) => (state.inserted.push(row), { error: null }),
      }
    },
  }),
}))

import { answer } from '../app/k/session/[sessionId]/actions'

/** The lesson of the seed, with its first middle-level question replaced by the one under test (the first try question at level 2). */
function withFirstTry(q: Partial<Question>) {
  let swapped = false
  const questions = AMINA_LESSON.questions.map((x) => {
    if (swapped || x.difficulty !== 2) return x
    swapped = true
    return { ...x, render: 'text' as const, terms: undefined, answerKind: 'fraction' as const, ...q }
  })
  return { ...AMINA_LESSON, warmup: [], questions }
}

beforeEach(() => {
  state.inserted = []
})

describe('answer: a missing number typed in the question', () => {
  const missing = { prompt: 'Complete: 3/5 = ?/15', answer: '9/15' }

  it('"9" is completed to "9/15" from the stored question, stored so, and marked right', async () => {
    state.lesson = withFirstTry(missing)
    await answer('s1', 1, '9', 4)
    expect(state.inserted).toHaveLength(1)
    expect(state.inserted[0]).toMatchObject({ session_id: 's1', phase: 'try', answer: '9/15', correct: true })
  })

  it('the whole fraction from a browser that already completed it gives the same row', async () => {
    state.lesson = withFirstTry(missing)
    await answer('s1', 1, '9/15', 4)
    expect(state.inserted[0]).toMatchObject({ answer: '9/15', correct: true })
  })

  it('"5" is wrong and is stored as "5/15"', async () => {
    state.lesson = withFirstTry(missing)
    await answer('s1', 1, '5', 4)
    expect(state.inserted[0]).toMatchObject({ answer: '5/15', correct: false })
  })

  it('a key that is only the number: the bare number is right, and the fraction is what is stored', async () => {
    state.lesson = withFirstTry({ ...missing, answer: '9' })
    await answer('s1', 1, '9', 4)
    expect(state.inserted[0]).toMatchObject({ answer: '9/15', correct: true })
  })
})

describe('answer: every other question is stored and marked as before', () => {
  it('a fraction that is not a missing part', async () => {
    state.lesson = withFirstTry({ prompt: 'Which fraction is bigger: 1/2 or 1/4?', answer: '1/2' })
    await answer('s1', 1, '1/2', 4)
    expect(state.inserted[0]).toMatchObject({ answer: '1/2', correct: true })
  })

  it('a wrong fraction', async () => {
    state.lesson = withFirstTry({ prompt: 'Which fraction is bigger: 1/2 or 1/4?', answer: '1/2' })
    await answer('s1', 1, '1/4', 4)
    expect(state.inserted[0]).toMatchObject({ answer: '1/4', correct: false })
  })

  it('an empty answer is still refused', async () => {
    state.lesson = withFirstTry({})
    await expect(answer('s1', 1, '   ', 4)).rejects.toThrow('Write an answer first')
    expect(state.inserted).toHaveLength(0)
  })
})
