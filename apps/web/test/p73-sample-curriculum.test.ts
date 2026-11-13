// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

// "Use the sample curriculum" copies Grade 6 Mathematics documents (P73, decision 6). In a Grade 9 class it would draft a Grade 9 map from
// Grade 4 to 6 pages. The button shows only where the sample fits, and the action refuses every other class in plain words.

const state = vi.hoisted(() => ({ subject: 'Mathematics', grade: 6, sandbox: 'sandbox-1' as string | null, copies: 0, inserts: 0 }))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn(), notFound: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requireRole: async () => ({ userId: 'teacher-a', profile: {} }) }))
vi.mock('@/lib/agent', () => ({ sendEvent: vi.fn(), retryEvent: vi.fn() }))
vi.mock('@/lib/approvals', () => ({ recordApproval: vi.fn() }))

function chainFor(table: string) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: async () => ({ data: [], error: null }),
    update: () => chain,
    insert: (rows: unknown) => {
      state.inserts++
      return table === 'curriculum_maps' ? { select: () => ({ single: async () => ({ data: { id: 'map-1' }, error: null }) }) } : Promise.resolve({ data: rows, error: null })
    },
    single: async () => ({ data: table === 'schools' ? { sandbox_id: state.sandbox } : { id: 'cls', school_id: 'sch', name: '9A', grade: state.grade, subject: state.subject }, error: null }),
    maybeSingle: async () => ({ data: table === 'classes' ? { id: 'cls', school_id: 'sch', name: '9A', grade: state.grade, subject: state.subject } : null, error: null }),
  }
  return chain
}

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServer: async () => ({ from: chainFor }) }))
vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdmin: () => ({
    from: chainFor,
    storage: { from: () => ({ copy: async () => (state.copies++, { error: null }) }) },
  }),
}))

import { sampleCurriculumFits, SAMPLE_ONLY_FOR } from '../app/t/[classId]/curriculum/format'
import { useSampleCurriculum } from '../app/t/[classId]/curriculum/actions'

beforeEach(() => {
  state.subject = 'Mathematics'
  state.grade = 6
  state.sandbox = 'sandbox-1'
  state.copies = 0
  state.inserts = 0
})

describe('where the sample curriculum fits', () => {
  it('a Grade 6 Mathematics class, however Mathematics is written', () => {
    expect(sampleCurriculumFits('Mathematics', 6)).toBe(true)
    expect(sampleCurriculumFits('Maths', 6)).toBe(true)
    expect(sampleCurriculumFits('  mathematics ', 6)).toBe(true)
  })

  it('no other grade, no other subject', () => {
    expect(sampleCurriculumFits('Mathematics', 9)).toBe(false)
    expect(sampleCurriculumFits('Mathematics', 5)).toBe(false)
    expect(sampleCurriculumFits('Mathematics', 7)).toBe(false)
    expect(sampleCurriculumFits('English', 6)).toBe(false)
    expect(sampleCurriculumFits('Natural Sciences', 6)).toBe(false)
    expect(sampleCurriculumFits('', 6)).toBe(false)
  })
})

describe('useSampleCurriculum', () => {
  it('refuses a Grade 9 class with a plain sentence and copies nothing', async () => {
    state.grade = 9
    await expect(useSampleCurriculum('cls')).rejects.toThrow('The sample curriculum is for a Grade 6 Mathematics class.')
    expect(SAMPLE_ONLY_FOR).toBe('The sample curriculum is for a Grade 6 Mathematics class.')
    expect(state.copies).toBe(0)
    expect(state.inserts).toBe(0)
  })

  it('refuses another subject in Grade 6 the same way', async () => {
    state.subject = 'English'
    await expect(useSampleCurriculum('cls')).rejects.toThrow(SAMPLE_ONLY_FOR)
    expect(state.copies).toBe(0)
  })

  it('a Grade 6 Mathematics class of a demo school gets the two sample documents', async () => {
    await useSampleCurriculum('cls')
    expect(state.copies).toBe(2)
  })

  it('a school that is not a demo is still refused', async () => {
    state.sandbox = null
    await expect(useSampleCurriculum('cls')).rejects.toThrow('The sample curriculum is only for the demo')
    expect(state.copies).toBe(0)
  })
})
