import { describe, expect, it } from 'vitest'
import { dayStamp, practiceRows, scoreLine, type PracticeSessionRow } from '../lib/past-practice'

// P120: "Your practice" on My maths. Rows in, plain facts out: no database.

const row = (over: Partial<PracticeSessionRow> & { id: string }): PracticeSessionRow => ({
  topic_name: 'Algebraic expressions',
  finished_at: '2026-11-16T10:20:00.000+00:00',
  planned_for: '2026-11-16',
  right: 4,
  question_count: 5,
  ...over,
})

describe('scoreLine', () => {
  it('is "4 of 5 right", never a percent', () => {
    expect(scoreLine(4, 5)).toBe('4 of 5 right')
    expect(scoreLine(0, 5)).toBe('0 of 5 right')
    expect(scoreLine(4, 5)).not.toContain('%')
  })

  it('says nothing when no count was saved', () => {
    expect(scoreLine(null, 5)).toBe('')
  })
})

describe('dayStamp', () => {
  it('is the weekday, the day and the month', () => {
    expect(dayStamp('2026-11-16T10:20:00.000+00:00')).toBe('Mon 16 Nov')
  })

  it('is empty for no date and for something that is not a date', () => {
    expect(dayStamp(null)).toBe('')
    expect(dayStamp('not a date')).toBe('')
  })
})

describe('practiceRows', () => {
  it('lists the newest practice first', () => {
    const rows = practiceRows([
      row({ id: 'old', finished_at: '2026-11-10T09:00:00.000+00:00', topic_name: 'Fractions' }),
      row({ id: 'new', finished_at: '2026-11-16T10:20:00.000+00:00' }),
      row({ id: 'mid', finished_at: '2026-11-12T09:00:00.000+00:00', topic_name: 'Decimals' }),
    ])
    expect(rows.map((r) => r.sessionId)).toEqual(['new', 'mid', 'old'])
  })

  it('gives each one its topic, its day and its count', () => {
    const [first] = practiceRows([row({ id: 's1', right: 4, question_count: 5 })])
    expect(first).toMatchObject({ sessionId: 's1', topic: 'Algebraic expressions', day: 'Mon 16 Nov', score: '4 of 5 right' })
  })

  it('counts out of five when the row does not say how many questions there were', () => {
    expect(practiceRows([row({ id: 's1', right: 3, question_count: null })])[0]!.score).toBe('3 of 5 right')
  })

  it('counts out of the number of questions the practice had', () => {
    expect(practiceRows([row({ id: 's1', right: 5, question_count: 6 })])[0]!.score).toBe('5 of 6 right')
  })

  it('a practice with no finish time counts from the day it was planned for, and one with no name is "Practice"', () => {
    const rows = practiceRows([row({ id: 'a', finished_at: null, planned_for: '2026-11-01', topic_name: null }), row({ id: 'b', finished_at: '2026-11-05T09:00:00.000+00:00' })])
    expect(rows.map((r) => r.sessionId)).toEqual(['b', 'a'])
    expect(rows[1]).toMatchObject({ topic: 'Practice', day: 'Sun 1 Nov' })
  })

  it('is empty for a learner with no finished practice', () => {
    expect(practiceRows([])).toEqual([])
  })
})
