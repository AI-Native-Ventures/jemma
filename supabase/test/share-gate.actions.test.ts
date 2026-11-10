import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { createServiceClient, type JemmaDb } from '../../packages/profiling/src/db'
import { shareResults, type ShareDeps } from '../../apps/web/lib/share-results'

// "Share with parents" on real rows: the three fields, the approval with the teacher's name, who is told, who may share.
// A small school made for this file on jemma-dev. No agent and no model: the event and the Long view request are stubs.

const url = process.env.SUPABASE_URL!
const anonKey = process.env.SUPABASE_ANON_KEY!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const service = createServiceClient({ SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: serviceKey })
const PASSWORD = 'share-act-Passw0rd!'
const tag = `sha${Date.now()}`

type Actor = { id: string; client: JemmaDb }
const users: Record<string, Actor> = {}
const schoolIds: string[] = []
const ids: Record<string, string> = {}

async function ok<T>(q: PromiseLike<{ data: T; error: { message: string } | null }>) {
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return data
}

async function mkUser(key: string, role: 'teacher' | 'parent' | 'learner', schoolId: string | null, name: string) {
  const email = `${tag}-${key}@example.test`
  const { data, error } = await service.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true })
  if (error) throw error
  await ok(service.from('profiles').insert({ user_id: data.user.id, role, display_name: name, school_id: schoolId }))
  const client = createClient(url, anonKey, opts) as unknown as JemmaDb
  const s = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (s.error) throw s.error
  users[key] = { id: data.user.id, client }
  return data.user.id
}

const consent = { guardian: true, teach: true, improve: false }

beforeAll(async () => {
  const [sA] = await ok(service.from('schools').insert({ name: `${tag} School A`, country: 'ZA' }).select('id'))
  const [sB] = await ok(service.from('schools').insert({ name: `${tag} School B`, country: 'ZA' }).select('id'))
  schoolIds.push(sA!.id, sB!.id)
  const tA = await mkUser('teacher', 'teacher', sA!.id, 'Ms Banda')
  const tB = await mkUser('otherTeacher', 'teacher', sB!.id, 'Mr Other')
  await mkUser('parent', 'parent', null, 'Thandi M')
  await mkUser('pendingParent', 'parent', null, 'Pending P')
  await mkUser('thaboParent', 'parent', null, 'Thabo P')
  await mkUser('strangerParent', 'parent', null, 'Stranger S')
  const [cA] = await ok(service.from('classes').insert({ school_id: sA!.id, teacher_id: tA, name: '6B Mathematics', grade: 6, year: 2026, subject: 'Mathematics', join_code: `${tag}A` }).select('id'))
  const [cB] = await ok(service.from('classes').insert({ school_id: sB!.id, teacher_id: tB, name: '6C Mathematics', grade: 6, year: 2026, subject: 'Mathematics', join_code: `${tag}B` }).select('id'))
  const kids = await ok(
    service
      .from('children')
      .insert([
        { school_id: sA!.id, first_name: 'Amina', grade: 6 },
        { school_id: sA!.id, first_name: 'Thabo', grade: 6 },
        { school_id: sA!.id, first_name: 'Sipho', grade: 6 },
        { school_id: sA!.id, first_name: 'Lerato', grade: 6 },
      ])
      .select('id, first_name'),
  )
  const kid = (n: string) => kids.find((k) => k.first_name === n)!.id
  Object.assign(ids, { sA: sA!.id, cA: cA!.id, cB: cB!.id, amina: kid('Amina'), thabo: kid('Thabo'), sipho: kid('Sipho'), lerato: kid('Lerato'), teacher: tA })
  await ok(service.from('enrolments').insert(kids.map((k) => ({ class_id: cA!.id, child_id: k.id }))))
  await ok(
    service.from('parent_links').insert([
      { parent_id: users.parent!.id, child_id: ids.amina!, class_id: cA!.id, status: 'approved', consent },
      { parent_id: users.pendingParent!.id, child_id: ids.amina!, class_id: cA!.id, status: 'pending', consent },
      { parent_id: users.thaboParent!.id, child_id: ids.thabo!, class_id: cA!.id, status: 'approved', consent },
      { parent_id: users.strangerParent!.id, child_id: ids.lerato!, class_id: cA!.id, status: 'approved', consent }, // her child has no paper in the test
    ]),
  )
})

afterAll(async () => {
  if (schoolIds.length) await service.from('schools').delete().in('id', schoolIds)
  for (const u of Object.values(users)) await service.auth.admin.deleteUser(u.id)
})

let n = 0
/** A new held test with Amina and Thabo marked, Sipho waiting in Needs you and one paper nobody owns yet. */
async function heldTest(status: 'marked' | 'needs_you' = 'marked'): Promise<string> {
  const [t] = await ok(service.from('tests').insert({ class_id: ids.cA!, title: `Class Test ${++n}`, out_of: 10, held: true }).select('id'))
  await ok(
    service.from('papers').insert([
      { test_id: t!.id, child_id: ids.amina!, owner: 'teacher', kind: 'test', status, total: 6 },
      { test_id: t!.id, child_id: ids.thabo!, owner: 'teacher', kind: 'test', status, total: 8 },
      { test_id: t!.id, child_id: ids.sipho!, owner: 'teacher', kind: 'test', status: 'needs_you', total: 5 },
      { test_id: t!.id, child_id: null, owner: 'teacher', kind: 'test', status: 'needs_you' },
    ]),
  )
  return t!.id
}

const deps = (key = 'teacher'): ShareDeps & { send: ReturnType<typeof vi.fn>; askLongView: ReturnType<typeof vi.fn> } => ({
  teacher: users[key]!.client,
  admin: service,
  userId: users[key]!.id,
  send: vi.fn(async () => 'event-id'),
  askLongView: vi.fn(async () => ({ sent: [], skipped: [], failed: [] })),
})
const testRow = async (id: string) => (await ok(service.from('tests').select('held, shared_at, shared_by').eq('id', id).single()))!
const notesOf = async (userId: string) => ok(service.from('notifications').select('title, body, href').eq('user_id', userId).order('created_at'))

describe('shareResults on real rows', () => {
  test('sets held, shared_at and shared_by once, writes the approval with the teacher name, tells approved parents only', async () => {
    const testId = await heldTest()
    const d = deps()
    const before = Date.now()
    const r = await shareResults(d, ids.cA!, testId)
    expect(r).toMatchObject({ ok: true, shared: true })
    const row = await testRow(testId)
    expect(row.held).toBe(false)
    expect(row.shared_by).toBe(ids.teacher)
    expect(Date.parse(row.shared_at!)).toBeGreaterThanOrEqual(before - 5000)

    const approvals = await ok(service.from('approvals').select('*').eq('ref_id', testId))
    expect(approvals).toHaveLength(1)
    expect(approvals[0]).toMatchObject({ kind: 'share_results', decision: 'shared', decided_by: ids.teacher, decided_by_name: 'Ms Banda', school_id: ids.sA })
    expect(approvals[0]!.note).toMatch(/^Class Test \d+$/)

    const title = approvals[0]!.note!
    expect(await notesOf(users.parent!.id)).toEqual([{ title: `${title} is marked`, body: '6 out of 10', href: `/p/${ids.amina}/tests` }])
    expect(await notesOf(users.thaboParent!.id)).toEqual([{ title: `${title} is marked`, body: '8 out of 10', href: `/p/${ids.thabo}/tests` }])
    expect(await notesOf(users.pendingParent!.id)).toEqual([])
    expect(await notesOf(users.strangerParent!.id)).toEqual([])

    expect(d.send).toHaveBeenCalledTimes(1)
    expect(d.send).toHaveBeenCalledWith('test.shared', { testId })
    expect(d.askLongView).toHaveBeenCalledTimes(1)
    expect([...d.askLongView.mock.calls[0]![0]].sort()).toEqual([ids.amina, ids.thabo].sort())
  })

  test('sharing a second time does nothing: the first time, the approval and the messages stay as they were', async () => {
    const testId = await heldTest()
    await shareResults(deps(), ids.cA!, testId)
    const first = await testRow(testId)
    const d = deps()
    expect(await shareResults(d, ids.cA!, testId)).toMatchObject({ ok: true, shared: false })
    expect(await testRow(testId)).toEqual(first)
    expect(await ok(service.from('approvals').select('id').eq('ref_id', testId))).toHaveLength(1)
    expect(d.send).not.toHaveBeenCalled()
    expect(d.askLongView).not.toHaveBeenCalled()
  })

  test('a parent cannot share, and neither can the teacher of another school', async () => {
    const testId = await heldTest()
    for (const who of ['parent', 'otherTeacher']) {
      const d = deps(who)
      expect(await shareResults(d, ids.cA!, testId)).toEqual({ ok: false, message: 'Only the class teacher can share results.' })
      expect(d.send).not.toHaveBeenCalled()
    }
    expect(await testRow(testId)).toMatchObject({ held: true, shared_at: null, shared_by: null })
    expect(await ok(service.from('approvals').select('id').eq('ref_id', testId))).toEqual([])
  })

  test('a test with no marked paper is refused and stays held', async () => {
    const testId = await heldTest('needs_you')
    const r = await shareResults(deps(), ids.cA!, testId)
    expect(r).toEqual({ ok: false, message: 'No paper of this test is marked yet.' })
    expect(await testRow(testId)).toMatchObject({ held: true })
  })

  test('a test of another class is refused', async () => {
    const [other] = await ok(service.from('tests').insert({ class_id: ids.cB!, title: 'Other class test', out_of: 10, held: true }).select('id'))
    expect(await shareResults(deps(), ids.cA!, other!.id)).toEqual({ ok: false, message: 'That test is not in this class.' })
    expect(await testRow(other!.id)).toMatchObject({ held: true })
  })
})
