import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL!
const anonKey = process.env.SUPABASE_ANON_KEY!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const service = createClient(url, serviceKey, opts)
const PASSWORD = 'lv-rls-Passw0rd!'
const tag = `lvr${Date.now()}`

type Actor = { id: string; client: SupabaseClient }
const users: Record<string, Actor> = {}
const schoolIds: string[] = []
const ids: Record<string, string> = {}

async function mkUser(key: string, role: 'teacher' | 'parent' | 'learner', schoolId: string | null) {
  const email = `${tag}-${key}@example.test`
  const { data, error } = await service.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true })
  if (error) throw error
  const id = data.user.id
  const p = await service.from('profiles').insert({ user_id: id, role, display_name: key, school_id: schoolId })
  if (p.error) throw p.error
  const client = createClient(url, anonKey, opts)
  const s = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (s.error) throw s.error
  users[key] = { id, client }
  return id
}

async function ok<T>(q: PromiseLike<{ data: T; error: { message: string } | null }>) {
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return data
}

const STATUSES = ['draft', 'approved', 'discussed', 'dismissed'] as const

beforeAll(async () => {
  const [sA] = await ok(service.from('schools').insert({ name: `${tag} School A`, country: 'ZA' }).select('id'))
  const [sB] = await ok(service.from('schools').insert({ name: `${tag} School B`, country: 'ZA' }).select('id'))
  schoolIds.push(sA.id, sB.id)
  const tA = await mkUser('teacherA', 'teacher', sA.id)
  const tB = await mkUser('teacherB', 'teacher', sB.id)
  await mkUser('parentApproved', 'parent', null)
  await mkUser('parentPending', 'parent', null)
  const kA1 = await mkUser('learnerA1', 'learner', sA.id)
  const [cA] = await ok(
    service.from('classes').insert({ school_id: sA.id, teacher_id: tA, name: '6B Mathematics', grade: 6, year: 2026, subject: 'Mathematics', join_code: `${tag}A` }).select('id'),
  )
  const [cB] = await ok(
    service.from('classes').insert({ school_id: sB.id, teacher_id: tB, name: '6C Mathematics', grade: 6, year: 2026, subject: 'Mathematics', join_code: `${tag}B` }).select('id'),
  )
  const [a1] = await ok(service.from('children').insert({ school_id: sA.id, first_name: 'Amina', grade: 6, user_id: kA1 }).select('id'))
  const [b1] = await ok(service.from('children').insert({ school_id: sB.id, first_name: 'Bongi', grade: 6 }).select('id'))
  Object.assign(ids, { sA: sA.id, sB: sB.id, cA: cA.id, cB: cB.id, a1: a1.id, b1: b1.id })
  await ok(service.from('enrolments').insert([{ class_id: cA.id, child_id: a1.id }, { class_id: cB.id, child_id: b1.id }]))
  await ok(
    service.from('parent_links').insert([
      { parent_id: users.parentApproved.id, child_id: a1.id, class_id: cA.id, status: 'approved', consent: { guardian: true, teach: true, improve: false } },
      { parent_id: users.parentPending.id, child_id: a1.id, class_id: cA.id, status: 'pending', consent: { guardian: true, teach: true, improve: false } },
    ]),
  )

  const record = (school: string, child: string, term: number) => ({
    school_id: school, child_id: child, source: 'quiz', grade: 5, year: 2025, term, happened_on: `2025-0${term * 3 - 1}-10`, logged_at: `2025-0${term * 3 - 1}-12T10:00:00Z`,
    teacher_name: 'Mrs Naidoo', title: `Quiz ${term}`, family: 'fractions', topic_name: 'Adding fractions', marks: 6, out_of: 20,
  })
  await ok(service.from('learner_records').insert([record(sA.id, a1.id, 1), record(sA.id, a1.id, 2), record(sB.id, b1.id, 1)]))
  const pattern = (child: string, family: string, status: (typeof STATUSES)[number]) => ({
    child_id: child, kind: 'struggle', family, title: `Title ${family}`, statement: 'Seen over three terms.', status,
    terms: [{ grade: 5, year: 2025, term: 1, percent: 30, points: 20 }], evidence: [{ kind: 'record', id: 'x', label: 'Quiz 1, Mrs Naidoo, 10 Feb 2025' }],
  })
  await ok(
    service.from('long_view_patterns').insert([
      ...STATUSES.map((st, i) => pattern(a1.id, `family_${i}`, st)),
      pattern(b1.id, 'family_b', 'discussed'),
    ]),
  )
})

afterAll(async () => {
  if (schoolIds.length) await service.from('schools').delete().in('id', schoolIds)
  for (const u of Object.values(users)) await service.auth.admin.deleteUser(u.id)
})

const records = (who: string) => ok(users[who]!.client.from('learner_records').select('id').eq('child_id', ids.a1!))
const patterns = (who: string) => ok(users[who]!.client.from('long_view_patterns').select('id, status').eq('child_id', ids.a1!))

describe('Long view row level security', () => {
  test('the class teacher reads the records and every pattern, whatever its status', async () => {
    expect(await records('teacherA')).toHaveLength(2)
    const rows = await patterns('teacherA')
    expect(rows.map((r) => r.status).sort()).toEqual([...STATUSES].sort())
  })

  test('an approved parent reads no records and only the patterns that were discussed', async () => {
    expect(await records('parentApproved')).toEqual([])
    const rows = await patterns('parentApproved')
    expect(rows.map((r) => r.status)).toEqual(['discussed'])
  })

  test('a parent whose link is still pending reads nothing', async () => {
    expect(await records('parentPending')).toEqual([])
    expect(await patterns('parentPending')).toEqual([])
  })

  test('the learner reads nothing, not even a pattern that was discussed', async () => {
    expect(await records('learnerA1')).toEqual([])
    expect(await patterns('learnerA1')).toEqual([])
    expect(await ok(users.learnerA1!.client.from('long_view_patterns').select('id'))).toEqual([])
  })

  test("another school's teacher reads nothing of this learner, and reads only their own", async () => {
    expect(await records('teacherB')).toEqual([])
    expect(await patterns('teacherB')).toEqual([])
    expect(await ok(users.teacherB!.client.from('learner_records').select('id'))).toHaveLength(1)
    expect(await ok(users.teacherB!.client.from('long_view_patterns').select('id'))).toHaveLength(1)
  })

  test('nobody signed in reads anything', async () => {
    const anon = createClient(url, anonKey, opts)
    expect((await anon.from('learner_records').select('id')).data ?? []).toEqual([])
    expect((await anon.from('long_view_patterns').select('id')).data ?? []).toEqual([])
  })

  test('nobody writes from the browser, not even the class teacher', async () => {
    const t = users.teacherA!.client
    const insertRecord = await t.from('learner_records').insert({
      school_id: ids.sA, child_id: ids.a1, source: 'note', grade: 6, year: 2026, term: 1, happened_on: '2026-02-01', logged_at: '2026-02-02T00:00:00Z', teacher_name: 'x', title: 'x',
    })
    expect(insertRecord.error).not.toBeNull()
    const insertPattern = await t.from('long_view_patterns').insert({ child_id: ids.a1, kind: 'strength', family: 'shapes', title: 'x', statement: 'x', terms: [], evidence: [] })
    expect(insertPattern.error).not.toBeNull()
    const update = await t.from('long_view_patterns').update({ status: 'approved' }).eq('child_id', ids.a1!).eq('status', 'draft').select('id')
    expect(update.data ?? []).toEqual([])
    const del = await t.from('learner_records').delete().eq('child_id', ids.a1!).select('id')
    expect(del.data ?? []).toEqual([])
    expect(await records('teacherA')).toHaveLength(2)
    expect((await patterns('teacherA')).find((r) => r.status === 'draft')).toBeTruthy()
  })

  test('the table rules hold: kind, status, term, quality and source are checked, and a pattern is unique per learner, kind and family', async () => {
    const bad = (over: object) =>
      service.from('long_view_patterns').insert({ child_id: ids.a1, kind: 'strength', family: 'rules', title: 'x', statement: 'x', terms: [], evidence: [], ...over })
    expect((await bad({ kind: 'label' })).error).not.toBeNull()
    expect((await bad({ status: 'shared' })).error).not.toBeNull()
    const record = (over: object) =>
      service.from('learner_records').insert({
        school_id: ids.sA, child_id: ids.a1, source: 'quiz', grade: 6, year: 2026, term: 1, happened_on: '2026-02-01', logged_at: '2026-02-02T00:00:00Z', teacher_name: 'x', title: 'x', ...over,
      })
    expect((await record({ term: 5 })).error).not.toBeNull()
    expect((await record({ quality: 'maybe' })).error).not.toBeNull()
    expect((await record({ source: 'exam' })).error).not.toBeNull()
    const dup = await service.from('long_view_patterns').insert({ child_id: ids.a1, kind: 'struggle', family: 'family_0', title: 'x', statement: 'x', terms: [], evidence: [] })
    expect(dup.error).not.toBeNull()
  })

  test('the new Needs you kind exists', async () => {
    const [item] = await ok(
      service.from('needs_you_items').insert({ owner_id: users.teacherA!.id, school_id: ids.sA, child_id: ids.a1, kind: 'review_long_view', ref_id: ids.a1, title: 't', detail: 'd' }).select('id, kind'),
    )
    expect(item!.kind).toBe('review_long_view')
  })
})
