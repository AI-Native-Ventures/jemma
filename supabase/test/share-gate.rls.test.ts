import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// P50b: a class test stays hidden from the family (an approved parent and the learner) until the teacher shares it.
// Real rows on jemma-dev, in a small school made for this file. Nobody is called live: no model, no agent.

const url = process.env.SUPABASE_URL!
const anonKey = process.env.SUPABASE_ANON_KEY!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const service = createClient(url, serviceKey, opts)
const PASSWORD = 'share-rls-Passw0rd!'
const tag = `shr${Date.now()}`

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

beforeAll(async () => {
  const [sA] = await ok(service.from('schools').insert({ name: `${tag} School A`, country: 'ZA' }).select('id'))
  const [sB] = await ok(service.from('schools').insert({ name: `${tag} School B`, country: 'ZA' }).select('id'))
  schoolIds.push(sA!.id, sB!.id)
  const tA = await mkUser('teacher', 'teacher', sA!.id)
  const tB = await mkUser('otherTeacher', 'teacher', sB!.id)
  await mkUser('parent', 'parent', null)
  await mkUser('pendingParent', 'parent', null)
  await mkUser('strangerParent', 'parent', null)
  const kid = await mkUser('learner', 'learner', sA!.id)
  const [cA] = await ok(service.from('classes').insert({ school_id: sA!.id, teacher_id: tA, name: '6B Mathematics', grade: 6, year: 2026, subject: 'Mathematics', join_code: `${tag}A` }).select('id'))
  const [cB] = await ok(service.from('classes').insert({ school_id: sB!.id, teacher_id: tB, name: '6C Mathematics', grade: 6, year: 2026, subject: 'Mathematics', join_code: `${tag}B` }).select('id'))
  const [amina] = await ok(service.from('children').insert({ school_id: sA!.id, first_name: 'Amina', grade: 6, user_id: kid }).select('id'))
  const [thabo] = await ok(service.from('children').insert({ school_id: sA!.id, first_name: 'Thabo', grade: 6 }).select('id'))
  const [bongi] = await ok(service.from('children').insert({ school_id: sB!.id, first_name: 'Bongi', grade: 6 }).select('id'))
  Object.assign(ids, { sA: sA!.id, sB: sB!.id, cA: cA!.id, cB: cB!.id, amina: amina!.id, thabo: thabo!.id, bongi: bongi!.id })
  await ok(service.from('enrolments').insert([{ class_id: cA!.id, child_id: amina!.id }, { class_id: cA!.id, child_id: thabo!.id }, { class_id: cB!.id, child_id: bongi!.id }]))
  await ok(
    service.from('parent_links').insert([
      { parent_id: users.parent!.id, child_id: amina!.id, class_id: cA!.id, status: 'approved', consent },
      { parent_id: users.pendingParent!.id, child_id: amina!.id, class_id: cA!.id, status: 'pending', consent },
      { parent_id: users.strangerParent!.id, child_id: thabo!.id, class_id: cA!.id, status: 'approved', consent },
    ]),
  )

  // Two tests of class A: a held one (new tests start held) and one that was shared long ago.
  const [held] = await ok(service.from('tests').insert({ class_id: cA!.id, title: 'Held test', out_of: 10, held: true }).select('id'))
  const [open] = await ok(service.from('tests').insert({ class_id: cA!.id, title: 'Shared test', out_of: 10, held: false, shared_at: new Date().toISOString(), shared_by: tA }).select('id'))
  Object.assign(ids, { held: held!.id, open: open!.id })

  const paper = (over: Record<string, unknown>) => ({ owner: 'teacher', kind: 'test', status: 'marked', total: 6, ...over })
  const papers = await ok(
    service
      .from('papers')
      .insert([
        paper({ test_id: held!.id, child_id: amina!.id }), // 0: Amina's paper of the held test
        paper({ test_id: held!.id, child_id: thabo!.id }), // 1: Thabo's paper of the held test
        paper({ test_id: open!.id, child_id: amina!.id }), // 2: Amina's paper of the shared test
        paper({ test_id: null, child_id: amina!.id, owner: 'parent', kind: 'homework' }), // 3: homework
        paper({ test_id: null, child_id: amina!.id, name_read: 'Term 3' }), // 4: the seeded Term 3 paper
      ])
      .select('id'),
  )
  Object.assign(ids, { pHeld: papers[0]!.id, pThabo: papers[1]!.id, pOpen: papers[2]!.id, pHomework: papers[3]!.id, pTerm3: papers[4]!.id })
  await ok(service.from('paper_pages').insert([{ paper_id: ids.pHeld!, page_no: 1, storage_path: `${tag}/held.png` }, { paper_id: ids.pOpen!, page_no: 1, storage_path: `${tag}/open.png` }]))

  const result = (paperId: string, child: string, n: number) => ({ paper_id: paperId, child_id: child, n, prompt: `Q${n}`, answer_read: '1', read_confidence: 1, correct: false, mark: 0, topic_name: 'Adding fractions' })
  const results = await ok(
    service
      .from('question_results')
      .insert([
        result(ids.pHeld!, amina!.id, 1), // 0
        result(ids.pHeld!, amina!.id, 2), // 1
        result(ids.pOpen!, amina!.id, 1), // 2
        result(ids.pHomework!, amina!.id, 1), // 3
        result(ids.pTerm3!, amina!.id, 1), // 4
        result(ids.pThabo!, thabo!.id, 1), // 5
      ])
      .select('id'),
  )
  const q = (i: number) => results[i]!.id
  Object.assign(ids, { qHeld1: q(0), qHeld2: q(1), qOpen: q(2), qHomework: q(3), qTerm3: q(4), qThabo: q(5) })

  const gap = (child: string, topic: string, evidence: string[]) => ({ child_id: child, topic_name: topic, stage: 'new', evidence })
  const gaps = await ok(
    service
      .from('gaps')
      .insert([
        gap(amina!.id, 'Only held evidence', [q(0), q(1)]), // 0
        gap(amina!.id, 'Mixed evidence', [q(1), q(3)]), // 1: held and homework
        gap(amina!.id, 'Shared evidence', [q(2)]), // 2
        gap(amina!.id, 'Homework evidence', [q(3)]), // 3
        gap(amina!.id, 'No evidence', []), // 4
        gap(thabo!.id, 'Thabo held evidence', [q(5)]), // 5
      ])
      .select('id, topic_name'),
  )
  for (const g of gaps) ids[`gap:${g.topic_name}`] = g.id

  const events = await ok(
    service
      .from('events')
      .insert([
        { school_id: sA!.id, type: 'paper.snapped', payload: { paperId: ids.pHeld }, status: 'done' }, // 0: about the held test
        { school_id: sA!.id, type: 'paper.snapped', payload: { paperId: ids.pOpen }, status: 'done' }, // 1: about the shared test
        { school_id: sA!.id, type: 'homework.snapped', payload: { paperId: ids.pHomework }, status: 'done' }, // 2: homework
        { school_id: sA!.id, type: 'observation.added', payload: { childId: amina!.id }, status: 'done' }, // 3: names no paper
        { school_id: sA!.id, type: 'paper.snapped', payload: { paperId: 'not-a-uuid' }, status: 'done' }, // 4: a broken id must not break the policy
      ])
      .select('id'),
  )
  const line = (event: string | null, text: string, child: string | null = amina!.id) => ({ school_id: sA!.id, class_id: cA!.id, child_id: child, text, tool: 'mark_paper', event_id: event })
  await ok(
    service.from('activity_log').insert([
      line(events[0]!.id, 'line:held'),
      line(events[1]!.id, 'line:shared'),
      line(events[2]!.id, 'line:homework'),
      line(events[3]!.id, 'line:note'),
      line(null, 'line:no-event'),
      line(events[4]!.id, 'line:broken-id'),
      line(events[0]!.id, 'line:school-wide', null),
    ]),
  )
})

afterAll(async () => {
  if (schoolIds.length) await service.from('schools').delete().in('id', schoolIds)
  for (const u of Object.values(users)) await service.auth.admin.deleteUser(u.id)
})

const family = ['parent', 'learner'] as const

const papersOf = async (who: string) => (await ok(users[who]!.client.from('papers').select('id'))).map((r) => r.id).sort()
const resultsOf = async (who: string) => (await ok(users[who]!.client.from('question_results').select('id'))).map((r) => r.id).sort()
const gapsOf = async (who: string) => (await ok(users[who]!.client.from('gaps').select('topic_name'))).map((r) => r.topic_name).sort()
// The lines about a child. A line with no child belongs to the school branch of the policy, which this packet leaves as it was.
const linesOf = async (who: string) => (await ok(users[who]!.client.from('activity_log').select('text'))).map((r) => r.text).filter((t) => t !== 'line:school-wide').sort()
const pagesOf = async (who: string) => (await ok(users[who]!.client.from('paper_pages').select('paper_id'))).map((r) => r.paper_id).sort()
const sorted = (...list: string[]) => [...list].sort()

describe('while a test is held', () => {
  test.each(family)('%s reads none of the held test: papers, answers, pages', async (who) => {
    const papers = await papersOf(who)
    expect(papers).not.toContain(ids.pHeld)
    expect(papers).not.toContain(ids.pThabo)
    const results = await resultsOf(who)
    expect(results).not.toContain(ids.qHeld1)
    expect(results).not.toContain(ids.qHeld2)
    expect(await pagesOf(who)).not.toContain(ids.pHeld)
  })

  test.each(family)('%s still reads a shared test, a homework paper and the Term 3 paper', async (who) => {
    expect(await papersOf(who)).toEqual(sorted(ids.pOpen!, ids.pHomework!, ids.pTerm3!))
    expect(await resultsOf(who)).toEqual(sorted(ids.qOpen!, ids.qHomework!, ids.qTerm3!))
    expect(await pagesOf(who)).toEqual([ids.pOpen])
  })

  test.each(family)('%s reads a gap with mixed evidence but not the held answer behind it', async (who) => {
    const gaps = await gapsOf(who)
    expect(gaps).toContain('Mixed evidence')
    expect(await resultsOf(who)).not.toContain(ids.qHeld2) // the held row of that gap
    expect(await resultsOf(who)).toContain(ids.qHomework) // the homework row of that gap
  })

  test.each(family)('%s reads no gap whose only evidence is the held test', async (who) => {
    expect(await gapsOf(who)).toEqual(['Homework evidence', 'Mixed evidence', 'No evidence', 'Shared evidence'])
  })

  test.each(family)('%s reads no activity line about the held test, and every other line', async (who) => {
    expect(await linesOf(who)).toEqual(['line:broken-id', 'line:homework', 'line:no-event', 'line:note', 'line:shared'])
  })

  test('the class teacher reads everything, held or not', async () => {
    expect(await papersOf('teacher')).toEqual(sorted(ids.pHeld!, ids.pThabo!, ids.pOpen!, ids.pHomework!, ids.pTerm3!))
    expect(await resultsOf('teacher')).toEqual(sorted(ids.qHeld1!, ids.qHeld2!, ids.qOpen!, ids.qHomework!, ids.qTerm3!, ids.qThabo!))
    expect(await gapsOf('teacher')).toEqual(['Homework evidence', 'Mixed evidence', 'No evidence', 'Only held evidence', 'Shared evidence', 'Thabo held evidence'])
    expect(await linesOf('teacher')).toEqual(['line:broken-id', 'line:held', 'line:homework', 'line:no-event', 'line:note', 'line:shared'])
    expect(await pagesOf('teacher')).toEqual(sorted(ids.pHeld!, ids.pOpen!))
  })

  test('the school-wide activity line (no child) stays as it was: the school branch of the policy is unchanged', async () => {
    const wide = async (who: string) => (await ok(users[who]!.client.from('activity_log').select('text').eq('text', 'line:school-wide'))).length
    expect(await wide('teacher')).toBe(1)
    expect(await wide('parent')).toBe(0) // a parent has no school on their profile
  })

  test('a parent whose link is pending, a parent of another child and another school read none of it', async () => {
    for (const who of ['pendingParent', 'otherTeacher'] as const) {
      expect(await papersOf(who)).toEqual([])
      expect(await resultsOf(who)).toEqual([])
      expect(await gapsOf(who)).toEqual([])
      expect(await linesOf(who)).toEqual([])
    }
    // Thabo's parent reads Thabo's rows only, and his paper is held too.
    expect(await papersOf('strangerParent')).toEqual([])
    expect(await resultsOf('strangerParent')).toEqual([])
    expect(await gapsOf('strangerParent')).toEqual([])
  })

  test('the family can still read the test row itself (its title and its held flag)', async () => {
    const rows = await ok(users.parent!.client.from('tests').select('id, title, held').eq('id', ids.held!))
    expect(rows).toEqual([{ id: ids.held, title: 'Held test', held: true }])
  })
})

describe('the helpers', () => {
  test('paper_shared is true for a paper with no test and for a shared test, false for a held test', async () => {
    const check = async (paper: string) => (await users.parent!.client.rpc('paper_shared', { p: paper })).data
    expect(await check(ids.pHeld!)).toBe(false)
    expect(await check(ids.pOpen!)).toBe(true)
    expect(await check(ids.pHomework!)).toBe(true)
  })

  test('event_shared is true for no event and an event that names no held paper, false for one that does', async () => {
    const { data: held } = await service.from('events').select('id').eq('school_id', ids.sA!).eq('payload->>paperId', ids.pHeld!)
    const check = async (ev: string | null) => (await users.parent!.client.rpc('event_shared', { ev })).data
    expect(await check(held![0]!.id)).toBe(false)
    expect(await check(null)).toBe(true)
  })

  test('the helpers cannot be called by someone who is signed out', async () => {
    const anon = createClient(url, anonKey, opts)
    const r = await anon.rpc('paper_shared', { p: ids.pHeld! })
    expect(r.error).not.toBeNull()
  })
})

describe('after the teacher shares', () => {
  beforeAll(async () => {
    await ok(service.from('tests').update({ held: false, shared_at: new Date().toISOString(), shared_by: users.teacher!.id }).eq('id', ids.held!).select('id'))
  })

  test.each(family)('%s reads the papers, answers, pages, gaps and activity lines of that test', async (who) => {
    expect(await papersOf(who)).toEqual(sorted(ids.pHeld!, ids.pOpen!, ids.pHomework!, ids.pTerm3!))
    expect(await resultsOf(who)).toEqual(sorted(ids.qHeld1!, ids.qHeld2!, ids.qOpen!, ids.qHomework!, ids.qTerm3!))
    expect(await pagesOf(who)).toEqual(sorted(ids.pHeld!, ids.pOpen!))
    expect(await gapsOf(who)).toEqual(['Homework evidence', 'Mixed evidence', 'No evidence', 'Only held evidence', 'Shared evidence'])
    expect(await linesOf(who)).toEqual(['line:broken-id', 'line:held', 'line:homework', 'line:no-event', 'line:note', 'line:shared'])
  })

  test('a parent whose link is pending still reads nothing', async () => {
    expect(await papersOf('pendingParent')).toEqual([])
    expect(await resultsOf('pendingParent')).toEqual([])
  })

  test('the parent of another learner still reads only their own child', async () => {
    expect(await papersOf('strangerParent')).toEqual([ids.pThabo])
    expect(await resultsOf('strangerParent')).toEqual([ids.qThabo])
  })
})
