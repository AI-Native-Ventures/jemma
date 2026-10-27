import { expect, test } from 'vitest'
import { nextStage } from '../../src/logic'

const day = 86_400_000
const now = new Date('2026-10-30T12:00:00Z')

test('nextStage', () => {
  expect(nextStage({ stage: 'new', right: 1, firstPractisedAt: null, now, fixAfterDays: 3 })).toBe('practising')
  const first3 = new Date(now.getTime() - 3 * day)
  const first1 = new Date(now.getTime() - 1 * day)
  expect(nextStage({ stage: 'practising', right: 4, firstPractisedAt: first3, now, fixAfterDays: 3 })).toBe('fixed')
  expect(nextStage({ stage: 'practising', right: 4, firstPractisedAt: first1, now, fixAfterDays: 3 })).toBe('practising')
  expect(nextStage({ stage: 'practising', right: 3, firstPractisedAt: first3, now, fixAfterDays: 3 })).toBe('practising')
  expect(nextStage({ stage: 'practising', right: 4, firstPractisedAt: now, now, fixAfterDays: 0 })).toBe('fixed')
  expect(nextStage({ stage: 'fixed', right: 0, firstPractisedAt: first3, now, fixAfterDays: 3 })).toBe('fixed')
})
