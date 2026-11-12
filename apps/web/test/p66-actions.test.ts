// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Row level security lets a teacher SEE a colleague's class when they share a learner (classes_select in 0002_rls.sql). Seeing is not
// teaching: only the teacher of the class may bring past records in or add one result. The teacher's session is a stand-in that shows the
// class (as RLS does for a colleague who shares a learner) and says `teaches_child` is true. The service client must never be reached.

const state = vi.hoisted(() => ({ userId: 'teacher-b', classTeacher: 'teacher-a', adminTouched: 0 }))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requireRole: async () => ({ userId: state.userId, profile: {} }) }))
vi.mock('@/lib/agent', () => ({ sendEvent: vi.fn(), retryEvent: vi.fn() }))
vi.mock('@/lib/long-view', () => ({ requestLongView: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdmin: () => {
    state.adminTouched++
    throw new Error('the service client was reached')
  },
}))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServer: async () => ({
    from: (table: string) => {
      const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: table === 'classes' ? { id: 'cls', school_id: 'sch', name: '6B Mathematics', teacher_id: state.classTeacher } : null, error: null }) }
      return chain
    },
    rpc: async () => ({ data: true, error: null }),
  }),
}))

import { addOneResult, pasteRecords, startSampleRecords, uploadRecords } from '../app/t/[classId]/learners/records/actions'

const TABLE = 'Learner,Mark\nAmina,14/20\n'
const form = { kind: 'quiz', grade: 5, year: 2025, term: 1, title: 'Test', family: 'fractions', marks: 14, outOf: 20, teacherName: 'Mrs Naidoo' }
const REFUSED = { ok: false, reason: 'Only the teacher of this class can add past records.' }

beforeEach(() => {
  state.userId = 'teacher-b'
  state.classTeacher = 'teacher-a'
  state.adminTouched = 0
})

describe('a teacher who shares a learner with the class but does not teach it', () => {
  it('cannot upload a file, paste a table or use a sample file for it', async () => {
    expect(await uploadRecords('cls', 'results.csv', TABLE)).toEqual(REFUSED)
    expect(await pasteRecords('cls', TABLE)).toEqual(REFUSED)
    expect(await startSampleRecords('cls', 'tidy')).toEqual(REFUSED)
    expect(state.adminTouched).toBe(0)
  })

  it('cannot add one result under it', async () => {
    expect(await addOneResult('cls', 'child-1', form)).toEqual(REFUSED)
    expect(state.adminTouched).toBe(0)
  })

  it('the class teacher gets past the check (and reaches the service client, which this test refuses)', async () => {
    state.userId = 'teacher-a'
    await expect(uploadRecords('cls', 'results.csv', TABLE)).rejects.toThrow('the service client was reached')
    await expect(addOneResult('cls', 'child-1', form)).rejects.toThrow('the service client was reached')
    expect(state.adminTouched).toBe(2)
  })
})
