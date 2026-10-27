import { expect, test } from 'vitest'
import { matchName } from '../../src/logic'

const roster = [
  { id: 'a', name: 'Amina Dlamini' },
  { id: 't', name: 'Thabo' },
  { id: 'l', name: 'Lerato' },
]

test('matchName', () => {
  expect(matchName('amina', roster)).toEqual({ childId: 'a', confidence: 1 })
  expect(matchName('Thab0', roster)).toEqual({ childId: 't', confidence: 0.85 })
  expect(matchName('Xq', roster)).toEqual({ childId: null, confidence: 0 })
})

test('matchName ignores accents and case', () => {
  expect(matchName('LÉRATO', roster)).toEqual({ childId: 'l', confidence: 1 })
})

test('matchName refuses an ambiguous near match', () => {
  const twins = [
    { id: '1', name: 'Sipho' },
    { id: '2', name: 'Sippo' },
  ]
  expect(matchName('Sipko', twins).childId).toBeNull()
})
