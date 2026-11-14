import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { capsDraft, capsGrades, capsSource } from '../../src/curriculum/caps'
import { canonicalFamily, strandLabel } from '../../src/logic'
import { TopicMapDraftSchema } from '../../src/schemas'

// The official South African Mathematics curriculum (CAPS), Grades 1 to 12, as 12 files, and the one module that turns a grade into a draft
// topic map. No database, no model.

const DIR = join(import.meta.dirname, '../../../../fixtures/curriculum/caps')
const FAMILIES = [
  'whole_numbers', 'fractions', 'decimals', 'shapes', 'measurement', 'data', 'patterns', 'probability',
  'integers_and_exponents', 'functions', 'algebra', 'trigonometry', 'analytical_geometry', 'finance', 'calculus',
]
type CapsFile = {
  grade: number
  phase: string
  subject: string
  country: string
  source: { title: string; publisher: string; url: string; pages: string }
  terms: { term: number; topics: { name: string; shortName: string; family: string; capsName: string; contentArea: string }[] }[]
}
const file = (grade: number): CapsFile => JSON.parse(readFileSync(join(DIR, `grade-${grade}.json`), 'utf8')) as CapsFile
const GRADES = Array.from({ length: 12 }, (_, i) => i + 1)

describe('the 12 files', () => {
  test.each(GRADES)('grade %i parses and says what it is', (grade) => {
    const f = file(grade)
    expect(f.grade).toBe(grade)
    expect(f.subject).toBe('Mathematics')
    expect(f.country).toBe('ZA')
    expect(f.source.title).not.toBe('')
    expect(f.source.publisher).not.toBe('')
    expect(f.source.url).toMatch(/^https:\/\//)
    expect(f.terms.length).toBeGreaterThan(0)
  })

  test.each(GRADES)('grade %i: every name and short name is filled in and unique in the grade, every family is a known one', (grade) => {
    const topics = file(grade).terms.flatMap((t) => t.topics)
    expect(topics.length).toBeGreaterThan(0)
    for (const t of topics) {
      expect(t.name.trim(), 'name').not.toBe('')
      expect(t.shortName.trim(), `short name of ${t.name}`).not.toBe('')
      expect(FAMILIES, `family of ${t.name}`).toContain(t.family)
    }
    const names = topics.map((t) => t.name)
    const shorts = topics.map((t) => t.shortName)
    expect(new Set(names).size, 'names are unique').toBe(names.length)
    expect(new Set(shorts).size, 'short names are unique').toBe(shorts.length)
  })

  test('there are 316 topics in all', () => {
    expect(GRADES.reduce((n, g) => n + file(g).terms.reduce((m, t) => m + t.topics.length, 0), 0)).toBe(316)
  })
})

describe('capsGrades and capsSource', () => {
  test('the grades are 1 to 12', () => {
    expect(capsGrades()).toEqual(GRADES)
  })

  test('each grade has a source: title, publisher and address', () => {
    for (const g of GRADES) {
      const s = capsSource(g)!
      expect(s, `grade ${g}`).not.toBeNull()
      expect(s.title).toMatch(/CAPS/)
      expect(s.publisher).toMatch(/Department of Basic Education/)
      expect(s.address).toMatch(/^https:\/\/www\.education\.gov\.za\//)
    }
  })

  test('the title and the publisher read as a sentence: no file name, no side notes in brackets', () => {
    for (const g of GRADES) {
      const s = capsSource(g)!
      expect(s.title, `grade ${g}`).not.toMatch(/PDF file name|National Curriculum Statement/)
      expect(s.publisher, `grade ${g}`).not.toContain('(')
      expect(`From ${s.title}, ${s.publisher}.`, `grade ${g}`).toMatch(/^From Curriculum and Assessment Policy Statement \(CAPS\)/)
    }
    expect(capsSource(4)!.title).toBe('Curriculum and Assessment Policy Statement (CAPS), Mathematics, Intermediate Phase, Grades 4-6')
    expect(capsSource(10)!.publisher).toBe('Department of Basic Education, Republic of South Africa')
  })

  test('an unknown grade has none', () => {
    for (const g of [0, 13, -1, 6.5, Number.NaN]) {
      expect(capsSource(g)).toBeNull()
      expect(capsDraft(g)).toBeNull()
    }
  })
})

describe('capsDraft', () => {
  test.each(GRADES)('grade %i is a draft topic map the review screen can read', (grade) => {
    const draft = capsDraft(grade)!
    expect(TopicMapDraftSchema.safeParse(draft).success).toBe(true)
    expect(draft.grade).toBe(grade)
    expect(draft.leftOut).toEqual([])
    expect(draft.terms.length).toBeGreaterThan(0)
    for (const t of draft.terms) expect(t.topics.length, `term ${t.term}`).toBeGreaterThan(0)
    const terms = draft.terms.map((t) => t.term)
    expect(terms).toEqual([...terms].sort((a, b) => a - b))
  })

  test('the file\'s terms and topics come in the file\'s order, with nothing to check and nothing invented', () => {
    for (const g of GRADES) {
      const f = file(g)
      const draft = capsDraft(g)!
      expect(draft.terms.map((t) => [t.term, t.topics.map((x) => x.name)])).toEqual(
        f.terms.filter((t) => t.topics.length > 0).map((t) => [t.term, t.topics.map((x) => x.name)]),
      )
      for (const topic of draft.terms.flatMap((t) => t.topics)) {
        expect(topic.prerequisites).toEqual([])
        expect(topic.misconceptions).toEqual([])
        expect(topic.check).toBeUndefined()
        expect(topic.shortName).toBeTruthy()
      }
    }
  })

  test('a term with no topic is left out', () => {
    for (const g of GRADES) for (const t of capsDraft(g)!.terms) expect(t.topics.length).toBeGreaterThan(0)
  })

  test('Grade 10 Term 1 holds "Algebraic expressions"', () => {
    const first = capsDraft(10)!.terms[0]!
    expect(first.term).toBe(1)
    expect(first.topics.map((t) => t.name)).toContain('Algebraic expressions')
  })

  test('every call gives a new object: a caller may change what it gets', () => {
    const a = capsDraft(5)!
    a.terms[0]!.topics[0]!.name = 'changed'
    expect(capsDraft(5)!.terms[0]!.topics[0]!.name).not.toBe('changed')
  })
})

describe('the strand keys of the CAPS files in the Long view', () => {
  test('every key reads as plain words: "Integers and exponents", "Analytical geometry"', () => {
    expect(strandLabel('Mathematics', 'integers_and_exponents')).toBe('Integers and exponents')
    expect(strandLabel('Mathematics', 'analytical_geometry')).toBe('Analytical geometry')
    for (const family of FAMILIES) {
      const label = strandLabel('Mathematics', family)
      expect(label, family).toMatch(/^[A-Z][a-z]/)
      expect(label, family).not.toContain('_')
    }
  })

  test('canonicalFamily leaves every one of them as it is, so the Long view keeps one row for each', () => {
    for (const family of FAMILIES) expect(canonicalFamily('Mathematics', family), family).toBe(family)
  })
})
