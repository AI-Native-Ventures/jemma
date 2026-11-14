// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

// "Start from the CAPS map" (P82): the official South African Mathematics topics of a grade become the class's draft map with one tap, with
// no document, no event and no model. The teacher checks and approves as before. No database: the server pieces are fakes.

type Call = { table: string; op: string; payload?: unknown; filters: Record<string, unknown> }
const state = vi.hoisted(() => ({
  owned: true,
  subject: 'Mathematics',
  grade: 9,
  country: 'ZA',
  approvedMaps: 0,
  existingDraft: null as string | null,
  calls: [] as Call[],
  events: 0,
  redirected: [] as string[],
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: (to: string) => state.redirected.push(to), notFound: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requireRole: async () => ({ userId: 'teacher-a', profile: {} }) }))
vi.mock('@/lib/agent', () => ({ sendEvent: async () => void state.events++, retryEvent: vi.fn() }))
vi.mock('@/lib/approvals', () => ({ recordApproval: vi.fn() }))

function chainFor(table: string) {
  const filters: Record<string, unknown> = {}
  let op = 'select'
  let payload: unknown
  const record = () => state.calls.push({ table, op, payload, filters: { ...filters } })
  const rows = (): unknown[] => {
    if (table === 'curriculum_maps' && filters.status === 'approved') return state.approvedMaps > 0 ? [{ id: 'map-approved' }] : []
    if (table === 'curriculum_maps' && filters.status === 'draft') return state.existingDraft ? [{ id: state.existingDraft }] : []
    return []
  }
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: (key: string, value: unknown) => ((filters[key] = value), chain),
    order: () => chain,
    update: (p: unknown) => ((op = 'update'), (payload = p), chain),
    insert: (p: unknown) => {
      op = 'insert'
      payload = p
      record()
      if (table === 'curriculum_maps') return { select: () => ({ single: async () => ({ data: { id: 'map-new' }, error: null }) }) }
      return Promise.resolve({ data: p, error: null })
    },
    limit: async () => ({ data: rows(), error: null }),
    single: async () => {
      if (table === 'classes') return { data: { id: 'cls', school_id: 'sch', name: '9A', grade: state.grade, subject: state.subject }, error: null }
      if (table === 'schools') return { data: { country: state.country, sandbox_id: null }, error: null }
      return { data: null, error: { message: 'not found' } }
    },
    maybeSingle: async () => ({
      data: table === 'classes' && state.owned ? { id: 'cls', school_id: 'sch', name: '9A', grade: state.grade, subject: state.subject } : null,
      error: null,
    }),
    then: (resolve: (v: unknown) => unknown) => {
      if (op === 'update') record()
      return Promise.resolve({ data: null, error: null }).then(resolve)
    },
  }
  return chain
}

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServer: async () => ({ from: chainFor }) }))
vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdmin: () => ({ from: chainFor, storage: { from: () => ({ copy: vi.fn() }) } }) }))

import { capsDraft } from '@jemma/profiling/caps'
import { capsFits, capsRefusal, curriculumStage, readDraft, toRaw } from '../app/t/[classId]/curriculum/format'
import { useCapsMap } from '../app/t/[classId]/curriculum/actions'

beforeEach(() => {
  state.owned = true
  state.subject = 'Mathematics'
  state.grade = 9
  state.country = 'ZA'
  state.approvedMaps = 0
  state.existingDraft = null
  state.calls = []
  state.events = 0
  state.redirected = []
})

const wrote = (table: string, op: string) => state.calls.filter((c) => c.table === table && c.op === op)

describe('who is offered the CAPS map', () => {
  it('a Mathematics class of a South African school in any grade from 1 to 12', () => {
    for (let grade = 1; grade <= 12; grade++) expect(capsFits('Mathematics', 'ZA', grade), `grade ${grade}`).toBe(true)
    expect(capsFits('Maths', 'za', 6)).toBe(true)
    expect(capsFits(' mathematics ', 'ZA', 6)).toBe(true)
    expect(capsFits('Mathematics', 'South Africa', 6)).toBe(true)
  })

  it('no other country, subject or grade', () => {
    expect(capsFits('Mathematics', 'KE', 6)).toBe(false)
    expect(capsFits('Mathematics', '', 6)).toBe(false)
    expect(capsFits('English', 'ZA', 6)).toBe(false)
    for (const grade of [0, 13, -1, 6.5, Number.NaN]) expect(capsFits('Mathematics', 'ZA', grade), `grade ${grade}`).toBe(false)
  })

  it('a refusal says why in plain words, and is null when the class is offered the map', () => {
    expect(capsRefusal('Mathematics', 'ZA', 9)).toBeNull()
    expect(capsRefusal('English', 'ZA', 9)).toBe('The CAPS map is for a Mathematics class.')
    expect(capsRefusal('Mathematics', 'KE', 9)).toBe('The CAPS map is for a school in South Africa.')
    expect(capsRefusal('Mathematics', 'ZA', 13)).toBe('The CAPS map covers Grades 1 to 12.')
  })
})

describe('what the curriculum screen shows', () => {
  const draftRaw = (docs: number) => ({ docs, read: true as const })

  it('an approved map that can be read is the approved board', () => {
    expect(curriculumStage({ status: 'approved', docs: 2, read: true })).toBe('approved')
    expect(curriculumStage({ status: 'approved', docs: 0, read: true })).toBe('approved')
  })

  it('nothing here: no map, or a map with no document and nothing to read', () => {
    expect(curriculumStage(null)).toBe('empty')
    expect(curriculumStage({ status: 'draft', docs: 0, read: false })).toBe('empty')
  })

  it('a draft that can be read is ready WITH or WITHOUT a document (the CAPS map has none)', () => {
    expect(curriculumStage({ status: 'draft', ...draftRaw(2) })).toBe('draft')
    expect(curriculumStage({ status: 'draft', ...draftRaw(0) })).toBe('draft')
  })

  it('documents and no draft yet: Jemma is reading', () => {
    expect(curriculumStage({ status: 'draft', docs: 1, read: false })).toBe('reading')
    expect(curriculumStage({ status: 'approved', docs: 1, read: false })).toBe('reading')
  })
})

describe('the stored draft', () => {
  it('toRaw keeps its old shape without a source, and readDraft reads it back with none', () => {
    const draft = capsDraft(5)!
    const raw = toRaw(draft, {})
    expect(Object.keys(raw).sort()).toEqual(['grade', 'leftOut', 'resolutions', 'terms'])
    expect(readDraft(raw)?.source).toBeUndefined()
  })

  it('a source is stored beside the draft and read back, and the draft itself is untouched', () => {
    const draft = capsDraft(5)!
    const source = { kind: 'caps' as const, title: 'T', publisher: 'P', address: 'https://www.education.gov.za/x.pdf' }
    const read = readDraft(toRaw(draft, { Topic: 'Keep in Term 2' }, source))!
    expect(read.source).toEqual(source)
    expect(read.resolutions).toEqual({ Topic: 'Keep in Term 2' })
    expect(read.draft).toEqual(draft)
  })

  it('something that is not a source is ignored', () => {
    expect(readDraft({ ...capsDraft(5)!, source: { kind: 'other', title: 1 } })?.source).toBeUndefined()
    expect(readDraft({ ...capsDraft(5)!, source: 'x' })?.source).toBeUndefined()
  })
})

describe('useCapsMap', () => {
  it('stores the draft of a South African Mathematics class in Grade 9, with its source, and says so in the log', async () => {
    const result = await useCapsMap('cls')
    expect(result).toEqual({ ok: true })
    const [update] = wrote('curriculum_maps', 'update')
    expect(update!.filters).toMatchObject({ id: 'map-new', status: 'draft' })
    const stored = readDraft((update!.payload as { draft: unknown }).draft)!
    expect(stored.draft).toEqual(capsDraft(9))
    expect(stored.source).toMatchObject({ kind: 'caps', publisher: expect.stringMatching(/Department of Basic Education/), address: expect.stringMatching(/^https:\/\//) })
    const count = capsDraft(9)!.terms.reduce((n, t) => n + t.topics.length, 0)
    const [line] = wrote('activity_log', 'insert')
    expect(line!.payload).toMatchObject({ school_id: 'sch', class_id: 'cls', text: `Loaded the CAPS map for Grade 9: ${count} topics` })
  })

  it('makes no document row, sends no event and calls no model', async () => {
    await useCapsMap('cls')
    expect(wrote('curriculum_docs', 'insert')).toHaveLength(0)
    expect(wrote('events', 'insert')).toHaveLength(0)
    expect(state.events).toBe(0)
  })

  it('uses the draft map of the class when it has one, and makes one when it has none', async () => {
    await useCapsMap('cls')
    expect(wrote('curriculum_maps', 'insert')).toHaveLength(1)
    state.calls = []
    state.existingDraft = 'map-old'
    await useCapsMap('cls')
    expect(wrote('curriculum_maps', 'insert')).toHaveLength(0)
    expect(wrote('curriculum_maps', 'update').at(-1)!.filters).toMatchObject({ id: 'map-old', status: 'draft' })
  })

  it('refuses a class in Kenya, another subject and a grade 13 in plain words, and stores nothing', async () => {
    state.country = 'KE'
    expect(await useCapsMap('cls')).toEqual({ ok: false, message: 'The CAPS map is for a school in South Africa.' })
    state.country = 'ZA'
    state.subject = 'English'
    expect(await useCapsMap('cls')).toEqual({ ok: false, message: 'The CAPS map is for a Mathematics class.' })
    state.subject = 'Mathematics'
    state.grade = 13
    expect(await useCapsMap('cls')).toEqual({ ok: false, message: 'The CAPS map covers Grades 1 to 12.' })
    expect(wrote('curriculum_maps', 'insert')).toHaveLength(0)
    expect(wrote('curriculum_maps', 'update')).toHaveLength(0)
    expect(wrote('activity_log', 'insert')).toHaveLength(0)
  })

  it('refuses a class the teacher does not own', async () => {
    state.owned = false
    await expect(useCapsMap('cls')).rejects.toThrow('Class not found')
    expect(wrote('curriculum_maps', 'insert')).toHaveLength(0)
  })

  it('refuses a class that already has an approved map, and changes nothing', async () => {
    state.approvedMaps = 1
    expect(await useCapsMap('cls')).toEqual({ ok: false, message: 'This class already has an approved topic map.' })
    expect(wrote('curriculum_maps', 'update')).toHaveLength(0)
    expect(wrote('activity_log', 'insert')).toHaveLength(0)
  })
})
