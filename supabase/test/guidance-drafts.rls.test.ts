import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// P106: a new guidance card for a school child is a draft that only the child's teachers can read. The family keeps reading `guidance_cards`.
// Real rows on the test database, in two small schools made for this file. Nobody is called live: no model, no agent.

const url = process.env.SUPABASE_URL!
const anonKey = process.env.SUPABASE_ANON_KEY!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const service = createClient(url, serviceKey, opts)
const PASSWORD = 'drafts-rls-Passw0rd!'
const tag = `gdr${Date.now()}`

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

const consent = { guardian: true, teach: true, improve: false }
const card = (headline: string) => ({ headline, focus: [], lookingAhead: 'Next up is subtracting fractions.' })

beforeAll(async () => {
  const [sA] = await ok(service.from('schools').insert({ name: `${tag} School A`, country: 'ZA' }).select('id'))
  const [sB] = await ok(service.from('schools').insert({ name: `${tag} School B`, country: 'ZA' }).select('id'))
  schoolIds.push(sA!.id, sB!.id)
  const tA = await mkUser('teacher', 'teacher', sA!.id)
  const tA2 = await mkUser('colleague', 'teacher', sA!.id) // a teacher of the same school who does not teach Amina's class
  const tB = await mkUser('otherTeacher', 'teacher', sB!.id)
  await mkUser('parent', 'parent', null)
  await mkUser('pendingParent', 'parent', null)
  await mkUser('strangerParent', 'parent', null)
  const kid = await mkUser('learner', 'learner', sA!.id)
  const [cA] = await ok(service.from('classes').insert({ school_id: sA!.id, teacher_id: tA, name: '6B Mathematics', grade: 6, year: 2026, subject: 'Mathematics', join_code: `${tag}A` }).select('id'))
  const [cA2] = await ok(service.from('classes').insert({ school_id: sA!.id, teacher_id: tA2, name: '6C Mathematics', grade: 6, year: 2026, subject: 'Mathematics', join_code: `${tag}C` }).select('id'))
  const [cB] = await ok(service.from('classes').insert({ school_id: sB!.id, teacher_id: tB, name: '6D Mathematics', grade: 6, year: 2026, subject: 'Mathematics', join_code: `${tag}B` }).select('id'))
  const [amina] = await ok(service.from('children').insert({ school_id: sA!.id, first_name: 'Amina', grade: 6, user_id: kid }).select('id'))
  const [thabo] = await ok(service.from('children').insert({ school_id: sA!.id, first_name: 'Thabo', grade: 6 }).select('id'))
  const [bongi] = await ok(service.from('children').insert({ school_id: sB!.id, first_name: 'Bongi', grade: 6 }).select('id'))
  Object.assign(ids, { sA: sA!.id, sB: sB!.id, cA: cA!.id, cA2: cA2!.id, cB: cB!.id, amina: amina!.id, thabo: thabo!.id, bongi: bongi!.id })
  await ok(service.from('enrolments').insert([{ class_id: cA!.id, child_id: amina!.id }, { class_id: cA!.id, child_id: thabo!.id }, { class_id: cB!.id, child_id: bongi!.id }]))
  await ok(
    service.from('parent_links').insert([
      { parent_id: users.parent!.id, child_id: amina!.id, class_id: cA!.id, status: 'approved', consent },
      { parent_id: users.pendingParent!.id, child_id: amina!.id, class_id: cA!.id, status: 'pending', consent },
      { parent_id: users.strangerParent!.id, child_id: thabo!.id, class_id: cA!.id, status: 'approved', consent },
    ]),
  )
  await ok(
    service.from('guidance_drafts').insert([
      { child_id: amina!.id, content: card('Draft for Amina') },
      { child_id: thabo!.id, content: card('Draft for Thabo') },
      { child_id: bongi!.id, content: card('Draft for Bongi') },
    ]),
  )
  // Amina's family already has a card, which stays as it was.
  await ok(service.from('guidance_cards').insert({ child_id: amina!.id, content: card('The card the family reads') }))
})

afterAll(async () => {
  if (schoolIds.length) await service.from('schools').delete().in('id', schoolIds)
  for (const u of Object.values(users)) await service.auth.admin.deleteUser(u.id)
})

const draftsOf = async (who: string) => (await ok(users[who]!.client.from('guidance_drafts').select('child_id, content'))).map((r) => (r.content as { headline: string }).headline).sort()
const cardsOf = async (who: string) => (await ok(users[who]!.client.from('guidance_cards').select('content'))).map((r) => (r.content as { headline: string }).headline).sort()

describe('who reads a draft', () => {
  test('the teacher of the class reads the drafts of the learners of the class, and no other', async () => {
    expect(await draftsOf('teacher')).toEqual(['Draft for Amina', 'Draft for Thabo'])
  })

  test('a teacher of another class of the same school reads none', async () => {
    expect(await draftsOf('colleague')).toEqual([])
  })

  test('a teacher of another school reads only the draft of their own learner', async () => {
    expect(await draftsOf('otherTeacher')).toEqual(['Draft for Bongi'])
  })

  test.each(['parent', 'pendingParent', 'strangerParent', 'learner'] as const)('%s reads no draft at all, not even the draft of their own child', async (who) => {
    expect(await draftsOf(who)).toEqual([])
  })

  test('a person who is signed out reads no draft', async () => {
    const anon = createClient(url, anonKey, opts)
    const r = await anon.from('guidance_drafts').select('child_id')
    expect(r.data ?? []).toEqual([])
  })
})

describe('who writes a draft', () => {
  const draft = { content: card('Written by a person') }

  test.each(['teacher', 'colleague', 'parent', 'learner'] as const)('%s cannot insert one', async (who) => {
    const r = await users[who]!.client.from('guidance_drafts').insert({ child_id: ids.amina!, ...draft })
    expect(r.error).not.toBeNull()
  })

  test.each(['teacher', 'parent', 'learner'] as const)('%s cannot change or remove one', async (who) => {
    const update = await users[who]!.client.from('guidance_drafts').update(draft).eq('child_id', ids.amina!).select('child_id')
    expect(update.data ?? []).toEqual([])
    const remove = await users[who]!.client.from('guidance_drafts').delete().eq('child_id', ids.amina!).select('child_id')
    expect(remove.data ?? []).toEqual([])
    const kept = await ok(service.from('guidance_drafts').select('content').eq('child_id', ids.amina!).single())
    expect((kept.content as { headline: string }).headline).toBe('Draft for Amina')
  })

  test('the service role writes: it makes a draft, replaces it and removes it', async () => {
    await ok(service.from('guidance_drafts').upsert({ child_id: ids.thabo!, content: card('Replaced for Thabo'), updated_at: new Date().toISOString() }, { onConflict: 'child_id' }))
    expect(await draftsOf('teacher')).toEqual(['Draft for Amina', 'Replaced for Thabo'])
    await ok(service.from('guidance_drafts').delete().eq('child_id', ids.thabo!).select('child_id'))
    expect(await draftsOf('teacher')).toEqual(['Draft for Amina'])
  })
})

describe('the card the family reads is as it was', () => {
  test('the family and the teacher read guidance_cards, and a draft changes nothing there', async () => {
    for (const who of ['teacher', 'parent', 'learner'] as const) expect(await cardsOf(who)).toEqual(['The card the family reads'])
    expect(await cardsOf('pendingParent')).toEqual([])
    expect(await cardsOf('otherTeacher')).toEqual([])
  })

  test('nobody but the service role writes a card either', async () => {
    const r = await users.teacher!.client.from('guidance_cards').insert({ child_id: ids.thabo!, content: card('Written by a teacher') })
    expect(r.error).not.toBeNull()
  })
})

describe('a draft goes with its child', () => {
  test('removing a child removes the draft', async () => {
    const [kid] = await ok(service.from('children').insert({ school_id: ids.sA!, first_name: 'Zola', grade: 6 }).select('id'))
    await ok(service.from('guidance_drafts').insert({ child_id: kid!.id, content: card('Draft for Zola') }))
    await ok(service.from('children').delete().eq('id', kid!.id).select('id'))
    expect(await ok(service.from('guidance_drafts').select('child_id').eq('child_id', kid!.id))).toEqual([])
  })
})
