import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeDb, type FakeDb } from './p89-fake-db'

// Every loader that draws a short topic label gives `loadShortLabels` the classes it already knows for the caller: the class on the screen for
// a teacher, the learner's own classes for a learner or a parent. Fake clients and a spy on the label loader: no database, no server.

let db: FakeDb
let admin: FakeDb
const { shortSpy } = vi.hoisted(() => ({ shortSpy: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServer: async () => db }))
vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdmin: () => admin }))
vi.mock('@/lib/data/p50b', () => ({ getShareCard: async () => null }))
vi.mock('@/lib/topics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/topics')>()),
  loadShortLabels: (client: unknown, scope?: { classIds: string[] }) => shortSpy(client, scope),
}))

import { getClassHome } from '@/lib/data/p18'
import { getLearnerView, getLearnersView } from '@/lib/data/p19'
import { getQuestionDetail, getTestDetail, getTestsList } from '@/lib/data/p20'
import { getProfile, getReport } from '@/lib/data/p23'
import { loadLearn, loadSessionResult } from '@/lib/data/p25'
import { getLearnerToday } from '@/lib/data/p27'

const LONG = 'Adding fractions with different denominators'
const KID = '5b6c7d8e-0000-4000-8000-000000000001'
const CLASS = 'c1000000-0000-4000-8000-000000000001'
const OTHER_CLASS = 'c2000000-0000-4000-8000-000000000002'

const enrolments = [
  { class_id: CLASS, child_id: KID },
  { class_id: OTHER_CLASS, child_id: KID },
]

beforeEach(() => {
  shortSpy.mockReset()
  shortSpy.mockImplementation(async () => (name: string) => `short:${name}`)
  admin = fakeDb()
})

/** What the label loader was asked, for the one call a loader makes. */
const labelCalls = () => shortSpy.mock.calls.map(([client, scope]) => ({ client, scope }))

describe('the learner home (p27)', () => {
  beforeEach(() => {
    db = fakeDb(
      {
        children: [{ id: KID, user_id: 'u1', first_name: 'Amina', parent_first_name: null, parent_relation: null }],
        enrolments,
        sessions: [{ id: 's1', child_id: KID, status: 'planned', planned_for: '2999-01-01', lesson_id: null, topic_name: LONG, format: 'reading', planned_minutes: 10 }],
        gaps: [],
      },
      { userId: 'u1' },
    )
    // A practice that is being written: the home does not read "My maths", so no model, no orchestrator.
    admin = fakeDb({ events: [{ id: 'e1', type: 'practice.requested', status: 'queued', 'payload->>childId': KID }] })
  })

  it("asks for the labels of the learner's own classes, once, and never for every topic", async () => {
    const home = await getLearnerToday()
    expect(labelCalls()).toEqual([{ client: db, scope: { classIds: [CLASS, OTHER_CLASS] } }])
    expect(db.reads('enrolments')).toHaveLength(1)
    expect(db.reads('enrolments')[0]!.ops).toContainEqual(['eq', 'child_id', KID])
    expect(home.next?.topic).toBe(`short:${LONG}`)
  })

  it('a learner in no class asks with no class, and gets names as they are', async () => {
    db = fakeDb(
      {
        children: [{ id: KID, user_id: 'u1', first_name: 'Amina', parent_first_name: null, parent_relation: null }],
        enrolments: [],
        sessions: [],
        gaps: [],
      },
      { userId: 'u1' },
    )
    await getLearnerToday()
    expect(labelCalls()).toEqual([{ client: db, scope: { classIds: [] } }])
  })
})

describe('the teacher class screen (p18)', () => {
  it('asks for the labels of the class on the screen', async () => {
    db = fakeDb({ classes: [{ id: CLASS, name: 'Grade 4A' }], enrolments: [{ class_id: CLASS, child_id: KID }], children: [{ id: KID, first_name: 'Amina', created_at: '2026-01-01' }] })
    const home = await getClassHome(CLASS)
    expect(home).not.toBeNull()
    expect(labelCalls()).toEqual([{ client: db, scope: { classIds: [CLASS] } }])
  })
})

describe('the teacher learner screens (p19)', () => {
  beforeEach(() => {
    db = fakeDb({
      classes: [{ id: CLASS, name: 'Grade 4A', join_code: 'ABCD' }],
      enrolments: [{ class_id: CLASS, child_id: KID, children: { id: KID, first_name: 'Amina', grade: 4, parent_first_name: null, parent_relation: null } }],
      tests: [],
    })
  })

  it('the learners list asks for the labels of the class', async () => {
    await getLearnersView(CLASS).catch(() => null)
    expect(labelCalls()).toEqual([{ client: db, scope: { classIds: [CLASS] } }])
  })

  it('one learner asks for the labels of the class', async () => {
    await getLearnerView(CLASS, KID).catch(() => null)
    expect(labelCalls()).toEqual([{ client: db, scope: { classIds: [CLASS] } }])
  })
})

describe('the teacher test screens (p20)', () => {
  beforeEach(() => {
    db = fakeDb({
      classes: [{ id: CLASS, name: 'Grade 4A' }],
      tests: [{ id: 't1', class_id: CLASS, title: 'Class Test 1: Fractions', written_on: '2026-05-01', out_of: 10, created_at: '2026-05-01' }],
      papers: [],
    })
  })

  it('the tests list asks for the labels of the class', async () => {
    await getTestsList(CLASS)
    expect(labelCalls().length).toBeGreaterThan(0)
    for (const call of labelCalls()) expect(call).toEqual({ client: db, scope: { classIds: [CLASS] } })
  })

  it('one test asks for the labels of the class', async () => {
    await getTestDetail(CLASS, 't1')
    expect(labelCalls().length).toBeGreaterThan(0)
    for (const call of labelCalls()) expect(call).toEqual({ client: db, scope: { classIds: [CLASS] } })
  })

  it('one question asks for the labels of the class', async () => {
    await getQuestionDetail(CLASS, 't1', 1).catch(() => null)
    expect(labelCalls()).toEqual([{ client: db, scope: { classIds: [CLASS] } }])
  })
})

describe("the parent's screens (p23)", () => {
  beforeEach(() => {
    db = fakeDb({ enrolments })
  })

  it('the profile asks for the labels of the classes the child is in', async () => {
    await getProfile(KID)
    expect(labelCalls()).toEqual([{ client: db, scope: { classIds: [CLASS, OTHER_CLASS] } }])
    expect(db.reads('enrolments')[0]!.ops).toContainEqual(['eq', 'child_id', KID])
  })

  it('the report asks for the labels of the classes the child is in', async () => {
    await getReport(KID)
    expect(labelCalls()).toEqual([{ client: db, scope: { classIds: [CLASS, OTHER_CLASS] } }])
  })
})

describe("the parent's learn screens (p25)", () => {
  it("the week asks for the labels of the child's classes, once", async () => {
    db = fakeDb({ enrolments, sessions: [], children: [{ id: KID, first_name: 'Amina' }], format_trials: [] })
    await loadLearn(KID).catch(() => null)
    expect(labelCalls()).toEqual([{ client: db, scope: { classIds: [CLASS, OTHER_CLASS] } }])
  })

  it("a finished session asks for the labels of the child's classes, once, and no screen of the week asks again", async () => {
    db = fakeDb({
      enrolments,
      children: [{ id: KID, first_name: 'Amina' }],
      sessions: [
        { id: 's1', child_id: KID, status: 'done', right: 3, minutes: 9, finished_at: '2026-11-01T17:00:00Z', format: 'reading', topic_id: null, topic_name: LONG, planned_for: '2026-11-01', children: { first_name: 'Amina' } },
        { id: 's2', child_id: KID, status: 'planned', planned_for: '2026-11-08', topic_id: null, topic_name: LONG, format: 'reading', planned_minutes: 10, question_count: 5, lesson_id: null },
      ],
      session_items: [],
      gaps: [],
    })
    const result = await loadSessionResult(KID, 's1')
    expect(result?.shortName).toBe(`short:${LONG}`)
    expect(labelCalls()).toEqual([{ client: db, scope: { classIds: [CLASS, OTHER_CLASS] } }])
  })
})
