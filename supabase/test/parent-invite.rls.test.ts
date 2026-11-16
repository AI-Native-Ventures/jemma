import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { createServiceClient, type JemmaDb } from '../../packages/profiling/src/db'
import { BAD_CODE, linkParentWithCode, makeParentCode, ParentCodeError } from '../../packages/profiling/src/parent-invite'

// A parent links to a learner who signed up alone (P114), on real rows: the table of codes (one live code for each learner, a code is unique, who reads
// it: the learner and nobody else, who writes it: nobody but the service role) and the two functions on real rows (the link is approved on the learner's
// own class, a code works once even when two parents use it at the same moment, a new code replaces the old one, a parent then reads the child).
// A personal school made for this file. No agent and no model.

const url = process.env.SUPABASE_URL!
const anonKey = process.env.SUPABASE_ANON_KEY!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const service = createServiceClient({ SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: serviceKey })
const PASSWORD = 'invite-rls-Passw0rd!'
const tag = `inv${Date.now()}`

type Actor = { id: string; client: JemmaDb }
const users: Record<string, Actor> = {}
const schoolIds: string[] = []
const ids: Record<string, string> = {}

async function ok<T>(q: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<NonNullable<T>> {
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return data as NonNullable<T>
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

/** The codes of the two learners this file made that the client can read. A read names the rows it expects, never the whole table. */
const codesSeenBy = async (client: JemmaDb) => {
  const rows = await ok(client.from('parent_invite_codes').select('child_id, code').in('child_id', [ids.neo!, ids.zola!]))
  return rows.map((r: { child_id: string }) => r.child_id).sort()
}

beforeAll(async () => {
  const [school] = await ok(service.from('schools').insert({ name: `${tag} Neo's own`, country: 'ZA', kind: 'private' }).select('id'))
  const [other] = await ok(service.from('schools').insert({ name: `${tag} Other`, country: 'ZA' }).select('id'))
  schoolIds.push(school!.id, other!.id)
  const neoLogin = await mkUser('neo', 'learner', school!.id, 'Neo')
  const zolaLogin = await mkUser('zola', 'learner', school!.id, 'Zola')
  await mkUser('parent', 'parent', null, 'Palesa')
  await mkUser('secondParent', 'parent', null, 'Sipho')
  await mkUser('stranger', 'parent', null, 'Stranger')
  await mkUser('teacher', 'teacher', other!.id, 'Ms Banda')
  const kids = await ok(
    service
      .from('children')
      .insert([
        { school_id: school!.id, first_name: 'Neo', grade: 5, user_id: neoLogin, private_of: null },
        { school_id: school!.id, first_name: 'Zola', grade: 6, user_id: zolaLogin, private_of: null },
      ])
      .select('id, first_name'),
  )
  ids.neo = kids.find((k) => k.first_name === 'Neo')!.id
  ids.zola = kids.find((k) => k.first_name === 'Zola')!.id
  const [caps] = await ok(service.from('classes').insert({ school_id: school!.id, teacher_id: neoLogin, name: 'Grade 5 (my own)', grade: 5, year: 2026, subject: 'Mathematics', join_code: `${tag}A` }).select('id'))
  ids.caps = caps!.id
  await ok(service.from('enrolments').insert({ class_id: caps!.id, child_id: ids.neo }).select('class_id'))
})

afterAll(async () => {
  if (schoolIds.length) await service.from('schools').delete().in('id', schoolIds)
  for (const u of Object.values(users)) await service.auth.admin.deleteUser(u.id)
})

describe('the table of codes', () => {
  test('one live code for each learner: a second row for the same learner is refused', async () => {
    await ok(service.from('parent_invite_codes').insert({ child_id: ids.neo!, code: 'TAGA22', expires_at: '2099-01-01T00:00:00Z' }).select('code'))
    const second = await service.from('parent_invite_codes').insert({ child_id: ids.neo!, code: 'TAGB22', expires_at: '2099-01-01T00:00:00Z' })
    expect(second.error?.code).toBe('23505')
    await service.from('parent_invite_codes').delete().eq('child_id', ids.neo!)
  })

  test('a code is unique: a second learner cannot hold the same code', async () => {
    await ok(service.from('parent_invite_codes').insert({ child_id: ids.neo!, code: 'TAGC22', expires_at: '2099-01-01T00:00:00Z' }).select('code'))
    const same = await service.from('parent_invite_codes').insert({ child_id: ids.zola!, code: 'TAGC22', expires_at: '2099-01-01T00:00:00Z' })
    expect(same.error?.code).toBe('23505')
    await service.from('parent_invite_codes').delete().eq('child_id', ids.neo!)
  })

  test('the learner reads their own code and no one else’s; a parent, a teacher and a stranger read none', async () => {
    await makeParentCode(service, { childId: ids.neo!, actorUserId: users.neo!.id })
    await makeParentCode(service, { childId: ids.zola!, actorUserId: users.zola!.id })
    expect(await codesSeenBy(users.neo!.client)).toEqual([ids.neo])
    expect(await codesSeenBy(users.zola!.client)).toEqual([ids.zola])
    expect(await codesSeenBy(users.parent!.client)).toEqual([])
    expect(await codesSeenBy(users.stranger!.client)).toEqual([])
    expect(await codesSeenBy(users.teacher!.client)).toEqual([])
    expect(await codesSeenBy(service)).toEqual([ids.neo, ids.zola].sort())
  })

  test('nobody writes with their own login: not the learner, not a parent', async () => {
    const before = await ok(service.from('parent_invite_codes').select('code, expires_at').eq('child_id', ids.neo!).single())
    for (const key of ['neo', 'parent']) {
      const client = users[key]!.client
      const insert = await client.from('parent_invite_codes').insert({ child_id: ids.zola!, code: 'TAGD22', expires_at: '2099-01-01T00:00:00Z' })
      expect(insert.error, `${key} insert`).not.toBeNull()
      await client.from('parent_invite_codes').update({ expires_at: '2099-01-01T00:00:00Z', code: 'TAGE22' }).eq('child_id', ids.neo!)
      await client.from('parent_invite_codes').delete().eq('child_id', ids.neo!)
    }
    const after = await ok(service.from('parent_invite_codes').select('code, expires_at').eq('child_id', ids.neo!).single())
    expect(after).toEqual(before)
    expect((await service.from('parent_invite_codes').select('child_id').eq('code', 'TAGD22')).data).toEqual([])
  })

  test('a learner who is gone takes their code with them', async () => {
    const [gone] = await ok(service.from('children').insert({ school_id: schoolIds[0]!, first_name: 'Gone', grade: 4 }).select('id'))
    await ok(service.from('parent_invite_codes').insert({ child_id: gone!.id, code: 'TAGF22', expires_at: '2099-01-01T00:00:00Z' }).select('code'))
    await ok(service.from('children').delete().eq('id', gone!.id).select('id'))
    expect((await service.from('parent_invite_codes').select('child_id').eq('code', 'TAGF22')).data).toEqual([])
  })
})

describe('the two functions on real rows', () => {
  test('only the learner makes a code for themselves', async () => {
    await expect(makeParentCode(service, { childId: ids.neo!, actorUserId: users.zola!.id })).rejects.toThrow(ParentCodeError)
    await expect(makeParentCode(service, { childId: ids.neo!, actorUserId: users.parent!.id })).rejects.toThrow(ParentCodeError)
  })

  test('a new code replaces the old one: one row stays and the old code links nobody', async () => {
    const first = await makeParentCode(service, { childId: ids.neo!, actorUserId: users.neo!.id })
    const second = await makeParentCode(service, { childId: ids.neo!, actorUserId: users.neo!.id })
    expect(second.code).not.toBe(first.code)
    const rows = await ok(service.from('parent_invite_codes').select('code').eq('child_id', ids.neo!))
    expect(rows).toEqual([{ code: second.code }])
    expect(await linkParentWithCode(service, { parentId: users.parent!.id, code: first.code })).toEqual({ ok: false, reason: BAD_CODE })
    expect((await service.from('parent_links').select('id').eq('child_id', ids.neo!)).data).toEqual([])
  })

  test('a parent links with the code: an approved link on the learner’s class, the code is used up, and the parent then reads the child', async () => {
    const { code } = await makeParentCode(service, { childId: ids.neo!, actorUserId: users.neo!.id })
    // Before the link the parent reads nothing of the child.
    expect((await users.parent!.client.from('children').select('id').eq('id', ids.neo!)).data).toEqual([])
    const result = await linkParentWithCode(service, { parentId: users.parent!.id, code: code.toLowerCase() })
    expect(result).toEqual({ ok: true, childId: ids.neo, firstName: 'Neo' })
    const links = await ok(service.from('parent_links').select('parent_id, status, class_id, consent').eq('child_id', ids.neo!))
    expect(links).toEqual([{ parent_id: users.parent!.id, status: 'approved', class_id: ids.caps, consent: { guardian: true, teach: true, improve: false } }])
    expect((await service.from('parent_invite_codes').select('code').eq('child_id', ids.neo!)).data).toEqual([])
    const seen = await ok(users.parent!.client.from('children').select('id, first_name').eq('id', ids.neo!))
    expect(seen).toEqual([{ id: ids.neo, first_name: 'Neo' }])
    // Used up: the same code links nobody again.
    expect(await linkParentWithCode(service, { parentId: users.secondParent!.id, code })).toEqual({ ok: false, reason: BAD_CODE })
    // A stranger still reads nothing of the child.
    expect((await users.stranger!.client.from('children').select('id').eq('id', ids.neo!)).data).toEqual([])
  })

  test('two parents using one code at the same moment: one is linked, the other is told the code is not right', async () => {
    await service.from('parent_links').delete().eq('child_id', ids.neo!)
    const { code } = await makeParentCode(service, { childId: ids.neo!, actorUserId: users.neo!.id })
    const both = await Promise.all([linkParentWithCode(service, { parentId: users.parent!.id, code }), linkParentWithCode(service, { parentId: users.secondParent!.id, code })])
    expect(both.filter((r) => r.ok)).toHaveLength(1)
    expect(both.filter((r) => !r.ok)).toEqual([{ ok: false, reason: BAD_CODE }])
    expect(await ok(service.from('parent_links').select('parent_id').eq('child_id', ids.neo!))).toHaveLength(1)
  })

  test('a code past its 7 days is refused and taken away', async () => {
    await service.from('parent_links').delete().eq('child_id', ids.neo!)
    const { code } = await makeParentCode(service, { childId: ids.neo!, actorUserId: users.neo!.id })
    await ok(service.from('parent_invite_codes').update({ expires_at: '2020-01-01T00:00:00Z' }).eq('child_id', ids.neo!).select('code'))
    const result = await linkParentWithCode(service, { parentId: users.parent!.id, code })
    expect(result.ok).toBe(false)
    expect((await service.from('parent_links').select('id').eq('child_id', ids.neo!)).data).toEqual([])
    expect((await service.from('parent_invite_codes').select('code').eq('child_id', ids.neo!)).data).toEqual([])
  })
})
