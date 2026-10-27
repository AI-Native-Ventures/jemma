import { expect, test } from 'vitest'
import { nextDifficulty } from '../../src/logic'

test('nextDifficulty follows the board', () => {
  expect(nextDifficulty(2, [true, false])).toEqual({ next: 1, adapted: 'easier' })
  expect(nextDifficulty(1, [true, true])).toEqual({ next: 2, adapted: 'harder' })
})

test('nextDifficulty floors, caps and restarts the streak', () => {
  expect(nextDifficulty(1, [false])).toEqual({ next: 1, adapted: null })
  expect(nextDifficulty(3, [true, true])).toEqual({ next: 3, adapted: null })
  expect(nextDifficulty(1, [true, true, true])).toEqual({ next: 2, adapted: 'harder' })
  expect(nextDifficulty(1, [true, true, true, true])).toEqual({ next: 3, adapted: 'harder' })
  expect(nextDifficulty(2, [])).toEqual({ next: 2, adapted: null })
})
