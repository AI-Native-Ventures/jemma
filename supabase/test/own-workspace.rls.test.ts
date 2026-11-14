import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { createServiceClient, type JemmaDb } from '../../packages/profiling/src/db'
import { addOwnGrade, ensureOwnWorkspace, getOwnOverview, getOwnWorkspaceForTeacher, listOwnClasses, OwnWorkspaceError, twinOfChild } from '../../packages/profiling/src/own-workspace'

// A learner's own private workspace on real rows: the migration (one twin for each learner, the kind of a school), who reads the twin (the learner,
// an approved parent, nobody else, never a teacher of the school), that the school never sees it, and what the teacher's read-only function returns.
// A small school made for this file. No agent and no model.

const url = process.env.SUPABASE_URL!
const anonKey = process.env.SUPABASE_ANON_KEY!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const service = createServiceClient({ SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: serviceKey })
const PASSWORD = 'own-rls-Passw0rd!'
const tag = `own${Date.now()}`

type Actor = { id: string; client: JemmaDb }
const users: Record<string, Actor> = {}
const schoolIds: string[] = []
const ids: Record<string, string> = {}
const NOW = new Date('2026-11-14T10:00:00.000Z')

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

const consent = { guardian: true, teach: true, improve: false }
// Every read under row level security names the rows this file made, never a table and never a whole map. A read asks the policy about every row it
// returns, and the policies of `topics` (can_see_map, then can_see_child inside it) are costly for each row: reading the 60 or so topics of two maps
// ran into the 8 second statement timeout on a busy CI database. So a topic is read on a primary key, one or two rows, and what it proves about
// the policy is the same. Children, sessions, classes and schools are a handful of rows each.
type Scoped = 'children' | 'sessions' | 'classes' | 'schools' | 'topics'
const scope = (table: Scoped): [column: string, values: () => string[]] => {
  const known = (...keys: string[]) => () => keys.map((k) => ids[k]).filter((v): v is string => !!v)
  switch (table) {
    case 'children':
      return ['id', known('amina', 'thabo', 'zola', 'twin', 'thaboTwin')]
    case 'sessions':
      return ['child_id', known('amina', 'thabo', 'zola', 'twin', 'thaboTwin')]
    case 'classes':
      return ['id', known('cA', 'cB', 'g6', 'g7')]
    case 'schools':
      return ['id', known('sA', 'sB', 'twinSchool', 'thaboSchool')]
    case 'topics':
      return ['id', known('topic6', 'topic7')]
  }
}
const idsOf = async (client: JemmaDb, table: Scoped): Promise<string[]> => {
  const [column, values] = scope(table)
  const rows = await ok(client.from(table).select('id').in(column, values()))
  return rows.map((r: { id: string }) => r.id)
}
/** The children (id and whether they are a twin) this file made that the client can read. */
const childrenOf = async (client: JemmaDb, onlySchool = false) => {
  const [column, values] = scope('children')
  const query = client.from('children').select('id, private_of').in(column, values())
  return ok(onlySchool ? query.is('private_of', null) : query)
}

beforeAll(async () => {
  const [sA] = await ok(service.from('schools').insert({ name: `${tag} School A`, country: 'ZA' }).select('id'))
  const [sB] = await ok(service.from('schools').insert({ name: `${tag} School B`, country: 'ZA' }).select('id'))
  schoolIds.push(sA!.id, sB!.id)
  const tA = await mkUser('teacher', 'teacher', sA!.id, 'Ms Banda')
  const tB = await mkUser('otherTeacher', 'teacher', sB!.id, 'Mr Other')
  await mkUser('parent', 'parent', null, 'Thandi M')
  await mkUser('pendingParent', 'parent', null, 'Pending P')
  await mkUser('strangerParent', 'parent', null, 'Stranger S')
  const kid = await mkUser('learner', 'learner', sA!.id, 'Amina')
  const [cA] = await ok(service.from('classes').insert({ school_id: sA!.id, teacher_id: tA, name: '6B Mathematics', grade: 6, year: 2026, subject: 'Mathematics', join_code: `${tag}A` }).select('id'))
  const [cB] = await ok(service.from('classes').insert({ school_id: sB!.id, teacher_id: tB, name: '6C Mathematics', grade: 6, year: 2026, subject: 'Mathematics', join_code: `${tag}B` }).select('id'))
  const kids = await ok(
    service
      .from('children')
      .insert([
        { school_id: sA!.id, first_name: 'Amina', last_name: 'Dlamini', grade: 6, user_id: kid, parent_first_name: 'Thandi', parent_relation: 'mum' },
        { school_id: sA!.id, first_name: 'Thabo', grade: 6 },
        { school_id: sA!.id, first_name: 'Zola', grade: 6 },
      ])
      .select('id, first_name'),
  )
  const of = (n: string) => kids.find((k) => k.first_name === n)!.id
  Object.assign(ids, { sA: sA!.id, sB: sB!.id, cA: cA!.id, cB: cB!.id, amina: of('Amina'), thabo: of('Thabo'), zola: of('Zola'), kid, teacher: tA, otherTeacher: tB })
  await ok(service.from('enrolments').insert(kids.map((k) => ({ class_id: cA!.id, child_id: k.id }))))
  await ok(
    service.from('parent_links').insert([
      { parent_id: users.parent!.id, child_id: ids.amina!, class_id: cA!.id, status: 'approved', consent },
      { parent_id: users.pendingParent!.id, child_id: ids.amina!, class_id: cA!.id, status: 'pending', consent },
      { parent_id: users.strangerParent!.id, child_id: ids.thabo!, class_id: cA!.id, status: 'approved', consent },
    ]),
  )

  // Amina opens My own and adds Grade 6 and Grade 7; one finished practice with five Try answers (3 right) on a Grade 6 topic.
  ids.twin = await ensureOwnWorkspace(service, ids.amina!, kid)
  ids.twinSchool = (await ok(service.from('children').select('school_id').eq('id', ids.twin).single())).school_id
  const g6 = await addOwnGrade(service, ids.twin!, 6, kid, NOW)
  const g7 = await addOwnGrade(service, ids.twin!, 7, kid, NOW)
  Object.assign(ids, { g6: g6.classId, g7: g7.classId })
  const map6 = await ok(service.from('curriculum_maps').select('id').eq('class_id', g6.classId).eq('status', 'approved'))
  const map7 = await ok(service.from('curriculum_maps').select('id').eq('class_id', g7.classId).eq('status', 'approved'))
  Object.assign(ids, { map6: map6[0]!.id, map7: map7[0]!.id })
  const topic = (await ok(service.from('topics').select('id, name').eq('map_id', map6[0]!.id).eq('name', 'Common fractions')))[0]!
  const topic7 = (await ok(service.from('topics').select('id').eq('map_id', map7[0]!.id).order('term').order('position').limit(1)))[0]!
  Object.assign(ids, { topic: topic.id, topic6: topic.id, topic7: topic7.id })
  const [session] = await ok(
    service
      .from('sessions')
      .insert({ child_id: ids.twin!, lesson_id: null, status: 'done', planned_for: '2026-11-13', warmup: [], right: 3, minutes: 9, finished_at: '2026-11-13T16:00:00Z', topic_id: topic.id, topic_name: topic.name })
      .select('id'),
  )
  ids.session = session!.id
  await ok(
    service.from('session_items').insert(
      [true, true, false, true, false].map((correct, i) => ({ session_id: session!.id, position: i + 1, phase: 'try' as const, question: { prompt: `Q${i + 1}` }, difficulty: 2, answer: 'x', correct, seconds: 30 })),
    ),
  )
})

afterAll(async () => {
  // The personal schools are not inside the schools made above: they go first, by the twins that point at the school children.
  const twins = ids.amina ? await service.from('children').select('school_id').in('private_of', [ids.amina, ids.thabo!, ids.zola!]) : null
  const personal = (twins?.data ?? []).map((t) => t.school_id)
  if (schoolIds.length) await service.from('schools').delete().in('id', [...schoolIds, ...personal])
  for (const u of Object.values(users)) await service.auth.admin.deleteUser(u.id)
})

describe('the migration', () => {
  test('a learner has one twin: a second row for the same school child is refused', async () => {
    const second = await service.from('children').insert({ school_id: ids.twinSchool!, first_name: 'Amina', grade: 6, private_of: ids.amina! })
    expect(second.error?.code).toBe('23505')
  })

  test('a school is a school or a private school, nothing else', async () => {
    const bad = await service.from('schools').insert({ name: `${tag} odd`, country: 'ZA', kind: 'club' })
    expect(bad.error?.code).toBe('23514')
    const plain = await ok(service.from('schools').select('kind').eq('id', ids.sA!).single())
    expect(plain.kind).toBe('school')
  })

  test('the twin is in a private school of its own, named for the learner, with the learner\'s name, grade, login and mum', async () => {
    const twin = await ok(service.from('children').select('school_id, first_name, last_name, grade, user_id, private_of, parent_first_name, parent_relation').eq('id', ids.twin!).single())
    expect(twin).toMatchObject({ first_name: 'Amina', last_name: 'Dlamini', grade: 6, user_id: ids.kid, private_of: ids.amina, parent_first_name: 'Thandi', parent_relation: 'mum' })
    expect(twin.school_id).toBe(ids.twinSchool)
    expect(twin.school_id).not.toBe(ids.sA)
    expect(await ok(service.from('schools').select('name, country, kind').eq('id', twin.school_id).single())).toEqual({ name: "Amina's own", country: 'ZA', kind: 'private' })
  })

  test('opening it again gives the same twin and makes no second school', async () => {
    expect(await ensureOwnWorkspace(service, ids.amina!, ids.kid!)).toBe(ids.twin)
    expect(await ensureOwnWorkspace(service, ids.amina!, users.parent!.id)).toBe(ids.twin)
    expect(await twinOfChild(service, ids.amina!)).toEqual({ id: ids.twin })
    expect(await ok(service.from('children').select('id').eq('private_of', ids.amina!))).toHaveLength(1)
    expect(await ok(service.from('schools').select('id').eq('kind', 'private').eq('id', ids.twinSchool!))).toHaveLength(1)
  })

  test('only the learner\'s login or an approved parent may open it', async () => {
    // Zola has no login and no parent: nobody of this school's cast may open My own for her.
    for (const who of [users.pendingParent!.id, users.strangerParent!.id, ids.teacher!, ids.otherTeacher!, ids.kid!]) {
      await expect(ensureOwnWorkspace(service, ids.zola!, who)).rejects.toBeInstanceOf(OwnWorkspaceError)
    }
    expect(await twinOfChild(service, ids.zola!)).toBeNull()
    // Thabo's approved parent may.
    const made = await ensureOwnWorkspace(service, ids.thabo!, users.strangerParent!.id)
    expect(await twinOfChild(service, ids.thabo!)).toEqual({ id: made })
    ids.thaboTwin = made
    ids.thaboSchool = (await ok(service.from('children').select('school_id').eq('id', made).single())).school_id
  })

  test('each grade is a private class with its own approved CAPS map', async () => {
    const classes = await listOwnClasses(service, ids.twin!)
    expect(classes.map((c) => [c.grade, c.name])).toEqual([[6, 'Grade 6 (my own)'], [7, 'Grade 7 (my own)']])
    for (const c of classes) {
      const maps = await ok(service.from('curriculum_maps').select('id, status').eq('class_id', c.id))
      expect(maps).toHaveLength(1)
      expect(maps[0]!.status).toBe('approved')
      expect((await ok(service.from('topics').select('id').eq('map_id', maps[0]!.id))).length).toBeGreaterThan(10)
    }
    const again = await addOwnGrade(service, ids.twin!, 6, ids.kid!, NOW)
    expect(again).toMatchObject({ classId: ids.g6, created: false })
    expect(await listOwnClasses(service, ids.twin!)).toHaveLength(2)
    await expect(addOwnGrade(service, ids.twin!, 13, ids.kid!, NOW)).rejects.toBeInstanceOf(OwnWorkspaceError)
  })

  test('deleting the school child takes the twin with it', async () => {
    const [lone] = await ok(service.from('children').insert({ school_id: ids.sA!, first_name: 'Lone', grade: 5, user_id: ids.kid! }).select('id'))
    const made = await ensureOwnWorkspace(service, lone!.id, ids.kid!)
    const personal = await ok(service.from('children').select('school_id').eq('id', made).single())
    await service.from('children').delete().eq('id', lone!.id)
    expect(await ok(service.from('children').select('id').eq('id', made))).toEqual([])
    await service.from('schools').delete().eq('id', personal.school_id)
  })
})

describe('who reads the twin', () => {
  test('the learner reads the twin, its school, its classes, its topics and its sessions, beside the school child', async () => {
    const learner = users.learner!.client
    const children = await childrenOf(learner)
    expect(children.map((c) => c.id).sort()).toEqual([ids.amina!, ids.twin!].sort())
    expect(await idsOf(learner, 'sessions')).toContain(ids.session)
    expect((await idsOf(learner, 'classes'))).toEqual(expect.arrayContaining([ids.cA!, ids.g6!, ids.g7!]))
    expect((await idsOf(learner, 'schools')).length).toBe(2)
    // One topic of each of the two own maps (the learner owns both classes).
    expect((await idsOf(learner, 'topics')).sort()).toEqual([ids.topic6!, ids.topic7!].sort())
  })

  test('an approved parent reads the twin and its sessions, as they read the school child', async () => {
    const parent = users.parent!.client
    const children = await childrenOf(parent)
    expect(children.map((c) => c.id).sort()).toEqual([ids.amina!, ids.twin!].sort())
    expect((await childrenOf(parent, true)).map((c) => c.id)).toEqual([ids.amina])
    expect(await idsOf(parent, 'sessions')).toContain(ids.session)
    expect((await idsOf(parent, 'schools')).length).toBe(2)
  })

  test('a pending parent, another child\'s parent and a teacher of another school read none of it', async () => {
    for (const key of ['pendingParent', 'strangerParent', 'otherTeacher']) {
      const client = users[key]!.client
      expect(await idsOf(client, 'children'), key).not.toContain(ids.twin)
      expect(await idsOf(client, 'sessions'), key).toEqual([])
      expect(await idsOf(client, 'classes'), key).not.toEqual(expect.arrayContaining([ids.g6!]))
    }
    // Thabo's approved parent reads Thabo and Thabo's own workspace (opened above), and not Amina's.
    expect((await idsOf(users.strangerParent!.client, 'children')).sort()).toEqual([ids.thabo!, ids.thaboTwin!].sort())
  })

  test('the teacher of the school never reads the twin through a policy: not the child, not its classes, topics or sessions', async () => {
    const teacher = users.teacher!.client
    expect((await idsOf(teacher, 'children')).sort()).toEqual([ids.amina!, ids.thabo!, ids.zola!].sort())
    expect(await idsOf(teacher, 'sessions')).toEqual([])
    expect(await idsOf(teacher, 'classes')).toEqual([ids.cA])
    expect(await idsOf(teacher, 'schools')).toEqual([ids.sA])
    expect(await idsOf(teacher, 'topics')).toEqual([])
  })

  test('the school sees nothing of it: its class list and its roster are as they were', async () => {
    expect((await ok(service.from('enrolments').select('child_id').eq('class_id', ids.cA!))).map((e) => e.child_id).sort()).toEqual([ids.amina!, ids.thabo!, ids.zola!].sort())
    expect((await ok(service.from('classes').select('id').eq('school_id', ids.sA!))).map((c) => c.id)).toEqual([ids.cA])
    expect((await ok(service.from('children').select('id').eq('school_id', ids.sA!))).map((c) => c.id).sort()).toEqual([ids.amina!, ids.thabo!, ids.zola!].sort())
  })
})

describe('the overview and the teacher\'s read-only function', () => {
  test('the overview lists both grades with the learner\'s own count', async () => {
    const overview = await getOwnOverview(service, ids.twin!, NOW)
    expect(overview.map((g) => [g.grade, g.score])).toEqual([[6, { right: 3, asked: 5 }], [7, { right: 0, asked: 0 }]])
    expect(overview.every((g) => g.topics > 10)).toBe(true)
  })

  test('the teacher of the class gets the summary; another teacher gets nothing; nothing is written', async () => {
    const before = JSON.stringify([await ok(service.from('sessions').select('id').eq('child_id', ids.twin!)), await ok(service.from('children').select('id').eq('private_of', ids.amina!))])
    const summary = await getOwnWorkspaceForTeacher(service, { teacherId: ids.teacher!, classId: ids.cA!, childId: ids.amina!, now: NOW })
    expect(summary).not.toBeNull()
    expect(summary!.grades.map((g) => g.grade)).toEqual([6, 7])
    expect(summary!.grades[0]!.practised).toEqual([expect.objectContaining({ name: 'Common fractions', score: { right: 3, asked: 5 } })])
    expect(summary!.sessions).toEqual([expect.objectContaining({ topic: 'Common fractions', right: 3, asked: 5 })])
    expect(await getOwnWorkspaceForTeacher(service, { teacherId: ids.otherTeacher!, classId: ids.cA!, childId: ids.amina!, now: NOW })).toBeNull()
    expect(await getOwnWorkspaceForTeacher(service, { teacherId: ids.teacher!, classId: ids.cA!, childId: ids.twin!, now: NOW })).toBeNull()
    // Zola never opened My own: nothing. Thabo's parent opened it and added no grade yet: an empty workspace, not nothing.
    expect(await getOwnWorkspaceForTeacher(service, { teacherId: ids.teacher!, classId: ids.cA!, childId: ids.zola!, now: NOW })).toBeNull()
    expect(await getOwnWorkspaceForTeacher(service, { teacherId: ids.teacher!, classId: ids.cA!, childId: ids.thabo!, now: NOW })).toEqual({
      firstName: 'Thabo', grades: [], gaps: { open: [], fixed: [] }, sessions: [],
    })
    expect(JSON.stringify([await ok(service.from('sessions').select('id').eq('child_id', ids.twin!)), await ok(service.from('children').select('id').eq('private_of', ids.amina!))])).toBe(before)
  })
})
