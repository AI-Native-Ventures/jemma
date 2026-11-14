import { describe, expect, test } from 'vitest'
import { capsClassMaps, topicRowsOf } from '../seed/fixtures/caps-maps'
import { HILLVIEW_CLASSES } from '../seed/fixtures/hillview'
import { capsDraft } from '../../packages/profiling/src/curriculum/caps'
import { TopicMapDraftSchema } from '../../packages/profiling/src/schemas'

// The made-up classes of the demo school (5A, 7A, 4A) start with their grade's CAPS map approved. 6B does not: its first step in the demo
// path is the teacher's own upload, and its recorded answers depend on that. No database in this file: what the seed would write.

describe('which classes of the demo school get a CAPS map', () => {
  test('5A, 7A and 4A, and not 6B', () => {
    expect(capsClassMaps().map((m) => m.classKey)).toEqual(['5a-maths', '7a-maths', '4a-maths'])
    expect(capsClassMaps().map((m) => m.classKey)).not.toContain('6b-maths')
  })

  test('every class of the school except the home class that has made-up learners is listed, with its own grade', () => {
    const madeUp = HILLVIEW_CLASSES.filter((c) => c.learners === 'made-up')
    expect(capsClassMaps().map((m) => [m.classKey, m.grade])).toEqual(madeUp.map((c) => [c.key, c.grade]))
    expect(capsClassMaps().map((m) => m.grade)).toEqual([5, 7, 4])
  })
})

describe('what is written for each of them', () => {
  test('the draft is the CAPS draft of the grade, stored with its source, and the source names the Department', () => {
    for (const m of capsClassMaps()) {
      expect(TopicMapDraftSchema.safeParse(m.draft).success).toBe(true)
      expect(m.draft).toEqual(capsDraft(m.grade))
      expect(m.source).toMatchObject({ kind: 'caps', publisher: expect.stringMatching(/Department of Basic Education/) })
      expect(m.stored).toMatchObject({ ...m.draft, source: m.source })
    }
  })

  test('one topic row for every topic, in the order of the draft, with its term, place, strand and short name', () => {
    for (const m of capsClassMaps()) {
      const flat = m.draft.terms.flatMap((t) => t.topics.map((x, i) => ({ term: t.term, position: i + 1, name: x.name })))
      expect(m.rows.map((r) => ({ term: r.term, position: r.position, name: r.name }))).toEqual(flat)
      expect(m.rows.length).toBeGreaterThan(0)
      for (const r of m.rows) {
        expect(r.short_name.trim()).not.toBe('')
        expect(r.family.trim()).not.toBe('')
        expect(r.misconceptions).toEqual([])
      }
      expect(new Set(m.rows.map((r) => r.name)).size).toBe(m.rows.length)
    }
  })

  test('a short name that is missing falls back to the name, as the seed has always written it', () => {
    const rows = topicRowsOf({ grade: 6, terms: [{ term: 1, topics: [{ name: 'A', family: 'data', prerequisites: [], misconceptions: [] }] }], leftOut: [] })
    expect(rows).toEqual([{ term: 1, position: 1, name: 'A', short_name: 'A', family: 'data', misconceptions: [] }])
  })

  test('the activity log line is the one the teacher\'s own tap writes', () => {
    for (const m of capsClassMaps()) {
      expect(m.log).toBe(`Loaded the CAPS map for Grade ${m.grade}: ${m.rows.length} topics`)
    }
  })
})
