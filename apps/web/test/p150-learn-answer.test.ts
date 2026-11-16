import type { TeachingBlock, TeachingLesson } from '@jemma/profiling/schemas'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// P150: a list, an order and a table in a teaching lesson (P144). The question the learner is sent keeps its count, labels, items and table (never a key
// value), the answer action takes these kinds up to 240 characters and marks each value, any other kind still stops at 60. Doubles for the learner, the stored
// lesson and the database. No database, no router, no model.

const state = vi.hoisted(() => ({ lesson: null as unknown }))

vi.mock('../lib/data/p27', () => ({ myChild: async () => ({ supabase: {}, child: { id: 'child-1' } }) }))
vi.mock('../lib/data/teaching', () => ({
  storedLesson: async () => (state.lesson ? { lesson: state.lesson, source: { kind: 'none', title: '', credit: '' } } : null),
  underSessionHandover: async () => false,
}))
vi.mock('../lib/supabase/admin', () => ({ createSupabaseAdmin: () => ({ from: () => ({ upsert: async () => ({ error: null }) }) }) }))

import { answerLessonQuestion } from '../app/k/learn/actions'
import { forChild, stripLessonQuestion } from '../lib/teaching'

const base = { prompt: 'p', render: 'text' as const, steps: ['a', 'b'], difficulty: 1 as const, why: 'w', rightWay: 'r' }
const TABLE = { ...base, prompt: 'Complete the table', answer: '1000; 1001; 1002; 1003; 1004; 1005; 1006; 1007; 1008; 1009; 1010; 1011', answerKind: 'table' as const, table: { columns: ['a', 'b', 'c', 'd'], rows: [['r', null, null, null], ['s', null, null, null], ['t', null, null, null], ['u', null, null, null]] } }
const FIVE = { ...base, prompt: 'Five-number summary', answer: '2; 4; 5,5; 8; 10', answerKind: 'list' as const, ordered: true, labels: ['min', 'Q1', 'median', 'Q3', 'max'] }
const ORDER = { ...base, prompt: 'Put in order', answer: '1/4; 0,3; 1/2', answerKind: 'order' as const }
const WHOLE = { ...base, prompt: 'Add', answer: '4', answerKind: 'whole' as const }
const explain: TeachingBlock = { kind: 'explain', text: 'Text', speech: 'Speech' }
const lesson = (): TeachingLesson =>
  ({
    position: 1,
    title: 'A lesson',
    minutes: 12,
    objectives: ['You will be able to one.', 'You will be able to two.'],
    keyWords: [],
    blocks: [explain, explain, explain, explain, explain, explain, { kind: 'try', question: FIVE, hint: 'Hint', speech: 'Try' }, { kind: 'mistake', wrong: 'a', right: 'b', why: 'c', speech: 'd' }],
    summary: ['one', 'two', 'three'],
    practice: [TABLE, FIVE, ORDER, WHOLE, WHOLE, WHOLE],
  }) as unknown as TeachingLesson

beforeEach(() => {
  state.lesson = lesson()
})

describe('the question the learner is sent', () => {
  it('keeps the parts a list, an order and a table need, and no key value', () => {
    expect(stripLessonQuestion(FIVE).list).toEqual({ count: 5, ordered: true, plain: true, labels: ['min', 'Q1', 'median', 'Q3', 'max'] })
    expect(stripLessonQuestion(TABLE).table).toMatchObject({ columns: ['a', 'b', 'c', 'd'], plain: true })
    const items = stripLessonQuestion(ORDER).items!
    expect([...items].sort()).toEqual(['0,3', '1/2', '1/4'])
    expect(items).not.toEqual(['1/4', '0,3', '1/2'])
    const sent = JSON.stringify(forChild(lesson()))
    expect(sent).not.toContain('2; 4; 5,5; 8; 10')
    expect(sent).not.toContain('1000; 1001')
    expect(sent).not.toContain('1/4; 0,3; 1/2')
  })
})

describe('answerLessonQuestion with several values', () => {
  it('marks each value of a list, an order and a table', async () => {
    expect((await answerLessonQuestion('l', { kind: 'practice', index: 1 }, '2; 4; 5,5; 8; 10')).correct).toBe(true)
    expect((await answerLessonQuestion('l', { kind: 'practice', index: 1 }, '2; 4; 5,5; 8; 9')).correct).toBe(false)
    expect((await answerLessonQuestion('l', { kind: 'practice', index: 2 }, '1/4; 0,3; 1/2')).correct).toBe(true)
    expect((await answerLessonQuestion('l', { kind: 'try', block: 6 }, '2; 4; 5,5; 8; 10')).correct).toBe(true)
  })
  it('takes a table answer of more than 60 characters', async () => {
    const key = '1000; 1001; 1002; 1003; 1004; 1005; 1006; 1007; 1008; 1009; 1010; 1011'
    expect(key.length).toBeGreaterThan(60)
    expect((await answerLessonQuestion('l', { kind: 'practice', index: 0 }, key)).correct).toBe(true)
  })
  it('a question of another kind still stops at 60, and nothing is taken over 240', async () => {
    await expect(answerLessonQuestion('l', { kind: 'practice', index: 3 }, '1'.repeat(61))).rejects.toThrow('Write an answer first')
    await expect(answerLessonQuestion('l', { kind: 'practice', index: 0 }, '1; '.repeat(90))).rejects.toThrow('Write an answer first')
  })
})
