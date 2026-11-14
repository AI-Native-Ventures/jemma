import { describe, expect, test } from 'vitest'
import { capsDraft, capsGrades, capsSource } from '../../src/curriculum/caps'
import { capsMapOf, isSouthAfrica, topicRowsOf, writeApprovedMap } from '../../src/curriculum/caps-map'
import { memoryDb } from '../helpers/memory-db'

// The approved CAPS map of a grade as rows: shared by the demo seed (5A, 7A, 4A and the learner's own workspace preload) and by a learner who
// adds a grade to their own workspace. Pure functions and a database in memory: no database, no network.

describe('capsMapOf', () => {
  test('every grade 1 to 12 has a map: the draft, its source, one row for every topic and the line of the log', () => {
    for (const grade of capsGrades()) {
      const m = capsMapOf(grade)!
      expect(m.draft).toEqual(capsDraft(grade))
      expect(m.source).toEqual({ kind: 'caps', ...capsSource(grade)! })
      expect(m.stored).toEqual({ ...m.draft, source: m.source })
      expect(m.rows).toEqual(topicRowsOf(m.draft))
      expect(m.rows.length).toBeGreaterThan(0)
      expect(m.log).toBe(`Loaded the CAPS map for Grade ${grade}: ${m.rows.length} topics`)
    }
  })

  test('a grade with no map answers null', () => {
    for (const grade of [0, 13, -1, 6.5, Number.NaN]) expect(capsMapOf(grade)).toBeNull()
  })
})

describe('topicRowsOf', () => {
  test('a short name that is missing falls back to the name', () => {
    const rows = topicRowsOf({ grade: 6, terms: [{ term: 1, topics: [{ name: 'A', family: 'data', prerequisites: [], misconceptions: [] }] }], leftOut: [] })
    expect(rows).toEqual([{ term: 1, position: 1, name: 'A', short_name: 'A', family: 'data', misconceptions: [] }])
  })
})

describe('isSouthAfrica', () => {
  test('the code ZA and the name, in any case, and nothing else', () => {
    for (const yes of ['ZA', 'za', ' ZA ', 'South Africa', 'south africa']) expect(isSouthAfrica(yes), yes).toBe(true)
    for (const no of ['KE', 'Kenya', '', 'ZZ', 'Zambia']) expect(isSouthAfrica(no), no).toBe(false)
  })
})

describe('writeApprovedMap', () => {
  test('writes the approved map of the class and every topic of it, and answers their ids', async () => {
    const db = memoryDb()
    const m = capsMapOf(6)!
    const written = await writeApprovedMap(db, { classId: 'class-1', stored: m.stored, approvedAt: '2026-11-14T08:00:00.000Z', rows: m.rows })
    expect(db.tables.curriculum_maps).toHaveLength(1)
    expect(db.tables.curriculum_maps![0]).toMatchObject({ class_id: 'class-1', status: 'approved', approved_at: '2026-11-14T08:00:00.000Z', draft: m.stored })
    expect(db.tables.topics).toHaveLength(m.rows.length)
    expect(db.tables.topics!.every((t) => t.map_id === written.map.id)).toBe(true)
    expect(written.topicRows).toHaveLength(m.rows.length)
    expect(written.topicRows.map((t) => t.name)).toEqual(m.rows.map((r) => r.name))
  })
})
