import { afterAll, describe, expect, test } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { createSandbox, deleteSandbox, type Sandbox } from '../seed/demo'
import { CAST } from '../seed/fixtures/cast'
import { TEST_TITLE } from '../seed/fixtures/marked-state'

// The seeded demo test is already shared with parents, with its approval, so every screen that starts from a seeded stage still works.

const url = process.env.SUPABASE_URL!
const anonKey = process.env.SUPABASE_ANON_KEY!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const service = createClient(url, serviceKey, opts)

const made: Sandbox[] = []
afterAll(async () => {
  for (const s of made) await deleteSandbox(service as never, s.sandboxId).catch(() => undefined)
})

async function ok<T>(q: PromiseLike<{ data: T; error: { message: string } | null }>) {
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return data
}

describe('the seeded test', () => {
  test.each(['marked', 'session_done'] as const)('stage %s: shared 40 minutes ago by the teacher, with the approval, and the parent reads its marks', async (stage) => {
    const s = await createSandbox(service as never, { stage })
    made.push(s)
    const tests = await ok(service.from('tests').select('id, title, held, shared_at, shared_by, class_id').eq('class_id', s.classId))
    expect(tests).toHaveLength(1)
    const test = tests[0]!
    expect(test).toMatchObject({ title: TEST_TITLE, held: false })
    const minutes = (Date.now() - Date.parse(test.shared_at!)) / 60_000
    expect(minutes).toBeGreaterThan(38)
    expect(minutes).toBeLessThan(45)
    const teacher = await ok(service.from('profiles').select('user_id').eq('school_id', s.schoolId).eq('role', 'teacher').single())
    expect(test.shared_by).toBe(teacher!.user_id)

    const approvals = await ok(service.from('approvals').select('kind, decision, decided_by, decided_by_name, note, school_id').eq('ref_id', test.id))
    expect(approvals).toEqual([{ kind: 'share_results', decision: 'shared', decided_by: teacher!.user_id, decided_by_name: CAST.teacher.displayName, note: TEST_TITLE, school_id: s.schoolId }])

    // The parent signs in and reads the test's answers: nothing is held back.
    const box = await ok(service.from('demo_sandboxes').select('logins').eq('id', s.sandboxId).single())
    const login = (box!.logins as Record<string, { email: string; password: string }>).parent!
    const parent = createClient(url, anonKey, opts)
    const signedIn = await parent.auth.signInWithPassword(login)
    expect(signedIn.error).toBeNull()
    const papers = await ok(service.from('papers').select('id').eq('test_id', test.id))
    const results = await ok(parent.from('question_results').select('id').in('paper_id', papers.map((p) => p.id)))
    expect(results.length).toBeGreaterThan(0)
  })

  test('stage start has no test at all', async () => {
    const s = await createSandbox(service as never, { stage: 'start' })
    made.push(s)
    expect(await ok(service.from('tests').select('id').eq('class_id', s.classId))).toEqual([])
  })
})
