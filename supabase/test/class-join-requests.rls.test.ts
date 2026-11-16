import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// P112: a learner who signed up alone asks to join a school class. The request is one row in `class_join_requests`: the teachers of the class read and
// answer it, the learner reads their own, and nobody but the service role writes a new one. Real rows on the test database, in a school and a personal
// school made for this file. Nobody is called live: no model, no agent.

const url = process.env.SUPABASE_URL!
const anonKey = process.env.SUPABASE_ANON_KEY!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const service = createClient(url, serviceKey, opts)
const PASSWORD = 'join-rls-Passw0rd!'
const tag = `cjr${Date.now()}`

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

beforeAll(async () => {
  const [sA] = await ok(service.from('schools').insert({ name: `${tag} School A`, country: 'ZA' }).select('id'))
  const [sB] = await ok(service.from('schools').insert({ name: `${tag} School B`, country: 'ZA' }).select('id'))
  const [sP] = await ok(service.from('schools').insert({ name: `${tag} own`, country: 'ZA', kind: 'private' }).select('id'))
  const [sQ] = await ok(service.from('schools').insert({ name: `${tag} other own`, country: 'ZA', kind: 'private' }).select('id'))
  schoolIds.push(sA!.id, sB!.id, sP!.id, sQ!.id)
  const tA = await mkUser('teacher', 'teacher', sA!.id)
  const tA2 = await mkUser('colleague', 'teacher', sA!.id) // a teacher of the same school who does not teach the class
  const tB = await mkUser('otherTeacher', 'teacher', sB!.id)
  await mkUser('parent', 'parent', null)
  const zola = await mkUser('learner', 'learner', sP!.id)
  const other = await mkUser('otherLearner', 'learner', sQ!.id)
  const [cA] = await ok(service.from('classes').insert({ school_id: sA!.id, teacher_id: tA, name: '6B Mathematics', grade: 6, year: 2026, subject: 'Mathematics', join_code: `${tag}A` }).select('id'))
  const [cA2] = await ok(service.from('classes').insert({ school_id: sA!.id, teacher_id: tA2, name: '6C Mathematics', grade: 6, year: 2026, subject: 'Mathematics', join_code: `${tag}C` }).select('id'))
  const [cB] = await ok(service.from('classes').insert({ school_id: sB!.id, teacher_id: tB, name: '6D Mathematics', grade: 6, year: 2026, subject: 'Mathematics', join_code: `${tag}B` }).select('id'))
  const [zolaKid] = await ok(service.from('children').insert({ school_id: sP!.id, first_name: 'Zola', grade: 6, user_id: zola }).select('id'))
  const [otherKid] = await ok(service.from('children').insert({ school_id: sQ!.id, first_name: 'Naledi', grade: 6, user_id: other }).select('id'))
  Object.assign(ids, { sA: sA!.id, cA: cA!.id, cA2: cA2!.id, cB: cB!.id, zolaKid: zolaKid!.id, otherKid: otherKid!.id })
  await ok(
    service.from('class_join_requests').insert([
      { id: crypto.randomUUID(), class_id: cA!.id, own_child_id: zolaKid!.id, requested_name: 'Zola' },
      { id: crypto.randomUUID(), class_id: cA2!.id, own_child_id: otherKid!.id, requested_name: 'Naledi' },
      { id: crypto.randomUUID(), class_id: cB!.id, own_child_id: otherKid!.id, requested_name: 'Naledi', status: 'declined' },
    ]),
  )
})

afterAll(async () => {
  if (schoolIds.length) await service.from('schools').delete().in('id', schoolIds)
  for (const u of Object.values(users)) await service.auth.admin.deleteUser(u.id)
})

const namesFor = async (who: string) => (await ok(users[who]!.client.from('class_join_requests').select('requested_name, class_id'))).map((r) => `${r.requested_name}@${r.class_id === ids.cA ? 'A' : r.class_id === ids.cA2 ? 'A2' : 'B'}`).sort()

describe('who reads a request', () => {
  test('the teacher of the class reads the requests for the class, and no other', async () => {
    expect(await namesFor('teacher')).toEqual(['Zola@A'])
  })

  test('a teacher of another class of the same school reads only the requests for their own class', async () => {
    expect(await namesFor('colleague')).toEqual(['Naledi@A2'])
  })

  test('a teacher of another school reads only the requests for their own class', async () => {
    expect(await namesFor('otherTeacher')).toEqual(['Naledi@B'])
  })

  test('a learner reads their own requests, not another learner s', async () => {
    expect(await namesFor('learner')).toEqual(['Zola@A'])
    expect(await namesFor('otherLearner')).toEqual(['Naledi@A2', 'Naledi@B'])
  })

  test('a parent reads none', async () => {
    expect(await namesFor('parent')).toEqual([])
  })

  test('a person who is signed out reads none', async () => {
    const anon = createClient(url, anonKey, opts)
    const r = await anon.from('class_join_requests').select('id')
    expect(r.data ?? []).toEqual([])
  })
})

describe('who writes a request', () => {
  test.each(['teacher', 'colleague', 'parent', 'learner'] as const)('%s cannot make one', async (who) => {
    const r = await users[who]!.client.from('class_join_requests').insert({ class_id: ids.cA!, own_child_id: ids.zolaKid!, requested_name: 'Made by a person' })
    expect(r.error).not.toBeNull()
  })

  test.each(['teacher', 'colleague', 'parent', 'learner'] as const)('%s cannot remove one', async (who) => {
    const r = await users[who]!.client.from('class_join_requests').delete().eq('class_id', ids.cA!).select('id')
    expect(r.data ?? []).toEqual([])
    expect(await ok(service.from('class_join_requests').select('id').eq('class_id', ids.cA!))).toHaveLength(1)
  })

  test('the learner cannot answer their own request', async () => {
    const r = await users.learner!.client.from('class_join_requests').update({ status: 'approved' }).eq('own_child_id', ids.zolaKid!).select('id')
    expect(r.data ?? []).toEqual([])
    expect((await ok(service.from('class_join_requests').select('status').eq('class_id', ids.cA!)))[0]!.status).toBe('pending')
  })

  test('a teacher of another class cannot answer the request, the teacher of the class can', async () => {
    const wrong = await users.colleague!.client.from('class_join_requests').update({ status: 'declined' }).eq('class_id', ids.cA!).select('id')
    expect(wrong.data ?? []).toEqual([])
    expect((await ok(service.from('class_join_requests').select('status').eq('class_id', ids.cA!)))[0]!.status).toBe('pending')
    const right = await users.teacher!.client.from('class_join_requests').update({ status: 'declined', decided_by: users.teacher!.id, decided_at: new Date().toISOString() }).eq('class_id', ids.cA!).select('id')
    expect(right.error).toBeNull()
    expect(right.data).toHaveLength(1)
    expect((await ok(service.from('class_join_requests').select('status').eq('class_id', ids.cA!)))[0]!.status).toBe('declined')
  })

  test('the teacher cannot move a request to another class', async () => {
    const r = await users.teacher!.client.from('class_join_requests').update({ class_id: ids.cB! }).eq('class_id', ids.cA!).select('id')
    expect(r.error !== null || (r.data ?? []).length === 0).toBe(true)
    expect(await ok(service.from('class_join_requests').select('id').eq('class_id', ids.cA!))).toHaveLength(1)
  })
})

describe('what the table holds', () => {
  test('a status other than pending, approved or declined is refused', async () => {
    const r = await service.from('class_join_requests').insert({ class_id: ids.cB!, own_child_id: ids.zolaKid!, requested_name: 'Zola', status: 'maybe' })
    expect(r.error).not.toBeNull()
  })

  test('a learner has one waiting request at a time, and may ask again after a no', async () => {
    const first = await service.from('class_join_requests').insert({ class_id: ids.cB!, own_child_id: ids.zolaKid!, requested_name: 'Zola' })
    expect(first.error).toBeNull() // the earlier one for Zola was answered above, so nothing waits
    const second = await service.from('class_join_requests').insert({ class_id: ids.cA2!, own_child_id: ids.zolaKid!, requested_name: 'Zola' })
    expect(second.error).not.toBeNull()
  })

  test('a request goes with the class and with the learner s own record', async () => {
    const [kid] = await ok(service.from('children').insert({ school_id: schoolIds[2]!, first_name: 'Temp', grade: 6 }).select('id'))
    await ok(service.from('class_join_requests').insert({ class_id: ids.cB!, own_child_id: kid!.id, requested_name: 'Temp' }).select('id'))
    await ok(service.from('children').delete().eq('id', kid!.id).select('id'))
    expect(await ok(service.from('class_join_requests').select('id').eq('own_child_id', kid!.id))).toEqual([])
  })

  test('the Needs you item of a join request can be written (the kind exists)', async () => {
    const r = await service.from('needs_you_items').insert({ owner_id: users.teacher!.id, school_id: ids.sA!, kind: 'approve_join', ref_id: crypto.randomUUID(), title: 'Zola wants to join 6B Mathematics' }).select('id')
    expect(r.error).toBeNull()
  })
})
