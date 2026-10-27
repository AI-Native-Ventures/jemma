import { describe, expect, test } from 'vitest'
import { AMINA_LESSON, SESSION_TRY, SESSION_WARMUP } from '../../../supabase/seed/fixtures/marked-state'
import {
  adaptedOf,
  missedOf,
  nextInSequence,
  stageAfter,
  stripQuestion,
  type StoredItem,
} from '../app/k/session/[sessionId]/logic'

const WARMUP = AMINA_LESSON.warmup
const POOL = AMINA_LESSON.questions

const item = (phase: 'warmup' | 'try', position: number, q: (typeof POOL)[number], answer: string, correct: boolean): StoredItem => ({
  phase,
  position,
  question: q,
  answer,
  correct,
  difficulty: q.difficulty,
  seconds: 30,
})

describe('stripQuestion', () => {
  test('never carries the answer, why or rightWay', () => {
    const out = stripQuestion(POOL[0]!, { position: 3, phase: 'try', index: 1, of: 5 })
    expect(out).not.toHaveProperty('answer')
    expect(out).not.toHaveProperty('why')
    expect(out).not.toHaveProperty('rightWay')
    expect(JSON.stringify(out)).not.toContain(POOL[0]!.answer)
    expect(out.terms).toEqual(POOL[0]!.terms)
  })
})

describe('nextInSequence', () => {
  test('serves the warm-up first, then the first try question at difficulty 2', () => {
    expect(nextInSequence(WARMUP, POOL, 5, [])?.question.prompt).toBe(WARMUP[0]!.prompt)
    const afterWarmup = WARMUP.map((q, i) => item('warmup', i + 1, q, 'A', true))
    const first = nextInSequence(WARMUP, POOL, 5, afterWarmup)!
    expect(first.phase).toBe('try')
    expect(first.position).toBe(3)
    expect(first.question.difficulty).toBe(2)
  })

  test('follows the seeded session: wrong goes easier, two right go harder', () => {
    const items: StoredItem[] = SESSION_WARMUP.map((w, i) => item('warmup', i + 1, w.q, w.answer, w.correct))
    const served: string[] = []
    for (let k = 0; k < 5; k++) {
      const next = nextInSequence(WARMUP, POOL, 5, items)!
      served.push(next.question.prompt)
      const planned = SESSION_TRY[k]!
      items.push(item('try', k + 1, next.question, planned.answer, planned.correct))
    }
    expect(served).toEqual(SESSION_TRY.map((t) => t.q.prompt))
    expect(nextInSequence(WARMUP, POOL, 5, items)).toBeNull()
  })

  test('skips the warm-up when the lesson has none', () => {
    expect(nextInSequence([], POOL, 5, [])?.phase).toBe('try')
  })
})

describe('adaptedOf', () => {
  test('marks the item chosen after a level change', () => {
    expect(adaptedOf([])).toBeNull()
    expect(adaptedOf([true])).toBeNull()
    expect(adaptedOf([true, false])).toBe('easier')
    expect(adaptedOf([true, false, true])).toBeNull()
    expect(adaptedOf([true, false, true, true])).toBe('harder')
  })
})

describe('missedOf', () => {
  test('lists only the missed try questions, with why and the right way', () => {
    const items: StoredItem[] = SESSION_TRY.map((t, i) => item('try', i + 1, t.q, t.answer, t.correct))
    const missed = missedOf(items)
    expect(missed.map((m) => m.n)).toEqual([2, 5])
    expect(missed[0]).toMatchObject({ prompt: '2/3 + 1/6', wrote: '3/9', right: '5/6', why: 'you added the tops and the bottoms.' })
    expect(missed[0]!.rightWay).toBe('2/3 is the same as 4/6. Then 4/6 + 1/6 = 5/6.')
  })
})

describe('stageAfter', () => {
  const now = new Date('2026-10-27T18:00:00Z')
  test('a new gap moves to Practising after one session', () => {
    expect(stageAfter({ stage: 'new', right: 3, firstPractisedAt: null, now })).toEqual({ from: 'new', to: 'practising' })
  })
  test('practising stays practising before 3 days', () => {
    expect(stageAfter({ stage: 'practising', right: 5, firstPractisedAt: new Date('2026-10-26T18:00:00Z'), now })).toEqual({
      from: 'practising',
      to: 'practising',
    })
  })
})
