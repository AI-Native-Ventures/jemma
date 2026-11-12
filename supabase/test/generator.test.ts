import { describe, expect, test } from 'vitest'
import { FIRST_NAMES, NEUTRAL_FAMILIES, familiesFor, makeLearners, slotsFor, type MadeBatch, type MadeLearner, type MakeLearnersInput } from '../seed/generator'
import { buildTable, findPatterns, type LongViewRecord } from '../../packages/profiling/src/logic/long-view'
import { strandOrder } from '../../packages/profiling/src/logic/strands'

// The made-up learner generator: deterministic, realistically messy, and the patterns it plants are the patterns the finder finds.

const base: MakeLearnersInput = {
  subject: 'Mathematics', grade: 5, year: 2026, count: 6, seed: 'unit', families: strandOrder('Mathematics'), teacherNames: ['Mr Dube', 'Mrs Naidoo', 'Ms Banda'],
}

const asRecords = (l: MadeLearner): LongViewRecord[] =>
  l.records.map((r, i) => ({
    id: `${l.firstName}-${i}`, source: r.source, grade: r.grade, year: r.year, term: r.term, happenedOn: r.happened_on, loggedAt: r.logged_at,
    teacherName: r.teacher_name, title: r.title, family: r.family, topicName: r.topic_name, marks: r.marks, outOf: r.out_of, quality: r.quality,
    text: r.text, present: r.present, total: r.total, subject: r.subject,
  }))

const found = (l: MadeLearner) => findPatterns(buildTable(asRecords(l), []).table)

/** Marked work by (subject, family, term): the sum of what counts and the number of marks it stands on, for the thin-term check. */
function thinTerms(l: MadeLearner): number {
  const by = new Map<string, number>()
  for (const r of l.records) {
    if (!['quiz', 'assignment', 'project'].includes(r.source) || r.quality === 'unclear') continue
    const key = `${r.subject}|${r.family}|${r.year}|${r.term}`
    by.set(key, (by.get(key) ?? 0) + (r.out_of ?? 0))
  }
  return [...by.values()].filter((points) => points > 0 && points < 3).length
}

function present(batch: MadeBatch) {
  const every = (pick: (l: MadeLearner) => boolean) => batch.learners.some(pick)
  const keyOf = (r: MadeLearner['records'][number]) => JSON.stringify(r)
  return {
    missingTerms: every((l) => {
      const terms = new Set(l.records.map((r) => `${r.year}-${r.term}`))
      return slotsFor(l.grade, base.year).filter((s) => !terms.has(`${s.year}-${s.term}`)).length >= 2
    }),
    lateResult: every((l) => l.records.some((r) => ['quiz', 'assignment', 'project'].includes(r.source) && Date.parse(r.logged_at) - Date.parse(r.happened_on) > 90 * 86_400_000)),
    thinTerm: every((l) => thinTerms(l) > 0),
    differentTeacherEachYear: every((l) => new Set(l.records.map((r) => `${r.year}|${r.teacher_name}`)).size > new Set(l.records.map((r) => r.year)).size - 1 && new Set(l.records.map((r) => r.teacher_name)).size >= 3),
    attendanceGaps: every((l) => {
      const have = l.records.filter((r) => r.source === 'attendance')
      const lowTerm = have.some((r) => r.present !== null && r.total !== null && r.present / r.total < 0.7)
      const terms = new Set(l.records.map((r) => `${r.year}-${r.term}`))
      const gap = [...terms].some((t) => !have.some((r) => `${r.year}-${r.term}` === t))
      return lowTerm || gap
    }),
    unclear: every((l) => l.records.filter((r) => r.quality === 'unclear').length === 1),
    duplicate: every((l) => {
      const seen = new Set<string>()
      return l.records.some((r) => (seen.has(keyOf(r)) ? true : (seen.add(keyOf(r)), false)))
    }),
    notesDisagree: every((l) => {
      const notes = l.records.filter((r) => r.source === 'note').map((r) => r.text ?? '')
      return notes.some((a) => a.startsWith('Confident in ') && notes.some((b) => b === a.replace('Confident in ', 'Unsure in ').replace(' and answers questions aloud.', ' and avoids explaining it aloud.')))
    }),
  }
}

describe('the generator is deterministic', () => {
  test('the same seed gives the same rows, another seed gives others', () => {
    const a = makeLearners(base)
    expect(makeLearners(base)).toEqual(a)
    expect(JSON.stringify(makeLearners({ ...base, seed: 'other' }))).not.toBe(JSON.stringify(a))
  })

  test('it never reads the clock or Math.random', () => {
    const realRandom = Math.random
    const RealDate = Date
    Math.random = () => {
      throw new Error('Math.random was used')
    }
    // `Date.now()` and `new Date()` with no argument would give the clock; parsing and `new Date(ms)` do not.
    globalThis.Date = class extends RealDate {
      constructor(...args: ConstructorParameters<DateConstructor>) {
        if (args.length === 0) throw new Error('the clock was read')
        super(...args)
      }
      static override now(): number {
        throw new Error('the clock was read')
      }
    } as DateConstructor
    try {
      expect(makeLearners(base).learners).toHaveLength(6)
    } finally {
      Math.random = realRandom
      globalThis.Date = RealDate
    }
  })

  test('first names come from the list, are not repeated in a class, and avoid the names asked', () => {
    const batch = makeLearners({ ...base, count: 12, avoidNames: ['Kofi', 'zanele'] })
    const names = batch.learners.map((l) => l.firstName)
    expect(new Set(names).size).toBe(12)
    for (const n of names) expect(FIRST_NAMES as readonly string[]).toContain(n)
    expect(names).not.toContain('Kofi')
    expect(names).not.toContain('Zanele')
    expect(FIRST_NAMES.length).toBeGreaterThanOrEqual(60)
    for (const real of ['Amina', 'Thabo', 'Lerato', 'Sipho', 'Naledi']) expect(FIRST_NAMES as readonly string[]).not.toContain(real)
  })
})

describe('the records are messy on purpose', () => {
  for (const seed of ['a', 'b', 'c', 'd']) {
    test(`every kind of mess is in a batch of six (seed ${seed})`, () => {
      const batch = makeLearners({ ...base, seed })
      expect(present(batch)).toEqual({
        missingTerms: true, lateResult: true, thinTerm: true, differentTeacherEachYear: true, attendanceGaps: true, unclear: true, duplicate: true, notesDisagree: true,
      })
      // And the generator says which learner carries which kind.
      const kinds = new Set(batch.learners.flatMap((l) => l.mess))
      expect(kinds).toEqual(new Set(['missing_terms', 'late_result', 'thin_term', 'attendance_gaps', 'unclear', 'duplicate', 'notes_disagree']))
    })
  }

  test('a bigger batch still has them all, and every row is well formed', () => {
    const batch = makeLearners({ ...base, count: 12 })
    expect(Object.values(present(batch)).every(Boolean)).toBe(true)
    for (const l of batch.learners) {
      for (const r of l.records) {
        expect(r.happened_on).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        expect(Number.isNaN(Date.parse(r.logged_at))).toBe(false)
        expect(Date.parse(r.logged_at)).toBeGreaterThan(Date.parse(r.happened_on))
        if (['quiz', 'assignment', 'project'].includes(r.source)) {
          expect(r.marks).not.toBeNull()
          expect(r.out_of).toBeGreaterThan(0)
          expect(r.marks!).toBeLessThanOrEqual(r.out_of!)
          expect(r.family).toBeTruthy()
          expect(r.subject).toBeTruthy()
        } else {
          expect(r.subject).toBeNull()
          expect(r.family).toBeNull()
        }
        if (r.source === 'attendance') expect(r.present!).toBeLessThanOrEqual(r.total!)
      }
    }
  })

  test('a learner has records in the class subject and up to two other subjects, for up to three years', () => {
    const batch = makeLearners(base)
    const subjects = new Set(batch.learners.flatMap((l) => l.records.map((r) => r.subject).filter(Boolean)))
    expect(subjects).toEqual(new Set(['Mathematics', 'English', 'Natural Sciences']))
    const years = new Set(batch.learners.flatMap((l) => l.records.map((r) => r.year)))
    expect(years).toEqual(new Set([2024, 2025, 2026]))
    expect(Math.min(...batch.learners.flatMap((l) => l.records.map((r) => r.grade)))).toBe(3)
    expect(Math.max(...batch.learners.flatMap((l) => l.records.map((r) => r.grade)))).toBe(5)
  })
})

/** The planted patterns equal the patterns the finder finds, learner by learner, and nothing else is found. */
function expectPlantedEqualsFound(batch: MadeBatch) {
  let plantedCount = 0
  for (const l of batch.learners) {
    const patterns = found(l)
    if (!l.planted) {
      expect(patterns.map((p) => `${p.subject}/${p.key}`), `unplanted pattern for ${l.firstName}`).toEqual([])
      continue
    }
    plantedCount++
    expect(patterns.map((p) => `${p.subject}/${p.key}`), `patterns for ${l.firstName}`).toEqual([`${l.planted.subject}/${l.planted.kind}:${l.planted.family}`])
    const p = patterns[0]!
    expect(p.terms.map((t) => [t.grade, t.year, t.term])).toEqual(l.planted.run.map((s) => [s.grade, s.year, s.term]))
    expect(p.since).toHaveLength(l.planted.since)
  }
  return plantedCount
}

describe('planted patterns are what the finder finds', () => {
  test('Mathematics Grade 5: about half the learners carry one, the rest none', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f']) {
      const batch = makeLearners({ ...base, seed, count: 8 })
      const n = expectPlantedEqualsFound(batch)
      expect(n).toBe(4)
      expect(batch.planted).toHaveLength(4)
      expect(new Set(batch.planted.map((p) => p.kind))).toEqual(new Set(['strength', 'struggle']))
    }
  })

  test('the planted list names the learner, and matches the learners', () => {
    const batch = makeLearners(base)
    for (const p of batch.planted) {
      const l = batch.learners.find((x) => x.firstName === p.firstName)!
      expect(l.planted).toMatchObject({ subject: p.subject, family: p.family, kind: p.kind })
    }
  })

  test('Natural Sciences, Grade 9', () => {
    for (const seed of ['x', 'y', 'z']) {
      const batch = makeLearners({ ...base, subject: 'Natural Sciences', grade: 9, seed, families: familiesFor('Natural Sciences'), count: 8 })
      expect(expectPlantedEqualsFound(batch)).toBe(4)
      for (const l of batch.learners) {
        expect(Math.max(...l.records.map((r) => r.grade))).toBe(9)
        expect(Math.min(...l.records.map((r) => r.grade))).toBe(7)
      }
      expect(batch.planted.every((p) => p.subject === 'Natural Sciences')).toBe(true)
      expect(Object.values(present(makeLearners({ ...base, subject: 'Natural Sciences', grade: 9, seed, families: familiesFor('Natural Sciences') }))).every(Boolean)).toBe(true)
    }
  })

  test('an Other subject uses the neutral strands', () => {
    expect(familiesFor('Woodwork')).toEqual([...NEUTRAL_FAMILIES])
    for (const seed of ['p', 'q']) {
      const batch = makeLearners({ ...base, subject: 'Woodwork', grade: 10, seed, families: familiesFor('Woodwork'), count: 8 })
      expect(expectPlantedEqualsFound(batch)).toBe(4)
      const own = batch.learners.flatMap((l) => l.records.filter((r) => r.subject === 'Woodwork'))
      expect(new Set(own.map((r) => r.family))).toEqual(new Set(NEUTRAL_FAMILIES))
      expect(batch.planted.every((p) => p.subject === 'Woodwork' && (NEUTRAL_FAMILIES as readonly string[]).includes(p.family))).toBe(true)
    }
  })

  test('strand families come from the approved map first, then the usual strands, then the job families, then three neutral ones', () => {
    expect(familiesFor('Mathematics', ['fractions', 'fractions', 'decimals'])).toEqual(['fractions', 'decimals'])
    expect(familiesFor('English', [])).toEqual(['reading', 'writing', 'language', 'speaking_listening'])
    expect(familiesFor('Natural Sciences', null)).toEqual(strandOrder('Natural Sciences'))
    expect(familiesFor('Social Sciences').length).toBeGreaterThan(0)
    expect(familiesFor('Zulu poetry')).toEqual(['knowledge', 'skills', 'application'])
  })

  test('works for every grade from 1 to 12', () => {
    for (let grade = 1; grade <= 12; grade++) {
      const batch = makeLearners({ ...base, grade, seed: `g${grade}`, count: 6 })
      expect(batch.learners).toHaveLength(6)
      expectPlantedEqualsFound(batch)
      const slots = slotsFor(grade, 2026)
      expect(slots.length).toBe(grade === 1 ? 2 : grade === 2 ? 6 : 10)
      expect(slots.at(-1)).toEqual({ grade, year: 2026, term: 2 })
      for (const l of batch.learners) expect(l.records.length).toBeGreaterThan(0)
    }
  })

  test('noise never becomes a pattern, over many seeds', () => {
    for (let i = 0; i < 40; i++) expectPlantedEqualsFound(makeLearners({ ...base, seed: `many-${i}`, grade: 4 + (i % 6), count: 6 }))
  })
})

describe('the five learners of 6B', () => {
  const five = ['Amina', 'Thabo', 'Lerato', 'Sipho', 'Naledi']
  test('named learners, marks only, a requested pattern and terms away', () => {
    const batch = makeLearners({
      subject: 'English', grade: 6, year: 2026, count: 99, seed: 'six-b', families: strandOrder('English'), teacherNames: ['Mr Dube', 'Mrs Naidoo', 'Mr Dlamini'],
      names: five, subjects: ['English'], marksOnly: true,
      plant: [{ family: 'writing', kind: 'struggle', since: 0 }, null, { family: 'language', kind: 'strength' }, null, null],
      away: [[], [5, 6], [], [], []],
    })
    expect(batch.learners.map((l) => l.firstName)).toEqual(five)
    for (const l of batch.learners) {
      expect(l.records.every((r) => ['quiz', 'assignment', 'project'].includes(r.source) && r.subject === 'English')).toBe(true)
      expect(l.records.every((r) => r.teacher_name === (r.grade === 4 ? 'Mr Dube' : r.grade === 5 ? 'Mrs Naidoo' : 'Mr Dlamini'))).toBe(true)
    }
    expectPlantedEqualsFound(batch)
    expect(batch.planted.map((p) => `${p.firstName}:${p.subject}:${p.family}:${p.kind}`)).toEqual(['Amina:English:writing:struggle', 'Lerato:English:language:strength'])
    // Thabo has nothing in two terms of Grade 5.
    const thabo = batch.learners[1]!
    const terms = new Set(thabo.records.map((r) => `${r.grade}-${r.term}`))
    expect(terms.has('5-2')).toBe(false)
    expect(terms.has('5-3')).toBe(false)
    expect(terms.has('5-1')).toBe(true)
  })

  test('a planted pattern in another subject than the class subject', () => {
    const batch = makeLearners({
      subject: 'Mathematics', grade: 6, year: 2026, count: 1, seed: 'two', families: strandOrder('Mathematics'), teacherNames: ['Mr Dube', 'Mrs Naidoo', 'Ms Banda'],
      names: ['Amina'], subjects: ['English', 'Natural Sciences'], marksOnly: true, plant: [{ subject: 'Natural Sciences', family: 'life_living', kind: 'strength' }],
    })
    expect(expectPlantedEqualsFound(batch)).toBe(1)
    expect(batch.planted[0]).toMatchObject({ subject: 'Natural Sciences', family: 'life_living', kind: 'strength' })
  })
})
