// @vitest-environment node
import type { Question } from '@jemma/profiling/schemas'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AMINA_LESSON } from '../../../supabase/seed/fixtures/marked-state'

// P150: the server action that takes one typed answer, for a list, an order and a table. The values are stored as typed and each is marked by meaning; an answer
// of these kinds may be longer than 60 characters (a table holds many values), any other kind may not. The database, the learner and the agent are stand-ins.

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
          ? { id: 's1', child_id: 'c1', status: 'in_progress', lesson_id: 'l1', warmup: [], topic_id: null, topic_name: 'Statistics', question_count: 5, right: null, minutes: null }
          : { id: 'l1', topic_id: null, topic_name: 'Statistics', content: state.lesson, audio_path: null }
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

describe('answer: a list, an order and a table are marked value by value on the server', () => {
  const list: Partial<Question> = { prompt: 'Write the five-number summary', answer: '2; 4; 5,5; 8; 10', answerKind: 'list', ordered: true, labels: ['min', 'Q1', 'median', 'Q3', 'max'] }
  const cases: [string, Partial<Question>, string, boolean][] = [
    ['a five-number summary, right', list, '2; 4; 5,5; 8; 10', true],
    ['a five-number summary with a point for the comma', list, '2; 4; 5.5; 8; 10', true],
    ['a five-number summary in the wrong places', list, '10; 8; 5,5; 4; 2', false],
    ['all the factors, in any order', { prompt: 'Write all the factors of 12', answer: '1; 2; 3; 4; 6; 12', answerKind: 'list', ordered: false }, '12; 6; 4; 3; 2; 1', true],
    ['all the factors, one missing', { prompt: 'Write all the factors of 12', answer: '1; 2; 3; 4; 6; 12', answerKind: 'list', ordered: false }, '12; 6; 4; 3; 2', false],
    ['fractions put in order', { prompt: 'Put in order, smallest first', answer: '1/4; 0,3; 1/2', answerKind: 'order' }, '1/4; 0,3; 1/2', true],
    ['fractions put in the wrong order', { prompt: 'Put in order, smallest first', answer: '1/4; 0,3; 1/2', answerKind: 'order' }, '1/2; 0,3; 1/4', false],
    ['a table, every cell right', { prompt: 'Complete the table', answer: '3; 5', answerKind: 'table', table: { columns: ['x', 'y'], rows: [['1', null], ['2', null]] } }, '3; 5', true],
    ['a table with one cell wrong', { prompt: 'Complete the table', answer: '3; 5', answerKind: 'table', table: { columns: ['x', 'y'], rows: [['1', null], ['2', null]] } }, '3; 6', false],
    ['a rounded answer', { prompt: 'Find the mean, correct to 1 decimal place', answer: '3,14159; 2,71828', answerKind: 'list', ordered: true, round: 1 }, '3,1; 2,7', true],
    ['a rounded answer, rounded the wrong way', { prompt: 'Find the mean, correct to 1 decimal place', answer: '3,14159; 2,71828', answerKind: 'list', ordered: true, round: 1 }, '3,14; 2,72', false],
  ]
  it.each(cases)('%s', async (_name, q, typed, right) => {
    state.lesson = withFirstTry(q)
    await answer('s1', 1, typed, 4)
    expect(state.inserted).toHaveLength(1)
    expect(state.inserted[0]).toMatchObject({ session_id: 's1', phase: 'try', answer: typed, correct: right })
  })

  it('the stored question keeps its kind and its table', async () => {
    const table = { columns: ['x', 'y'], rows: [['1', null]] }
    state.lesson = withFirstTry({ prompt: 'Complete the table', answer: '3', answerKind: 'table', table })
    await answer('s1', 1, '3', 4)
    expect(state.inserted[0]!.question).toMatchObject({ answerKind: 'table', table })
  })

  it('a table answer of more than 60 characters is taken (a table holds many values)', async () => {
    // 4 rows, each with a given first cell and 3 blanks: 12 values.
    const rows = Array.from({ length: 4 }, (_, r) => [`r${r}`, null, null, null])
    const twelve = Array.from({ length: 12 }, (_, i) => String(1000 + i)).join('; ')
    expect(twelve.length).toBeGreaterThan(60)
    state.lesson = withFirstTry({ prompt: 'Complete the table', answer: twelve, answerKind: 'table', table: { columns: ['a', 'b', 'c', 'd'], rows } })
    await answer('s1', 1, twelve, 4)
    expect(state.inserted).toHaveLength(1)
    expect(state.inserted[0]).toMatchObject({ answer: twelve, correct: true })
  })

  it('an answer of another kind over 60 characters is still refused, and so is a list over 240', async () => {
    state.lesson = withFirstTry({ prompt: 'Simplify', answer: 'x', answerKind: 'expression' })
    await expect(answer('s1', 1, 'x+'.repeat(31), 4)).rejects.toThrow('Write an answer first')
    state.lesson = withFirstTry({ prompt: 'Write them', answer: '1; 2', answerKind: 'list' })
    await expect(answer('s1', 1, '1; '.repeat(90), 4)).rejects.toThrow('Write an answer first')
    expect(state.inserted).toHaveLength(0)
  })
})
