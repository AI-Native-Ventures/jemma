import { expect, test } from 'vitest'
import { classGaps } from '../../src/logic'
import { classTest1Results, classTest1Roster } from '../../../../supabase/seed/fixtures/class-test-1'

test('classGaps on Class Test 1', () => {
  const gaps = classGaps(classTest1Results, classTest1Roster)
  expect(gaps.map((g) => [g.topicName, g.learners.length])).toEqual([
    ['Adding fractions with different denominators', 4],
    ['Adding decimals', 3],
    ['Comparing fractions', 2],
  ])
  expect(gaps[0]!.mistake).toEqual({
    label: 'Adds the tops and the bottoms',
    example: '1/2 + 1/4 = 2/6',
    count: 10,
  })
  expect(gaps[0]!.learners.find((l) => l.childId === 'sipho')!.wrote).toEqual(['2/6', '3/9', '3 2/4'])
  expect(gaps[0]!.topicId).toBeNull()
})

test('classGaps ignores right answers and learners outside the roster', () => {
  expect(classGaps(classTest1Results.filter((r) => r.correct), classTest1Roster)).toEqual([])
  expect(classGaps(classTest1Results, [{ id: 'lerato', name: 'Lerato' }]).map((g) => g.learners.length)).toEqual([1])
})
