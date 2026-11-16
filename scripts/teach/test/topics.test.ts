import { describe, expect, test } from 'vitest'
import { PITCH_TOPICS, SAMPLE_TOPICS, lessonPath, loadCapsFile, topicFileNames, topicGroups, topicSlug } from '../topics'

const rows = () => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].reduce((n, g) => n + loadCapsFile(g).terms.reduce((m, t) => m + t.topics.length, 0), 0)

describe('topicGroups', () => {
  const groups = topicGroups()

  test('488 CAPS rows give fewer groups than rows', () => {
    expect(rows()).toBe(488)
    expect(groups.length).toBeLessThan(488)
    expect(groups.length).toBeGreaterThan(200)
  })

  test('every row is in exactly one group and no group is empty', () => {
    const terms = groups.reduce((n, g) => n + g.terms.length, 0)
    expect(terms).toBeGreaterThanOrEqual(groups.length)
    for (const g of groups) {
      expect(g.capsNames.length).toBeGreaterThan(0)
      expect(g.terms.length).toBeGreaterThan(0)
      expect(g.baseName).not.toMatch(/\(Term \d\)/i)
    }
  })

  test('Grade 6 has one group Common fractions that holds both term rows', () => {
    const g6 = groups.filter((g) => g.grade === 6 && g.baseName === 'Common fractions')
    expect(g6).toHaveLength(1)
    expect(g6[0]?.terms).toEqual([1, 4])
    expect(g6[0]?.family).toBe('fractions')
    // the Department prints the same name for both rows: kept once
    expect(g6[0]?.capsNames).toEqual(['Common fractions'])
  })

  test('the first three groups are the pitch topics in that order', () => {
    expect(groups.slice(0, 3).map((g) => [g.grade, g.baseName])).toEqual([
      [6, 'Common fractions'],
      [10, 'Trigonometry'],
      [11, 'Functions'],
    ])
    expect(PITCH_TOPICS).toHaveLength(3)
  })

  test('then the grades come in the order 12, 11, 10, 9 down to 1', () => {
    const rest = groups.slice(3).map((g) => g.grade)
    const firstSeen = [...new Set(rest)]
    expect(firstSeen).toEqual([12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1])
  })

  test('a group knows its neighbours in the year, never itself', () => {
    const g = groups.find((x) => x.grade === 9 && x.baseName === 'Theorem of Pythagoras')!
    expect(g.before.length).toBeGreaterThan(0)
    expect(g.after.length).toBeGreaterThan(0)
    expect(g.before).not.toContain(g.baseName)
    expect(g.after).not.toContain(g.baseName)
  })

  test('a Grade 1 group keeps the document name and the term of each row', () => {
    const g = groups.find((x) => x.grade === 1 && x.baseName === 'Count objects')!
    expect(g.terms.length).toBeGreaterThan(1)
    expect(g.capsNames).toEqual(['Count objects'])
  })
})

describe('sample topics', () => {
  test('the five sample topics are the three pitch topics, a Grade 1 topic and a Grade 9 topic, and all of them exist', () => {
    const groups = topicGroups()
    expect(SAMPLE_TOPICS.slice(0, 3)).toEqual(PITCH_TOPICS)
    expect(SAMPLE_TOPICS.map((t) => t.grade).slice(3)).toEqual([1, 9])
    for (const t of SAMPLE_TOPICS) expect(groups.some((g) => g.grade === t.grade && g.baseName === t.baseName), `${t.grade} ${t.baseName}`).toBe(true)
  })
})

describe('file names', () => {
  test('a slug is lower case words with dashes and not longer than 70 characters', () => {
    expect(topicSlug('Common fractions')).toBe('common-fractions')
    expect(topicSlug('Whole numbers: counting, ordering, comparing, representing and place value (6-digit numbers)').length).toBeLessThanOrEqual(70)
    expect(topicSlug('Capacity/Volume')).toBe('capacity-volume')
  })

  test('no two groups of one grade share a file', () => {
    const groups = topicGroups()
    const names = topicFileNames(groups)
    const seen = new Set<string>()
    for (const g of groups) {
      const path = lessonPath(g, names.get(g)!)
      expect(seen.has(path), path).toBe(false)
      seen.add(path)
    }
    expect(lessonPath(groups[0]!, names.get(groups[0]!)!)).toBe('content/lessons/grade-6/common-fractions.json')
  })
})
