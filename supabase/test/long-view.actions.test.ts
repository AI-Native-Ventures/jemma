import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { MemoryStore } from '../../packages/profiling/src/ai'
import { createServiceClient, type JemmaDb } from '../../packages/profiling/src/db'
import { loadHistory } from '../../packages/profiling/src/tools/read/get-learner-history'
import { decidePattern, requestIfEmpty, type Decision } from '../../apps/web/lib/long-view'
import { loadLongView, loadSharedLongView } from '../../apps/web/lib/data/p52'

// The teacher's decisions on a pattern (approve, set aside, bring back, "we have talked") and who may read what afterwards.
// Real rows on jemma-dev, in a small school made for this file. Nobody is called live: no model, no agent.

const url = process.env.SUPABASE_URL!
const anonKey = process.env.SUPABASE_ANON_KEY!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const service = createServiceClient({ SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: serviceKey })
const PASSWORD = 'lv-act-Passw0rd!'
const tag = `lva${Date.now()}`

type Actor = { id: string; client: JemmaDb; name: string }
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
  users[key] = { id: data.user.id, client, name }
  return data.user.id
}

let n = 0
/** A pattern in the given state for the child. Each one has its own family, so the unique key never clashes. */
async function pattern(child: string, status: string, over: Record<string, unknown> = {}): Promise<string> {
  const family = `fam_${++n}`
  const [row] = await ok(
    service
      .from('long_view_patterns')
      .insert({
        child_id: child,
        kind: 'struggle',
        family,
        title: `Title ${family}`,
        statement: 'Marks stayed low from Grade 5 Term 3 to Grade 6 Term 1.',
        terms: [{ grade: 5, year: 2025, term: 3, percent: 40, points: 20 }],
        evidence: [{ kind: 'record', id: 'x', label: 'Quiz 1, Mrs Naidoo, 10 Feb 2025' }],
        status,
        ...over,
      })
      .select('id'),
  )
  return row!.id
}

const row = async (id: string) => (await ok(service.from('long_view_patterns').select('*').eq('id', id).single()))!
const approvalsOf = async (refId: string) => ok(service.from('approvals').select('*').eq('ref_id', refId).order('created_at'))
const notesOf = async (userId: string) => ok(service.from('notifications').select('title, body, href').eq('user_id', userId))
const teacherDeps = (key = 'teacher') => ({ teacher: users[key]!.client, admin: service, userId: users[key]!.id })
const decide = (d: Decision, id: string, key = 'teacher') => decidePattern(teacherDeps(key), d, id)

beforeAll(async () => {
  const [sA] = await ok(service.from('schools').insert({ name: `${tag} School A`, country: 'ZA' }).select('id'))
  const [sB] = await ok(service.from('schools').insert({ name: `${tag} School B`, country: 'ZA' }).select('id'))
  schoolIds.push(sA!.id, sB!.id)
  const tA = await mkUser('teacher', 'teacher', sA!.id, 'Ms Banda')
  const tB = await mkUser('otherTeacher', 'teacher', sB!.id, 'Mr Other')
  await mkUser('parent', 'parent', null, 'Thandi M')
  await mkUser('pendingParent', 'parent', null, 'Pending P')
  const kid = await mkUser('learner', 'learner', sA!.id, 'Amina')
  const [cA] = await ok(service.from('classes').insert({ school_id: sA!.id, teacher_id: tA, name: '6B Mathematics', grade: 6, year: 2026, subject: 'Mathematics', join_code: `${tag}A` }).select('id'))
  const [cB] = await ok(service.from('classes').insert({ school_id: sB!.id, teacher_id: tB, name: '6C Mathematics', grade: 6, year: 2026, subject: 'Mathematics', join_code: `${tag}B` }).select('id'))
  const [a1] = await ok(service.from('children').insert({ school_id: sA!.id, first_name: 'Amina', grade: 6, user_id: kid, parent_first_name: 'Thandi' }).select('id'))
  // A second learner: only a pending link, so nobody can be talked to yet.
  const [a2] = await ok(service.from('children').insert({ school_id: sA!.id, first_name: 'Sipho', grade: 6 }).select('id'))
  const [a3] = await ok(service.from('children').insert({ school_id: sA!.id, first_name: 'Lerato', grade: 6 }).select('id'))
  const [b1] = await ok(service.from('children').insert({ school_id: sB!.id, first_name: 'Bongi', grade: 6 }).select('id'))
  Object.assign(ids, { sA: sA!.id, sB: sB!.id, cA: cA!.id, cB: cB!.id, a1: a1!.id, a2: a2!.id, a3: a3!.id, b1: b1!.id, tA })
  await ok(service.from('enrolments').insert([{ class_id: cA!.id, child_id: a1!.id }, { class_id: cA!.id, child_id: a2!.id }, { class_id: cA!.id, child_id: a3!.id }, { class_id: cB!.id, child_id: b1!.id }]))
  const consent = { guardian: true, teach: true, improve: false }
  await ok(
    service.from('parent_links').insert([
      { parent_id: users.parent!.id, child_id: a1!.id, class_id: cA!.id, status: 'approved', consent },
      { parent_id: users.pendingParent!.id, child_id: a1!.id, class_id: cA!.id, status: 'pending', consent },
      { parent_id: users.pendingParent!.id, child_id: a2!.id, class_id: cA!.id, status: 'pending', consent },
    ]),
  )
})

afterAll(async () => {
  if (schoolIds.length) await service.from('schools').delete().in('id', schoolIds)
  for (const u of Object.values(users)) await service.auth.admin.deleteUser(u.id)
})

describe('approve', () => {
  test('a draft becomes approved, with who and when, and the approval is saved with the teacher name', async () => {
    const id = await pattern(ids.a1!, 'draft')
    const before = Date.now()
    const r = await decide('approve', id)
    expect(r).toEqual({ ok: true, status: 'approved', childId: ids.a1 })
    const p = await row(id)
    expect(p.status).toBe('approved')
    expect(p.approved_by).toBe(users.teacher!.id)
    expect(p.approved_by_name).toBe('Ms Banda')
    expect(Date.parse(p.approved_at!)).toBeGreaterThanOrEqual(before - 5000)
    expect(p.discussed_at).toBeNull()
    const approvals = await approvalsOf(id)
    expect(approvals).toHaveLength(1)
    expect(approvals[0]).toMatchObject({ kind: 'long_view_pattern', decision: 'approved', decided_by: users.teacher!.id, decided_by_name: 'Ms Banda', child_id: ids.a1, school_id: ids.sA })
  })

  test.each(['approved', 'dismissed', 'discussed'])('is refused for a pattern that is %s, and nothing changes', async (status) => {
    const id = await pattern(ids.a1!, status)
    const r = await decide('approve', id)
    expect(r.ok).toBe(false)
    expect((await row(id)).status).toBe(status)
    expect(await approvalsOf(id)).toHaveLength(0)
  })

  test('is refused for a pattern the records no longer show', async () => {
    const id = await pattern(ids.a1!, 'draft', { active: false })
    expect((await decide('approve', id)).ok).toBe(false)
    expect((await row(id)).status).toBe('draft')
  })
})

describe('set aside', () => {
  test.each(['draft', 'approved'])('a %s pattern is set aside, with who and when, and the decision is saved as declined', async (status) => {
    const id = await pattern(ids.a1!, status)
    const r = await decide('dismiss', id)
    expect(r).toMatchObject({ ok: true, status: 'dismissed' })
    const p = await row(id)
    expect(p.status).toBe('dismissed')
    expect(p.dismissed_by).toBe(users.teacher!.id)
    expect(p.dismissed_at).not.toBeNull()
    const approvals = await approvalsOf(id)
    expect(approvals).toHaveLength(1)
    expect(approvals[0]).toMatchObject({ kind: 'long_view_pattern', decision: 'declined', decided_by_name: 'Ms Banda' })
  })

  test('a pattern that was shared cannot be set aside', async () => {
    const id = await pattern(ids.a1!, 'discussed', { discussed_by: users.teacher!.id, discussed_by_name: 'Ms Banda', discussed_at: new Date().toISOString() })
    const r = await decide('dismiss', id)
    expect(r.ok).toBe(false)
    expect((await row(id)).status).toBe('discussed')
    expect(await approvalsOf(id)).toHaveLength(0)
  })

  test('an already dismissed pattern is refused', async () => {
    const id = await pattern(ids.a1!, 'dismissed')
    expect((await decide('dismiss', id)).ok).toBe(false)
  })
})

describe('bring back', () => {
  test('a dismissed pattern goes back to a draft and the old decision is cleared', async () => {
    const id = await pattern(ids.a1!, 'approved')
    await decide('dismiss', id)
    const r = await decide('restore', id)
    expect(r).toMatchObject({ ok: true, status: 'draft' })
    const p = await row(id)
    expect(p.status).toBe('draft')
    expect(p.dismissed_by).toBeNull()
    expect(p.dismissed_at).toBeNull()
    expect(p.approved_by).toBeNull()
    expect(p.approved_at).toBeNull()
  })

  test.each(['draft', 'approved', 'discussed'])('is refused for a pattern that is %s', async (status) => {
    const id = await pattern(ids.a1!, status)
    expect((await decide('restore', id)).ok).toBe(false)
    expect((await row(id)).status).toBe(status)
  })
})

describe('"We have talked"', () => {
  test('only an approved pattern can be shared', async () => {
    for (const status of ['draft', 'dismissed', 'discussed']) {
      const id = await pattern(ids.a1!, status)
      expect((await decide('discuss', id)).ok, status).toBe(false)
      expect((await row(id)).status).toBe(status)
    }
    expect(await notesOf(users.parent!.id)).toEqual([])
  })

  test('is refused when no approved parent link exists, and nobody is told', async () => {
    const id = await pattern(ids.a2!, 'approved')
    const r = await decide('discuss', id)
    expect(r.ok).toBe(false)
    expect((await row(id)).status).toBe('approved')
    expect(await approvalsOf(id)).toHaveLength(0)
    expect(await notesOf(users.pendingParent!.id)).toEqual([])
  })

  test('shares the pattern, stores who and when, saves the approval with the name and tells the approved parent only', async () => {
    const id = await pattern(ids.a1!, 'draft')
    await decide('approve', id)
    expect(await notesOf(users.parent!.id)).toEqual([])
    const before = Date.now()
    const r = await decide('discuss', id)
    expect(r).toEqual({ ok: true, status: 'discussed', childId: ids.a1 })
    const p = await row(id)
    expect(p.status).toBe('discussed')
    expect(p.discussed_by).toBe(users.teacher!.id)
    expect(p.discussed_by_name).toBe('Ms Banda')
    expect(Date.parse(p.discussed_at!)).toBeGreaterThanOrEqual(before - 5000)
    const approvals = await approvalsOf(id)
    expect(approvals.map((a) => [a.kind, a.decision, a.decided_by_name])).toEqual([
      ['long_view_pattern', 'approved', 'Ms Banda'],
      ['long_view_talk', 'confirmed', 'Ms Banda'],
    ])
    expect(await notesOf(users.parent!.id)).toEqual([
      { title: 'Ms Banda shared something from your talk', body: "Open Amina's Long view.", href: `/p/${ids.a1}/long-view` },
    ])
    expect(await notesOf(users.pendingParent!.id)).toEqual([])
    expect(await notesOf(users.teacher!.id)).toEqual([])
    expect(await notesOf(users.learner!.id)).toEqual([])
  })

  test('is refused a second time and does not tell the parent twice', async () => {
    const id = await pattern(ids.a1!, 'approved')
    const first = (await notesOf(users.parent!.id)).length
    expect((await decide('discuss', id)).ok).toBe(true)
    expect((await decide('discuss', id)).ok).toBe(false)
    expect((await notesOf(users.parent!.id)).length).toBe(first + 1)
  })
})

describe('only the class teacher decides', () => {
  test("another school's teacher cannot see the pattern, so nothing happens", async () => {
    const id = await pattern(ids.a1!, 'draft')
    const r = await decide('approve', id, 'otherTeacher')
    expect(r.ok).toBe(false)
    expect((await row(id)).status).toBe('draft')
    expect(await approvalsOf(id)).toHaveLength(0)
  })

  test('a parent who can read a shared pattern still cannot decide on it', async () => {
    const id = await pattern(ids.a1!, 'discussed', { discussed_by: users.teacher!.id, discussed_by_name: 'Ms Banda', discussed_at: new Date().toISOString() })
    for (const d of ['approve', 'dismiss', 'restore', 'discuss'] as const) expect((await decide(d, id, 'parent')).ok, d).toBe(false)
    expect((await row(id)).status).toBe('discussed')
    expect(await approvalsOf(id)).toHaveLength(0)
  })

  test('the learner cannot decide either', async () => {
    const id = await pattern(ids.a1!, 'draft')
    expect((await decide('approve', id, 'learner')).ok).toBe(false)
    expect((await row(id)).status).toBe('draft')
  })

  test('an id that is not a pattern is refused', async () => {
    expect((await decide('approve', '00000000-0000-4000-8000-000000000000')).ok).toBe(false)
    expect((await decide('approve', 'not-a-uuid')).ok).toBe(false)
  })
})

describe('the Needs you item', () => {
  const item = async () => ok(service.from('needs_you_items').select('id, status').eq('kind', 'review_long_view').eq('ref_id', ids.a2!))

  test('closes when the last draft is decided, and not before', async () => {
    await ok(service.from('needs_you_items').insert({ owner_id: ids.tA, school_id: ids.sA, child_id: ids.a2, kind: 'review_long_view', ref_id: ids.a2, title: "Look at Sipho's Long view", detail: '2 patterns to check before anything is shared.' }))
    const one = await pattern(ids.a2!, 'draft')
    const two = await pattern(ids.a2!, 'draft')
    await decide('approve', one)
    expect((await item()).map((i) => i.status)).toEqual(['open'])
    await decide('dismiss', two)
    expect((await item()).map((i) => i.status)).toEqual(['done'])
  })

  test('bringing a pattern back does not close it, and does not open it again either', async () => {
    const back = await pattern(ids.a2!, 'dismissed')
    await decide('restore', back)
    expect((await item()).map((i) => i.status)).toEqual(['done'])
  })
})

describe('opening the screen', () => {
  const sent: string[] = []
  const deps = (key = 'teacher') => ({ teacher: users[key]!.client, admin: service, send: async (_type: string, payload: { childId: string }) => { sent.push(payload.childId); return 'event' } })
  const open = (childId: string, key = 'teacher') => requestIfEmpty(deps(key) as never, childId)

  test('asks for an update when the learner has no pattern and no update in the last 10 minutes', async () => {
    expect(await open(ids.a3!)).toBe('sent')
    expect(sent).toEqual([ids.a3])
  })

  test('does not ask when an update was asked for in the last 10 minutes, whatever came of it', async () => {
    await ok(service.from('events').insert({ school_id: ids.sA, type: 'long_view.requested', payload: { type: 'long_view.requested', childId: ids.a3 }, status: 'failed', error: 'x' }))
    sent.length = 0
    expect(await open(ids.a3!)).toBe('skipped')
    expect(sent).toEqual([])
  })

  test('asks again when the last update is older than 10 minutes', async () => {
    await service.from('events').update({ created_at: new Date(Date.now() - 11 * 60_000).toISOString() }).eq('type', 'long_view.requested').eq('payload->>childId', ids.a3!)
    expect(await open(ids.a3!)).toBe('sent')
  })

  test('does not ask when the learner already has a pattern row, in any state', async () => {
    sent.length = 0
    await pattern(ids.a3!, 'dismissed')
    expect(await open(ids.a3!)).toBe('skipped')
    expect(sent).toEqual([])
  })

  test('does nothing for a person who does not teach the learner', async () => {
    sent.length = 0
    expect(await open(ids.a2!, 'otherTeacher')).toBe('refused')
    expect(await open(ids.a1!, 'parent')).toBe('refused')
    expect(sent).toEqual([])
  })
})

describe('who reads what', () => {
  const mine = (key: string, child = ids.a1!) => ok(users[key]!.client.from('long_view_patterns').select('id, status').eq('child_id', child))

  test('before "We have talked" the parent reads zero patterns and has nothing to open; after it, exactly that one', async () => {
    const child = ids.b1! // a learner of its own, so the counts are exact
    const kid = await mkUser('learnerB', 'learner', ids.sB!, 'Bongi')
    await ok(service.from('children').update({ user_id: kid }).eq('id', child))
    const parentB = await mkUser('parentB', 'parent', null, 'Naledi M')
    await ok(service.from('parent_links').insert({ parent_id: parentB, child_id: child, class_id: ids.cB!, status: 'approved', consent: { guardian: true, teach: true, improve: false } }))
    const draft = await pattern(child, 'draft')
    const approved = await pattern(child, 'approved')
    const target = await pattern(child, 'approved', { title: 'The one we talked about' })

    expect(await mine('parentB', child)).toEqual([])
    expect(await loadSharedLongView(users.parentB!.client, child)).toBeNull()
    expect(await mine('learnerB', child)).toEqual([])

    expect((await decidePattern({ teacher: users.otherTeacher!.client, admin: service, userId: users.otherTeacher!.id }, 'discuss', target)).ok).toBe(true)

    expect((await mine('parentB', child)).map((p) => p.id)).toEqual([target])
    const shared = await loadSharedLongView(users.parentB!.client, child)
    expect(shared).toMatchObject({ childName: 'Bongi', teacherName: 'Mr Other' })
    expect(shared!.patterns.map((p) => p.id)).toEqual([target])
    expect(shared!.patterns[0]).toMatchObject({ title: 'The one we talked about', labels: ['Quiz 1, Mrs Naidoo, 10 Feb 2025'] })
    expect(shared!.patterns[0]!.sharedOn).toMatch(/^\d{1,2} [A-Z][a-z]{2} \d{4}$/)
    expect([draft, approved]).not.toContain(shared!.patterns[0]!.id)

    expect(await mine('learnerB', child)).toEqual([])
    expect(await ok(users.learnerB!.client.from('long_view_patterns').select('id'))).toEqual([])
  })

  test('raw records are never readable by a parent or a learner', async () => {
    await ok(
      service.from('learner_records').insert({
        school_id: ids.sA, child_id: ids.a1, source: 'quiz', grade: 5, year: 2025, term: 3, happened_on: '2025-08-12', logged_at: '2025-08-13T10:00:00Z', teacher_name: 'Mrs Naidoo', title: 'Quiz 1', family: 'fractions', marks: 8, out_of: 20,
      }),
    )
    for (const key of ['parent', 'pendingParent', 'learner']) {
      expect(await ok(users[key]!.client.from('learner_records').select('id').eq('child_id', ids.a1!)), key).toEqual([])
    }
    expect((await ok(users.teacher!.client.from('learner_records').select('id').eq('child_id', ids.a1!))).length).toBeGreaterThan(0)
  })

  test('the parent data leaves out a shared pattern the records no longer show', async () => {
    const child = ids.b1!
    const gone = await pattern(child, 'discussed', { active: false, discussed_by_name: 'Mr Other', discussed_at: new Date().toISOString() })
    const rows = await mine('parentB', child)
    expect(rows.map((r) => r.id)).toContain(gone) // the row policy does not check `active`
    const shared = await loadSharedLongView(users.parentB!.client, child)
    expect(shared!.patterns.map((p) => p.id)).not.toContain(gone)
  })

  test('the teacher reads every pattern and a parent screen is not for a teacher', async () => {
    expect((await mine('teacher')).length).toBeGreaterThan(3)
    expect(await loadSharedLongView(users.teacher!.client, ids.a1!)).toBeNull()
  })
})

describe('the grid is the tool grid', () => {
  test('the screen builds the same table as get_learner_history, so the two never disagree', async () => {
    const rec = (term: number, grade: number, year: number, family: string, marks: number, title: string) => ({
      school_id: ids.sA, child_id: ids.a2, source: 'quiz', grade, year, term, happened_on: `${year}-${String(term * 3 - 1).padStart(2, '0')}-10`, logged_at: `${year}-${String(term * 3 - 1).padStart(2, '0')}-11T10:00:00Z`, teacher_name: 'Mrs Naidoo', title, family, marks, out_of: 20,
    })
    await ok(
      service.from('learner_records').insert([
        rec(1, 5, 2025, 'fractions', 6, 'Quiz 1'),
        rec(2, 5, 2025, 'fractions', 5, 'Quiz 2'),
        rec(3, 5, 2025, 'fractions', 4, 'Quiz 3'),
        rec(3, 5, 2025, 'shapes', 18, 'Quiz 4'),
        rec(4, 5, 2025, 'shapes', 16, 'Quiz 5'),
      ]),
    )
    // Two subjects: three terms of English reading as well. The screen shows one subject at a time, the tool groups by subject: they must agree for each.
    await ok(
      service.from('learner_records').insert(
        [1, 2, 3].map((term) => ({ ...rec(term, 6, 2026, 'reading', 7, `Reading ${term}`), subject: 'English', teacher_name: 'Mrs Zulu' })),
      ),
    )
    const ctx = { db: service, schoolId: ids.sA!, eventId: null, env: { replayStore: new MemoryStore() }, now: () => new Date() }
    const { history } = await loadHistory(ctx as never, ids.a2!)
    expect(history.subjects.map((x) => x.subject)).toEqual(['Mathematics', 'English'])
    for (const subject of ['Mathematics', 'English']) {
      const view = await loadLongView(users.teacher!.client, ids.cA!, ids.a2!, new Date(), subject)
      expect(view).not.toBeNull()
      expect(view!.subject).toBe(subject)
      const fromScreen = view!.rows.map((r) => ({ family: r.family, cells: r.cells.flatMap((c, i) => (c.percent === null ? [] : [{ year: view!.columns[i]!.year, term: view!.columns[i]!.term, percent: c.percent, points: c.points }])) }))
      const mine = history.subjects.find((x) => x.subject === subject)!
      const fromTool = mine.families.map((f) => ({ family: f.family, cells: f.bySlot.map(({ year, term, percent, points }) => ({ year, term, percent, points })) }))
      expect(fromScreen.sort((a, b) => a.family.localeCompare(b.family))).toEqual(fromTool.sort((a, b) => a.family.localeCompare(b.family)))
      expect(view!.missing.length > 0).toBe(mine.missingTerms.length > 0)
      expect(view!.columns.map((c) => [c.year, c.term])).toEqual(mine.slots.concat(mine.missingTerms.map((m) => ({ grade: m.grade ?? 0, year: m.year, term: m.term }))).sort((x, y) => x.year - y.year || x.term - y.term).map((x) => [x.year, x.term]))
    }
  })

  test('a person who is not the class teacher gets no screen', async () => {
    expect(await loadLongView(users.otherTeacher!.client, ids.cA!, ids.a2!)).toBeNull()
    expect(await loadLongView(users.teacher!.client, ids.cB!, ids.a2!)).toBeNull()
  })
})
