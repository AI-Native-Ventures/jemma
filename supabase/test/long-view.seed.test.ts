import { afterAll, describe, expect, test } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { createSandbox, deleteSandbox } from '../seed/demo'
import { CAST } from '../seed/fixtures/cast'
import { LONG_HISTORY_CHILDREN, FAMILIES, longHistory, type LongHistoryChild, type LongHistoryRow } from '../seed/fixtures/long-history'
import {
  buildTable,
  findPatterns,
  historySlots,
  missingSlots,
  termOf,
  type LongViewRecord,
} from '../../packages/profiling/src/logic'
import type { JemmaDb } from '../../packages/profiling/src/db'

const YEAR = 2026
const TEACHER = CAST.teacher.displayName

/** A fixture row as the logic reads a `learner_records` row. The id says where in the fixture it is. */
function asRecords(rows: LongHistoryRow[], child: LongHistoryChild): LongViewRecord[] {
  return rows
    .filter((r) => r.child === child)
    .map((r, i) => ({
      id: `${child}-${i}`, source: r.source, grade: r.grade, year: r.year, term: r.term, happenedOn: r.happened_on, loggedAt: r.logged_at,
      teacherName: r.teacher_name, title: r.title, family: r.family, topicName: r.topic_name, marks: r.marks, outOf: r.out_of,
      quality: r.quality, text: r.text, present: r.present, total: r.total,
    }))
}

const analyse = (rows: LongHistoryRow[], child: LongHistoryChild) => {
  const records = asRecords(rows, child)
  const { table, notCounted } = buildTable(records, [])
  return { records, table, notCounted, candidates: findPatterns(table), missing: missingSlots(historySlots(records, [])) }
}

const rows = longHistory(YEAR, TEACHER)
const slotName = (t: { year: number; term: number }) => `${t.year} T${t.term}`

describe('the long history fixture', () => {
  test('is the same every time and depends only on the class year', () => {
    expect(longHistory(YEAR, TEACHER)).toEqual(rows)
    const later = longHistory(YEAR + 5, TEACHER)
    expect(later).toHaveLength(rows.length)
    for (const child of LONG_HISTORY_CHILDREN) {
      const keys = (r: LongHistoryRow[]) => analyse(r, child).candidates.map((c) => [c.key, c.terms.map((t) => [t.grade, t.term])])
      expect(keys(later)).toEqual(keys(rows))
    }
  })

  test('covers Grade 4 and 5 (4 terms each) and Grade 6 (terms 1 and 2), with the right teachers', () => {
    const amina = rows.filter((r) => r.child === 'amina')
    const slots = [...new Set(amina.map((r) => `${r.grade}.${r.year}.${r.term}`))].sort()
    expect(slots).toEqual([
      ...[1, 2, 3, 4].map((t) => `4.${YEAR - 2}.${t}`),
      ...[1, 2, 3, 4].map((t) => `5.${YEAR - 1}.${t}`),
      ...[1, 2].map((t) => `6.${YEAR}.${t}`),
    ].sort())
    const teachers = (grade: number) => [...new Set(rows.filter((r) => r.grade === grade).map((r) => r.teacher_name))]
    expect(teachers(4)).toEqual(['Mr Dube'])
    expect(teachers(5)).toEqual(['Mrs Naidoo'])
    expect(teachers(6)).toEqual([TEACHER])
  })

  test('every date is inside its term and the family is one of the six', () => {
    for (const r of rows) {
      expect(termOf(r.happened_on)).toBe(r.term)
      expect(Number(r.happened_on.slice(0, 4))).toBe(r.year)
      if (r.family) expect(FAMILIES).toContain(r.family)
    }
  })

  test('each piece is logged 1 to 7 days after it happened, except one that is five months late', () => {
    const days = (r: LongHistoryRow) => (Date.parse(r.logged_at) - Date.parse(`${r.happened_on}T00:00:00Z`)) / 86_400_000
    const late = rows.filter((r) => days(r) > 8)
    expect(late).toHaveLength(1)
    expect(late[0]).toMatchObject({ child: 'lerato', grade: 5, term: 3, source: 'quiz' })
    expect(days(late[0]!)).toBeGreaterThan(140)
    for (const r of rows.filter((r) => r !== late[0])) expect(days(r)).toBeGreaterThanOrEqual(1)
  })

  test('two or three marked pieces per learner per term, one attendance record, one or two notes per year', () => {
    for (const child of LONG_HISTORY_CHILDREN) {
      const mine = rows.filter((r) => r.child === child)
      const terms = [...new Set(mine.map((r) => `${r.year}.${r.term}`))]
      for (const t of terms) {
        const marked = mine.filter((r) => `${r.year}.${r.term}` === t && ['quiz', 'assignment', 'project'].includes(r.source))
        expect(marked.length).toBeGreaterThanOrEqual(2)
        expect(marked.length).toBeLessThanOrEqual(3)
        expect(mine.filter((r) => `${r.year}.${r.term}` === t && r.source === 'attendance')).toHaveLength(1)
      }
      for (const grade of [4, 5, 6]) {
        const notes = mine.filter((r) => r.grade === grade && r.source === 'note').length
        expect(notes).toBeGreaterThanOrEqual(1)
        expect(notes).toBeLessThanOrEqual(2)
      }
    }
  })

  test('no two pieces of one learner share a title and a day', () => {
    for (const child of LONG_HISTORY_CHILDREN) {
      const keys = rows.filter((r) => r.child === child).map((r) => `${r.title}|${r.happened_on}`)
      expect(new Set(keys).size).toBe(keys.length)
    }
  })

  test('Amina: a struggle in fractions ending in Grade 6 Term 2, a strength in shapes over 4 or more terms, and the Grade 5 note', () => {
    const { candidates, missing, records } = analyse(rows, 'amina')
    expect(candidates.map((c) => c.key)).toEqual(['struggle:fractions', 'strength:shapes'])
    const fractions = candidates[0]!
    expect(fractions.terms.length).toBeGreaterThanOrEqual(3)
    expect(fractions.terms.at(-1)).toMatchObject({ grade: 6, year: YEAR, term: 2 })
    expect(fractions.terms.every((t) => t.percent < 50)).toBe(true)
    const shapes = candidates[1]!
    expect(shapes.terms.length).toBeGreaterThanOrEqual(4)
    expect(shapes.terms.every((t) => t.percent >= 80)).toBe(true)
    // One term has no shapes work: it is named, not guessed.
    expect(shapes.missingTerms.map(slotName)).toEqual([`${YEAR - 1} T3`])
    expect(missing).toEqual([])
    const note = records.find((r) => r.source === 'note' && r.grade === 5 && r.teacherName === 'Mrs Naidoo' && /bottom numbers/.test(r.text ?? '') && /guess/.test(r.text ?? ''))
    expect(note).toBeTruthy()
  })

  test('Thabo: nothing for Grade 5 Terms 2 and 3, and a strength in data across the terms that exist', () => {
    const { candidates, missing, records } = analyse(rows, 'thabo')
    expect(records.filter((r) => r.grade === 5 && (r.term === 2 || r.term === 3))).toEqual([])
    expect(missing.map(slotName)).toEqual([`${YEAR - 1} T2`, `${YEAR - 1} T3`])
    expect(candidates.map((c) => c.key)).toEqual(['strength:data'])
    expect(candidates[0]!.missingTerms.map(slotName)).toEqual([`${YEAR - 1} T2`, `${YEAR - 1} T3`])
    expect(candidates[0]!.terms.length).toBeGreaterThanOrEqual(5)
  })

  test('Lerato: a strength in whole numbers, and a quiz logged five months late that still counts', () => {
    const { candidates, records } = analyse(rows, 'lerato')
    expect(candidates.map((c) => c.key)).toEqual(['strength:whole_numbers'])
    const late = records.find((r) => (Date.parse(r.loggedAt) - Date.parse(r.happenedOn)) / 86_400_000 > 60)!
    expect(late).toMatchObject({ grade: 5, term: 3, family: 'whole_numbers', quality: 'clear' })
    const strength = candidates[0]!
    expect(strength.terms.some((t) => t.grade === 5 && t.term === 3)).toBe(true)
    expect(strength.evidence.map((e) => e.id)).toContain(late.id)
  })

  test('Sipho: low fractions marks, two unclear, so no pattern, and both are listed as not counted', () => {
    const { candidates, notCounted, records, table } = analyse(rows, 'sipho')
    const fractions = records.filter((r) => r.family === 'fractions')
    expect(fractions).toHaveLength(3)
    expect(fractions.filter((r) => r.quality === 'unclear')).toHaveLength(2)
    expect(candidates).toEqual([])
    expect(notCounted).toHaveLength(2)
    expect(notCounted.map((n) => n.id).sort()).toEqual(fractions.filter((r) => r.quality === 'unclear').map((r) => r.id).sort())
    expect(table.find((f) => f.family === 'fractions')!.slots).toHaveLength(1)
    // Counted as clear, the same three marks would be a struggle: the unclear rule is what keeps it out.
    const counted = buildTable(records.map((r) => ({ ...r, quality: 'clear' as const })), []).table
    expect(findPatterns(counted).map((c) => c.key)).toEqual(['struggle:fractions'])
  })

  test('Naledi: a struggle in measurement over 3 terms, and two terms of poor attendance', () => {
    const { candidates, records } = analyse(rows, 'naledi')
    expect(candidates.map((c) => c.key)).toEqual(['struggle:measurement'])
    expect(candidates[0]!.terms).toHaveLength(3)
    const attendance = records.filter((r) => r.source === 'attendance')
    const poor = attendance.filter((r) => r.present! / r.total! < 0.75)
    expect(poor).toHaveLength(2)
    expect(attendance.filter((r) => r.present! / r.total! >= 0.85)).toHaveLength(attendance.length - 2)
  })
})

// A real start sandbox gets the same rows.
const url = process.env.SUPABASE_URL!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }) as unknown as JemmaDb
const sandboxIds: string[] = []
afterAll(async () => {
  await Promise.all(sandboxIds.map((id) => deleteSandbox(admin, id).catch(() => undefined)))
}, 120_000)

async function ok<T>(q: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<NonNullable<T>> {
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return data as NonNullable<T>
}

describe('the start sandbox', () => {
  test('has the long history in learner_records, and findPatterns on those rows gives the designed outcomes', async () => {
    const s = await createSandbox(admin)
    sandboxIds.push(s.sandboxId)
    const kids = await ok(admin.from('children').select('id, first_name').eq('school_id', s.schoolId))
    const stored = await ok(admin.from('learner_records').select('*').in('child_id', kids.map((k) => k.id)))
    const year = new Date().getUTCFullYear()
    expect(stored).toHaveLength(longHistory(year, TEACHER).length)
    expect(new Set(stored.map((r) => r.school_id))).toEqual(new Set([s.schoolId]))

    const keysOf = async (name: string) => {
      const id = kids.find((k) => k.first_name === name)!.id
      const mine: LongViewRecord[] = stored.filter((r) => r.child_id === id).map((r) => ({
        id: r.id, source: r.source as LongViewRecord['source'], grade: r.grade, year: r.year, term: r.term, happenedOn: r.happened_on, loggedAt: r.logged_at,
        teacherName: r.teacher_name, title: r.title, family: r.family, topicName: r.topic_name, marks: r.marks, outOf: r.out_of,
        quality: r.quality as 'clear' | 'unclear', text: r.text, present: r.present, total: r.total,
      }))
      return findPatterns(buildTable(mine, []).table).map((c) => c.key)
    }
    expect(await keysOf('Amina')).toEqual(['struggle:fractions', 'strength:shapes'])
    expect(await keysOf('Thabo')).toEqual(['strength:data'])
    expect(await keysOf('Lerato')).toEqual(['strength:whole_numbers'])
    expect(await keysOf('Sipho')).toEqual([])
    expect(await keysOf('Naledi')).toEqual(['struggle:measurement'])
  }, 120_000)
})
