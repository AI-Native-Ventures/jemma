import { describe, expect, test } from 'vitest'
import { CAST } from '../seed/fixtures/cast'
import { HILLVIEW_CLASSES, HILLVIEW_LINKS, HILLVIEW_PARENTS, HILLVIEW_TEACHERS, hillviewPeople, madeUpClasses, madeUpLearner } from '../seed/fixtures/hillview'
import { buildTable, findPatterns, type LongViewRecord } from '../../packages/profiling/src/logic/long-view'

// The made-up school as a roster, with no database: who is in it, who is linked to whom, and what is planted in the records.

const YEAR = 2026

const asRecords = (rows: { source: string; grade: number; year: number; term: number; happened_on: string; logged_at: string; teacher_name: string; title: string; family: string | null; topic_name: string | null; marks: number | null; out_of: number | null; quality: string; text: string | null; present: number | null; total: number | null; subject: string | null }[]): LongViewRecord[] =>
  rows.map((r, i) => ({
    id: String(i), source: r.source as LongViewRecord['source'], grade: r.grade, year: r.year, term: r.term, happenedOn: r.happened_on, loggedAt: r.logged_at,
    teacherName: r.teacher_name, title: r.title, family: r.family, topicName: r.topic_name, marks: r.marks, outOf: r.out_of, quality: r.quality as 'clear' | 'unclear',
    text: r.text, present: r.present, total: r.total, subject: r.subject,
  }))

describe('the roster of Hillview Primary', () => {
  test('three teachers, four Mathematics classes across Grades 4 to 7, 6B Mathematics first, and no other subject anywhere', () => {
    expect(HILLVIEW_TEACHERS.map((t) => [t.displayName, t.subject])).toEqual([['Ms Banda', 'Mathematics'], ['Mr Dlamini', 'Mathematics'], ['Ms Okafor', 'Mathematics']])
    expect(HILLVIEW_CLASSES.map((c) => `${c.name}:${HILLVIEW_TEACHERS.find((t) => t.key === c.teacher)!.displayName}`)).toEqual([
      '6B Mathematics:Ms Banda', '5A Mathematics:Ms Banda', '7A Mathematics:Mr Dlamini', '4A Mathematics:Ms Okafor',
    ])
    expect(new Set(HILLVIEW_CLASSES.map((c) => c.grade))).toEqual(new Set([4, 5, 6, 7]))
    expect(new Set(HILLVIEW_CLASSES.map((c) => c.subject))).toEqual(new Set(['Mathematics']))
  })

  test('23 learners: the five of 6B and eighteen made up, none with a repeated first name', () => {
    const made = madeUpClasses(YEAR)
    const names = [...CAST.children, ...made.flatMap((m) => m.batch.learners.map((l) => l.firstName))]
    expect(names).toHaveLength(23)
    expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(23)
    for (const m of made) expect(m.batch.learners).toHaveLength(6)
  })

  test('the same year gives the same school, the demo page can list it before any sandbox exists', () => {
    expect(hillviewPeople(YEAR)).toEqual(hillviewPeople(YEAR))
    const people = hillviewPeople(YEAR)
    expect(people.learners.map((g) => g.names.length)).toEqual([5, 6, 6, 6])
    expect(people.teachers.map((t) => t.classes)).toEqual([['6B Mathematics', '5A Mathematics'], ['7A Mathematics'], ['4A Mathematics']])
  })

  test('parents: Thandi M and Amina; one parent with two children in different grades (5A and 7A); one child with two guardians; five or more with none', () => {
    expect(HILLVIEW_PARENTS.map((p) => p.displayName)).toEqual(['Thandi M', 'Nomsa K', 'Peter A', 'Grace A'])
    const made = madeUpClasses(YEAR)
    const childOf = (l: (typeof HILLVIEW_LINKS)[number]) => madeUpLearner(made, l.classKey, l.at)!.firstName
    const byParent = new Map<string, string[]>()
    for (const l of HILLVIEW_LINKS) byParent.set(l.parent, [...(byParent.get(l.parent) ?? []), childOf(l)])
    const nomsa = HILLVIEW_LINKS.filter((l) => l.parent === 'nomsa')
    expect(nomsa).toHaveLength(2)
    expect(new Set(nomsa.map((l) => HILLVIEW_CLASSES.find((c) => c.key === l.classKey)!.grade)).size).toBe(2)
    expect(byParent.get('peter')).toEqual(byParent.get('grace'))
    expect(byParent.get('peter')).toHaveLength(1)
    const linked = new Set(HILLVIEW_LINKS.map(childOf))
    const unlinked = made.flatMap((m) => m.batch.learners.map((l) => l.firstName)).filter((n) => !linked.has(n))
    expect(unlinked.length + CAST.children.length - 1).toBeGreaterThanOrEqual(5) // Amina links in the demo path
    expect(unlinked.length).toBeGreaterThanOrEqual(5)
  })

  test('each made-up class carries every kind of mess, and its planted patterns are the ones the finder finds', () => {
    for (const m of madeUpClasses(YEAR)) {
      const kinds = new Set(m.batch.learners.flatMap((l) => l.mess))
      expect(kinds.size, m.classKey).toBeGreaterThanOrEqual(6)
      for (const l of m.batch.learners) {
        const found = findPatterns(buildTable(asRecords(l.records), []).table).map((p) => `${p.subject}/${p.key}`)
        expect(found, `${m.classKey} ${l.firstName}`).toEqual(l.planted ? [`${l.planted.subject}/${l.planted.kind}:${l.planted.family}`] : [])
      }
    }
  })

  test('every generated record is Mathematics, with the six strand keys, up to three years back and a different teacher each year', () => {
    const families = new Set(['whole_numbers', 'fractions', 'decimals', 'shapes', 'measurement', 'data'])
    for (const m of madeUpClasses(YEAR)) {
      const grade = HILLVIEW_CLASSES.find((c) => c.key === m.classKey)!.grade
      const teachers = new Set(m.batch.learners.flatMap((l) => l.records.map((r) => r.teacher_name)))
      expect(teachers.size, m.classKey).toBeGreaterThanOrEqual(3)
      for (const l of m.batch.learners) {
        expect(l.records.every((r) => (r.subject === 'Mathematics' || (r.subject === null && (r.source === 'note' || r.source === 'attendance'))) && (r.family === null || families.has(r.family)))).toBe(true)
        expect(Math.min(...l.records.map((r) => r.grade))).toBeGreaterThanOrEqual(grade - 2)
      }
    }
  })

  test('half or so of the generated learners carry one planted pattern', () => {
    const all = madeUpClasses(YEAR).flatMap((m) => m.batch.learners)
    const planted = all.filter((l) => l.planted).length
    expect(planted).toBeGreaterThanOrEqual(6)
    expect(planted).toBeLessThanOrEqual(12)
  })
})
