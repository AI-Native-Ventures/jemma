import { render, screen, within } from '@testing-library/react'
import { buildMyMaths } from '@jemma/profiling/logic'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MyMathsView } from '../lib/data/p80'
import { capsLine, groupByTerm, isCapsDraft, withoutTermSuffix } from '../lib/map-source'
import { mapSourceOf } from '../lib/data/map-source'

// P115: a part of "My maths" lists the topics of a CAPS map under "Term N" headings and shows their names without "(Term N)", so a topic that CAPS
// teaches twice in a year (Grade 9 algebra in Term 1 and again in Term 3) does not look like a duplicate. A map that is not from CAPS keeps its flat
// list, and the line "From the CAPS curriculum for Grade N." shows for a CAPS map only. The data, the router and the actions are doubles: no database.

const state = vi.hoisted(() => ({ view: null as unknown }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
vi.mock('../app/k/actions', () => ({ startPractice: vi.fn(async () => ({ ok: true })), retryPractice: vi.fn(async () => ({ ok: true })) }))
vi.mock('../lib/data/p80', () => ({ getMyMaths: async () => state.view }))
// P142: a part page asks the teaching library which topics have lessons; here none does, and nothing reaches a database.
vi.mock('../lib/data/teaching', () => ({ libraryNames: async () => new Set<string>() }))
vi.mock('../lib/data/own-screens', () => ({ getScreenShape: async () => ({ workspace: 'school' }) }))
vi.mock('../app/k/own-actions', () => ({ setWorkspace: vi.fn(async () => ({ ok: true })), addMyGrade: vi.fn(async () => ({ ok: true })) }))

import MyMathsPartPage from '../app/k/maths/[family]/page'

const topic = (id: string, name: string, family: string, term: number, position: number) => ({ id, name, family, term, position, prerequisiteIds: [] as string[] })

// Grade 9 as the CAPS map stores it: algebra is taught in Term 1 and again in Term 3, and the second teaching has "(Term 3)" in its name.
const GRADE_9 = [
  topic('a1', 'Algebraic expressions', 'algebra', 1, 8),
  topic('a2', 'Algebraic equations', 'algebra', 1, 9),
  topic('f1', 'Functions and relationships', 'functions', 1, 7),
  topic('a3', 'Algebraic expressions (Term 3)', 'algebra', 3, 2),
  topic('a4', 'Algebraic equations (Term 3)', 'algebra', 3, 3),
  topic('g1', 'Graphs', 'functions', 3, 4),
  topic('s1', 'Geometry of 2D shapes', 'shapes', 2, 2),
]

const viewOf = (grade: number, topics: ReturnType<typeof topic>[], source?: MyMathsView['source']): MyMathsView => ({
  firstName: 'Sam',
  initial: 'S',
  status: 'free',
  maths: buildMyMaths({ now: new Date('2026-11-16T10:00:00.000Z'), subject: 'Mathematics', grade, topics, gaps: [], answers: [], sessions: [], history: [] }),
  ...(source ? { source } : {}),
})

const part = async (family: string) => render(await MyMathsPartPage({ params: Promise.resolve({ family }) }))
const section = (name: string) => within(screen.getByRole('region', { name }))

beforeEach(() => {
  state.view = viewOf(9, GRADE_9, { caps: true, grade: 9 })
})

describe('/k/maths/algebra for a Grade 9 learner on the CAPS map', () => {
  it('has two term headings, Term 1 then Term 3, in order', async () => {
    await part('algebra')
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Term 1', 'Term 3'])
  })

  it('shows expressions and equations under each heading', async () => {
    await part('algebra')
    for (const term of ['Term 1', 'Term 3']) {
      const under = section(term)
      expect(under.getAllByRole('listitem').map((li) => li.textContent?.split('No score yet')[0])).toEqual(['Algebraic expressions', 'Algebraic equations'])
    }
  })

  it('says no "(Term" anywhere on the page, and no topic of another part', async () => {
    await part('algebra')
    const text = document.body.textContent ?? ''
    expect(text).not.toContain('(Term')
    expect(text).not.toContain('Graphs')
    expect(text).not.toContain('Geometry of 2D shapes')
  })

  it('still practises the topic by its full name, so the second teaching is the topic of Term 3', async () => {
    await part('algebra')
    // the buttons keep the name the map stores: two rows with the same shown name never ask for the same practice
    expect(screen.getByRole('button', { name: 'Practise Algebraic expressions' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Practise Algebraic expressions (Term 3)' })).toBeTruthy()
  })

  it('says the map is the CAPS one for the grade, once, under the heading', async () => {
    await part('algebra')
    expect(screen.getAllByText('From the CAPS curriculum for Grade 9.')).toHaveLength(1)
    const h1 = screen.getByRole('heading', { level: 1, name: 'Algebra' })
    expect(h1.parentElement?.textContent).toContain('From the CAPS curriculum for Grade 9.')
  })

  it('a part taught in one term has one heading', async () => {
    await part('shapes')
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Term 2'])
    expect(screen.getByText('Geometry of 2D shapes')).toBeTruthy()
  })
})

describe('a map that is not from CAPS keeps its flat list', () => {
  it('an uploaded map: no term heading, the names as they are, and no CAPS line', async () => {
    state.view = viewOf(9, [topic('u1', 'Brackets', 'algebra', 1, 1), topic('u2', 'Solving for x (Term 3)', 'algebra', 3, 2), topic('u3', 'Word problems', 'algebra', 3, 3)], { caps: false, grade: 9 })
    await part('algebra')
    expect(screen.queryAllByRole('heading', { level: 2 })).toHaveLength(0)
    expect(screen.queryByText(/CAPS/)).toBeNull()
    expect(screen.getAllByRole('listitem').map((li) => li.textContent?.split('No score yet')[0])).toEqual(['Brackets', 'Solving for x (Term 3)', 'Word problems'])
  })

  it('a view with no source (the screens as they were) is flat and has no line', async () => {
    state.view = viewOf(9, GRADE_9)
    await part('algebra')
    expect(screen.queryAllByRole('heading', { level: 2 })).toHaveLength(0)
    expect(screen.queryByText(/CAPS/)).toBeNull()
    expect(screen.getAllByRole('listitem')).toHaveLength(4)
  })

  it('a CAPS map for a class with no grade shows its terms but no line', async () => {
    state.view = viewOf(9, GRADE_9, { caps: true, grade: null })
    await part('algebra')
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Term 1', 'Term 3'])
    expect(screen.queryByText(/CAPS/)).toBeNull()
  })
})

describe('the CAPS line shows only for a CAPS class', () => {
  it.each([
    [{ caps: true, grade: 9 }, 'From the CAPS curriculum for Grade 9.'],
    [{ caps: true, grade: 4 }, 'From the CAPS curriculum for Grade 4.'],
    [{ caps: true, grade: null }, null],
    [{ caps: false, grade: 9 }, null],
    [null, null],
    [undefined, null],
  ])('%j', (source, line) => {
    expect(capsLine(source)).toBe(line)
  })

  it('a part with no topic of its own shows no line (there is no list for it to describe)', async () => {
    state.view = viewOf(6, [topic('t1', 'Adding fractions', 'fractions', 4, 1)], { caps: true, grade: 6 })
    await part('whole_numbers')
    expect(screen.getByRole('heading', { level: 1, name: 'Whole numbers' })).toBeTruthy()
    expect(screen.getByText("Your teacher has not set up this year's topics yet.")).toBeTruthy()
    expect(screen.queryByText(/CAPS/)).toBeNull()
    expect(screen.queryAllByRole('heading', { level: 2 })).toHaveLength(0)
  })
})

describe('withoutTermSuffix, groupByTerm, isCapsDraft', () => {
  it('takes " (Term N)" off the end and nothing else', () => {
    expect(withoutTermSuffix('Algebraic expressions (Term 3)')).toBe('Algebraic expressions')
    expect(withoutTermSuffix('Functions and relationships (term 3) ')).toBe('Functions and relationships')
    expect(withoutTermSuffix('Algebraic expressions')).toBe('Algebraic expressions')
    expect(withoutTermSuffix('Term 3 revision')).toBe('Term 3 revision')
    expect(withoutTermSuffix('(Term 3)')).toBe('(Term 3)')
  })

  it('groups by term, lowest first, and keeps the order inside a term', () => {
    const rows = [{ term: 3, n: 'c' }, { term: 1, n: 'a' }, { term: 3, n: 'd' }, { term: 1, n: 'b' }]
    expect(groupByTerm(rows, { caps: true, grade: 9 })?.map((g) => [g.term, g.topics.map((t) => t.n)])).toEqual([[1, ['a', 'b']], [3, ['c', 'd']]])
  })

  it('does not group a map that is not CAPS, or one whose source is not known', () => {
    expect(groupByTerm([{ term: 1 }], { caps: false, grade: 9 })).toBeNull()
    expect(groupByTerm([{ term: 1 }], null)).toBeNull()
    expect(groupByTerm([{ term: 1 }], undefined)).toBeNull()
  })

  it('reads the source of a map the way the map is stored', () => {
    expect(isCapsDraft({ grade: 9, terms: [], source: { kind: 'caps', title: 'CAPS', publisher: 'DBE', address: 'x' } })).toBe(true)
    expect(isCapsDraft({ grade: 9, terms: [] })).toBe(false)
    expect(isCapsDraft({ source: { kind: 'upload' } })).toBe(false)
    expect(isCapsDraft({ source: 'caps' })).toBe(false)
    expect(isCapsDraft(null)).toBe(false)
    expect(isCapsDraft('caps')).toBe(false)
  })
})

describe('mapSourceOf reads the classes of the learner and the source of their approved maps', () => {
  type Table = { data: unknown[] | null; error: { message: string } | null }
  /** A stand-in for the service client: each table answers what it was given, whatever the filters ask. The filters are recorded. */
  const fakeDb = (tables: Record<string, Table>, asked: { table: string; ins: Record<string, unknown[]> }[] = []) => {
    const from = (table: string) => {
      const entry = { table, ins: {} as Record<string, unknown[]> }
      asked.push(entry)
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.eq = () => q
      q.in = (col: string, values: unknown[]) => ((entry.ins[col] = values), q)
      q.then = (resolve: (v: Table) => unknown) => resolve(tables[table] ?? { data: [], error: null })
      return q
    }
    return { from } as never
  }
  const caps = { grade: 9, terms: [], source: { kind: 'caps', title: 't', publisher: 'p', address: 'a' } }
  const enrol = (...ids: string[]): Table => ({ data: ids.map((class_id) => ({ class_id })), error: null })

  it('a class with an approved CAPS map is CAPS, with the grade of the class', async () => {
    const db = fakeDb({ enrolments: enrol('c1'), classes: { data: [{ id: 'c1', grade: 9 }], error: null }, curriculum_maps: { data: [{ draft: caps }], error: null } })
    expect(await mapSourceOf(db, 'child-1')).toEqual({ caps: true, grade: 9 })
  })

  it('an uploaded map is not CAPS', async () => {
    const db = fakeDb({ enrolments: enrol('c1'), classes: { data: [{ id: 'c1', grade: 9 }], error: null }, curriculum_maps: { data: [{ draft: { grade: 9, terms: [] } }], error: null } })
    expect(await mapSourceOf(db, 'child-1')).toEqual({ caps: false, grade: 9 })
  })

  it('a class with no approved map is not CAPS', async () => {
    const db = fakeDb({ enrolments: enrol('c1'), classes: { data: [{ id: 'c1', grade: 9 }], error: null }, curriculum_maps: { data: [], error: null } })
    expect(await mapSourceOf(db, 'child-1')).toEqual({ caps: false, grade: 9 })
  })

  it('a map that mixes CAPS and not is not CAPS', async () => {
    const db = fakeDb({
      enrolments: enrol('c1', 'c2'),
      classes: { data: [{ id: 'c1', grade: 9 }], error: null },
      curriculum_maps: { data: [{ draft: caps }, { draft: { grade: 9, terms: [] } }], error: null },
    })
    expect((await mapSourceOf(db, 'child-1')).caps).toBe(false)
  })

  it('with a class id it reads that class only', async () => {
    const asked: { table: string; ins: Record<string, unknown[]> }[] = []
    const db = fakeDb({ enrolments: enrol('c1', 'c2'), classes: { data: [{ id: 'c2', grade: 7 }], error: null }, curriculum_maps: { data: [{ draft: caps }], error: null } }, asked)
    expect(await mapSourceOf(db, 'child-1', 'c2')).toEqual({ caps: true, grade: 7 })
    expect(asked.find((a) => a.table === 'classes')?.ins.id).toEqual(['c2'])
    expect(asked.find((a) => a.table === 'curriculum_maps')?.ins.class_id).toEqual(['c2'])
  })

  it('a class the learner is not in, no class at all, or a failed read says not CAPS and no grade', async () => {
    expect(await mapSourceOf(fakeDb({ enrolments: enrol('c1') }), 'child-1', 'c9')).toEqual({ caps: false, grade: null })
    expect(await mapSourceOf(fakeDb({ enrolments: enrol() }), 'child-1')).toEqual({ caps: false, grade: null })
    expect(await mapSourceOf(fakeDb({ enrolments: { data: null, error: { message: 'down' } } }), 'child-1')).toEqual({ caps: false, grade: null })
    const failing = fakeDb({ enrolments: enrol('c1'), classes: { data: [{ id: 'c1', grade: 9 }], error: null }, curriculum_maps: { data: null, error: { message: 'down' } } })
    expect(await mapSourceOf(failing, 'child-1')).toEqual({ caps: false, grade: null })
  })
})
