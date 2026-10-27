import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL!
const anonKey = process.env.SUPABASE_ANON_KEY!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const service = createClient(url, serviceKey, opts)
const PASSWORD = 'rls-test-Passw0rd!'
const tag = `rls${Date.now()}`

type Actor = { id: string; email: string; client: SupabaseClient }
const users: Record<string, Actor> = {}
const schoolIds: string[] = []
const ids: Record<string, string> = {}
let replayKey = ''

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
  users[key] = { id, email, client }
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
  schoolIds.push(sA.id, sB.id)

  const tA = await mkUser('teacherA', 'teacher', sA.id)
  const tB = await mkUser('teacherB', 'teacher', sB.id)
  await mkUser('parent1', 'parent', null)
  await mkUser('parent2', 'parent', null)
  const kA1 = await mkUser('childA1', 'learner', sA.id)

  const [cA] = await ok(
    service.from('classes').insert({ school_id: sA.id, teacher_id: tA, name: '6B Mathematics', grade: 6, year: 2026, subject: 'Mathematics', join_code: `${tag}A` }).select('id'),
  )
  const [cB] = await ok(
    service.from('classes').insert({ school_id: sB.id, teacher_id: tB, name: '6C Mathematics', grade: 6, year: 2026, subject: 'Mathematics', join_code: `${tag}B` }).select('id'),
  )
  const [a1] = await ok(
    service.from('children').insert({ school_id: sA.id, first_name: 'Amina', grade: 6, user_id: kA1, parent_relation: 'mother' }).select('id'),
  )
  const [b1] = await ok(service.from('children').insert({ school_id: sB.id, first_name: 'Bongi', grade: 6 }).select('id'))
  Object.assign(ids, { sA: sA.id, sB: sB.id, cA: cA.id, cB: cB.id, a1: a1.id, b1: b1.id })

  await ok(service.from('enrolments').insert([{ class_id: cA.id, child_id: a1.id }, { class_id: cB.id, child_id: b1.id }]))
  await ok(
    service.from('parent_links').insert([
      { parent_id: users.parent1.id, child_id: a1.id, class_id: cA.id, status: 'approved', consent: { guardian: true, teach: true, improve: false } },
      { parent_id: users.parent2.id, child_id: a1.id, class_id: cA.id, status: 'pending', consent: { guardian: true, teach: true, improve: false } },
    ]),
  )
  const [paper] = await ok(
    service.from('papers').insert({ child_id: a1.id, owner: 'teacher', kind: 'test', status: 'marked', name_read: 'Amina' }).select('id'),
  )
  await ok(
    service.from('question_results').insert({
      paper_id: paper.id, child_id: a1.id, n: 1, prompt: '3/4 + 1/8', answer_read: '4/12', read_confidence: 0.9,
      correct: false, mark: 0, topic_name: 'Adding fractions',
    }),
  )
  await ok(service.from('gaps').insert({ child_id: a1.id, topic_name: 'Adding fractions', stage: 'new' }))

  replayKey = `${tag}-replay`
  await ok(service.from('ai_replays').insert({ key: replayKey, model: 'mock', response: {} }))
})

afterAll(async () => {
  await service.from('ai_replays').delete().eq('key', replayKey)
  if (schoolIds.length) await service.from('schools').delete().in('id', schoolIds)
  for (const u of Object.values(users)) await service.auth.admin.deleteUser(u.id)
})

describe('row level security', () => {
  test('teacher sees own class children only', async () => {
    const rows = await ok(users.teacherA.client.from('children').select('id'))
    expect(rows.map((r) => r.id)).toEqual([ids.a1])
  })

  test('parent with approved link sees results', async () => {
    const rows = await ok(users.parent1.client.from('question_results').select('id').eq('child_id', ids.a1))
    expect(rows).toHaveLength(1)
  })

  test('parent with pending link sees nothing', async () => {
    const rows = await ok(users.parent2.client.from('question_results').select('id').eq('child_id', ids.a1))
    expect(rows).toEqual([])
  })

  test('learner sees only self', async () => {
    const rows = await ok(users.childA1.client.from('children').select('id'))
    expect(rows.map((r) => r.id)).toEqual([ids.a1])
  })

  test('teacher of another school sees nothing', async () => {
    const rows = await ok(users.teacherB.client.from('gaps').select('id').eq('child_id', ids.a1))
    expect(rows).toEqual([])
  })

  test('anon reads nothing', async () => {
    const anon = createClient(url, anonKey, opts)
    const { data, error } = await anon.from('children').select('id')
    expect(error ?? null).toBeNull()
    expect(data).toEqual([])
  })

  test('service-only tables are closed', async () => {
    const { data, error } = await users.teacherA.client.from('ai_replays').select('key')
    expect(error ? [] : data).toEqual([])
  })

  test('retag_results tags matching topic names and is service only', async () => {
    const [map] = await ok(service.from('curriculum_maps').insert({ class_id: ids.cA, status: 'approved' }).select('id'))
    const [topic] = await ok(
      service.from('topics').insert({ map_id: map.id, term: 1, position: 1, name: 'ADDING FRACTIONS', family: 'fractions' }).select('id'),
    )
    await ok(service.rpc('retag_results', { map: map.id }))
    await ok(service.rpc('retag_results', { map: map.id }))
    const gaps = await ok(service.from('gaps').select('topic_id').eq('child_id', ids.a1))
    expect(gaps[0].topic_id).toBe(topic.id)
    const qr = await ok(service.from('question_results').select('topic_id').eq('child_id', ids.a1))
    expect(qr[0].topic_id).toBe(topic.id)
    const denied = await users.teacherA.client.rpc('retag_results', { map: map.id })
    expect(denied.error).not.toBeNull()
  })
})
