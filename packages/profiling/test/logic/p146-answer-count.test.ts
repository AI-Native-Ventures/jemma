import { describe, expect, it } from 'vitest'
import { answerCountOf, markByMeaning, meaningKeyProblem } from '../../src/logic'

// P146: how many answers an equation question has, from its key. The learner's screen is told only this count and the letter, never the values. Pure
// functions: no database, no network.

describe('answerCountOf: the number of values in the key of an equation question', () => {
  it('two values joined by or are 2, with the letter of the key', () => {
    expect(answerCountOf('x = 2 or x = 3')).toEqual({ count: 2, letter: 'x' })
    expect(answerCountOf('x = 3 or x = -1')).toEqual({ count: 2, letter: 'x' })
    expect(answerCountOf('x=3; x=-1')).toEqual({ count: 2, letter: 'x' })
    expect(answerCountOf('x = 3 and x = 5')).toEqual({ count: 2, letter: 'x' })
  })

  it('one value is 1', () => {
    expect(answerCountOf('x = 5')).toEqual({ count: 1, letter: 'x' })
    expect(answerCountOf('x = -3,5')).toEqual({ count: 1, letter: 'x' })
    expect(answerCountOf('y = 4')).toEqual({ count: 1, letter: 'y' })
  })

  it('a key with no letter has a count and no letter', () => {
    expect(answerCountOf('2 or 3')).toEqual({ count: 2, letter: null })
    expect(answerCountOf('7')).toEqual({ count: 1, letter: null })
  })

  it('a plus or minus key is two values (x = ±2 is 2 and -2), unless the value is 0', () => {
    expect(answerCountOf('x = ±2')).toEqual({ count: 2, letter: 'x' })
    expect(answerCountOf('x = ±0')).toEqual({ count: 1, letter: 'x' })
  })

  it('a plus or minus with a surd (P147) is two values too', () => {
    expect(answerCountOf('x = 1 ± √3')).toEqual({ count: 2, letter: 'x' })
    expect(answerCountOf('x = ±√2')).toEqual({ count: 2, letter: 'x' })
  })

  it('three values are 3 and the same value written twice is counted once', () => {
    expect(answerCountOf('x = 1 or x = 2 or x = 3')).toEqual({ count: 3, letter: 'x' })
    expect(answerCountOf('x = 1 or x = 2 or x = 2')).toEqual({ count: 2, letter: 'x' })
    expect(answerCountOf('x = 0,5 or x = 1/2')).toEqual({ count: 1, letter: 'x' })
  })

  it('an inequality is 0: it is not a list', () => {
    expect(answerCountOf('x < 4')).toEqual({ count: 0, letter: 'x' })
    expect(answerCountOf('-2 < x <= 5')).toEqual({ count: 0, letter: 'x' })
    expect(answerCountOf('x < -1 or x > 4')).toEqual({ count: 0, letter: 'x' })
    expect(answerCountOf('x != 0')).toEqual({ count: 0, letter: 'x' })
  })

  it('a key that does not read gives null (the screen keeps its one box)', () => {
    expect(answerCountOf('')).toBeNull()
    expect(answerCountOf('hello')).toBeNull()
    expect(answerCountOf('x = 1 or y = 2')).toBeNull()
  })

  it('agrees with the save gate: every key that counts is a key the gate takes as an equation', () => {
    for (const key of ['x = 2 or x = 3', 'x = 5', 'x = ±2', 'x < 4', '2 or 3']) {
      expect(answerCountOf(key), key).not.toBeNull()
      expect(meaningKeyProblem('equation', key), key).toBeNull()
    }
  })
})

describe('marking an equation with two answers accepts any order, and a paper that labels them', () => {
  const mark = (answer: string) => markByMeaning('equation', 'x = 2 or x = 3', answer).correct

  it('x = 3 or x = 2 and x = 2 or x = 3 are both right, one value is not', () => {
    expect(mark('x = 3 or x = 2')).toBe(true)
    expect(mark('x = 2 or x = 3')).toBe(true)
    expect(mark('x = 2')).toBe(false)
    expect(mark('x = 2 or x = 4')).toBe(false)
  })

  it('the two boxes of the screen send "<letter> = a or <letter> = b"', () => {
    expect(mark('x = -1 or x = 3')).toBe(false)
    expect(markByMeaning('equation', 'x = 3 or x = -1', 'x = -1 or x = 3').correct).toBe(true)
  })

  it('a paper sheet that says "Answer 1: ____  Answer 2: ____" has its labels read as the gaps between the values', () => {
    expect(mark('Answer 1: 3  Answer 2: 2')).toBe(true)
    expect(mark('Answer 1: 2 Answer 2: 3')).toBe(true)
    expect(mark('Answer 1: x = 3  Answer 2: x = 2')).toBe(true)
    expect(mark('Answer 1: 3')).toBe(false)
  })
})
