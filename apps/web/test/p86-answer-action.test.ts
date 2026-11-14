// @vitest-environment node
import type { Question } from '@jemma/profiling/schemas'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AMINA_LESSON } from '../../../supabase/seed/fixtures/marked-state'

// P86: the server action that takes one typed answer, for a question of a senior class. A question of the four new kinds (number, expression,
// equation, point) is stored as typed and marked by meaning; the old kinds are marked as before (see p81-answer-action.test.ts).
// The database, the signed-in learner and the agent are stand-ins.

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
          ? { id: 's1', child_id: 'c1', status: 'in_progress', lesson_id: 'l1', warmup: [], topic_id: null, topic_name: 'Algebra', question_count: 5, right: null, minutes: null }
          : { id: 'l1', topic_id: null, topic_name: 'Algebra', content: state.lesson, audio_path: null }
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

/** The lesson of the seed with its first middle-level question replaced by the one under test (the first try question at level 2). */
function withFirstTry(q: Partial<Question>) {
  let swapped = false
  const questions = AMINA_LESSON.questions.map((x) => {
    if (swapped || x.difficulty !== 2) return x
    swapped = true
    return { ...x, render: 'text' as const, terms: undefined, ...q }
  })
  return { ...AMINA_LESSON, warmup: [], questions }
}

beforeEach(() => {
  state.inserted = []
})

describe('answer: the four senior kinds are marked by meaning on the server', () => {
  const cases: [string, Partial<Question>, string, boolean][] = [
    ['an expression written in another order', { prompt: 'Simplify x + x + 3', answer: '2x + 3', answerKind: 'expression' }, '3 + 2x', true],
    ['an expression with a wrong number', { prompt: 'Simplify x + x + 3', answer: '2x + 3', answerKind: 'expression' }, '2x + 4', false],
    ['a power written with the little two', { prompt: 'Simplify x times x', answer: 'x^2', answerKind: 'expression' }, 'x²', true],
    ['the wrong form asked for', { prompt: 'Factorise x^2 - 4', answer: '(x+2)(x-2)', answerKind: 'expression', form: 'factorised' }, 'x^2 - 4', false],
    ['the right form asked for', { prompt: 'Factorise x^2 - 4', answer: '(x+2)(x-2)', answerKind: 'expression', form: 'factorised' }, '(x - 2)(x + 2)', true],
    ['both roots, in the other order', { prompt: 'Solve x^2 - 2x - 3 = 0', answer: 'x = 3 or x = -1', answerKind: 'equation' }, 'x = -1 or x = 3', true],
    ['one root of two', { prompt: 'Solve x^2 - 2x - 3 = 0', answer: 'x = 3 or x = -1', answerKind: 'equation' }, 'x = 3', false],
    ['a point with a comma between the numbers', { prompt: 'Where does it cut the y-axis?', answer: '(0; -3)', answerKind: 'point' }, '(0, -3)', true],
    ['a point turned round', { prompt: 'Where does it cut the y-axis?', answer: '(0; -3)', answerKind: 'point' }, '(-3; 0)', false],
    ['a negative number with the minus sign of a phone', { prompt: 'What is 3 - 6?', answer: '-3', answerKind: 'number' }, '\u22123', true],
    ['a negative number that lost its minus', { prompt: 'What is 3 - 6?', answer: '-3', answerKind: 'number' }, '3', false],
    ['a percent typed without its sign', { prompt: 'What percent is 3 of 20?', answer: '15%', answerKind: 'number' }, '15', true],
  ]
  it.each(cases)('%s', async (_name, q, typed, right) => {
    state.lesson = withFirstTry(q)
    await answer('s1', 1, typed, 4)
    expect(state.inserted).toHaveLength(1)
    expect(state.inserted[0]).toMatchObject({ session_id: 's1', phase: 'try', answer: typed, correct: right })
  })

  it('a prompt that holds a fraction with a missing part is not completed for a question marked by meaning', async () => {
    state.lesson = withFirstTry({ prompt: 'Complete: 3/5 = ?/15', answer: '9', answerKind: 'number' })
    await answer('s1', 1, '9', 4)
    expect(state.inserted[0]).toMatchObject({ answer: '9', correct: true })
  })

  it('the stored question keeps its kind and its form', async () => {
    state.lesson = withFirstTry({ prompt: 'Factorise x^2 - 4', answer: '(x+2)(x-2)', answerKind: 'expression', form: 'factorised' })
    await answer('s1', 1, '(x+2)(x-2)', 4)
    expect(state.inserted[0]!.question).toMatchObject({ answerKind: 'expression', form: 'factorised' })
  })

  it('an answer over 40 characters is still refused', async () => {
    state.lesson = withFirstTry({ prompt: 'Simplify', answer: 'x', answerKind: 'expression' })
    await expect(answer('s1', 1, 'x+'.repeat(21), 4)).rejects.toThrow('Write an answer first')
    expect(state.inserted).toHaveLength(0)
  })
})
