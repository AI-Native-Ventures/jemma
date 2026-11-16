import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AMINA_LESSON } from '../../../supabase/seed/fixtures/marked-state'
import { fakeDb, type FakeDb } from './p89-fake-db'

// P120: where the hand-back goes and what a learner can read again. The real loaders run over a fake client (rows kept in memory, every query recorded):
// no database, no browser, no server. The cookie, the router and the demo sign-in are stand-ins.

const state = vi.hoisted(() => ({
  cookies: {} as Record<string, string>,
  demoSandbox: null as string | null,
  signedInAs: [] as unknown[],
}))

vi.mock('next/headers', () => ({ cookies: async () => ({ get: (name: string) => (state.cookies[name] ? { name, value: state.cookies[name] } : undefined) }) }))
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`)
  },
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
let db: FakeDb
let admin: FakeDb
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServer: async () => db }))
vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdmin: () => admin }))
vi.mock('@/lib/demo', () => ({
  demoCookie: async () => state.demoSandbox,
  signInAsPerson: async (sandboxId: string, person: unknown) => {
    state.signedInAs.push([sandboxId, person])
    return '/p'
  },
}))

import { handBackToDemoParent } from '../app/k/done/actions'
import { getHandbackNext, getPastPractice, getPastResult } from '../lib/data/p120'
import { HANDOVER_COOKIE, signHandover } from '../lib/handover'

const KID = '5b6c7d8e-0000-4000-8000-000000000001'
const OTHER_KID = '5b6c7d8e-0000-4000-8000-000000000002'
const SCHOOL = 'aaaaaaaa-0000-4000-8000-000000000001'
const DEMO_SCHOOL = 'aaaaaaaa-0000-4000-8000-0000000000d1'
const SESSION = 's-new'
const Q = AMINA_LESSON.questions[0]!

const kidRow = (over: Record<string, unknown> = {}) => ({
  id: KID,
  user_id: 'login-kid',
  school_id: SCHOOL,
  first_name: 'Amina',
  parent_first_name: null,
  parent_relation: null,
  grade: 6,
  private_of: null,
  schools: { name: 'Hillview', kind: 'school' },
  ...over,
})

const session = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  child_id: KID,
  status: 'done',
  topic_name: 'Algebraic expressions',
  finished_at: '2026-11-16T10:20:00.000+00:00',
  planned_for: '2026-11-16',
  right: 4,
  question_count: 5,
  ...over,
})

beforeEach(() => {
  state.cookies = {}
  state.demoSandbox = null
  state.signedInAs = []
  process.env.CHILD_PIN_PEPPER = 'test-pepper'
  admin = fakeDb()
})

describe('what "Your practice" lists', () => {
  it("is this learner's finished practices only, newest first, with their counts", async () => {
    db = fakeDb(
      {
        children: [kidRow()],
        sessions: [
          session('old', { finished_at: '2026-11-10T09:00:00.000+00:00', topic_name: 'Fractions', right: 2 }),
          session(SESSION),
          session('planned', { status: 'planned', finished_at: null }),
          session('in-progress', { status: 'in_progress', finished_at: null }),
          session('someone-else', { child_id: OTHER_KID }),
        ],
      },
      { userId: 'login-kid' },
    )
    const rows = await getPastPractice()
    expect(rows.map((r) => r.sessionId)).toEqual([SESSION, 'old'])
    expect(rows.map((r) => r.score)).toEqual(['4 of 5 right', '2 of 5 right'])
    const read = db.reads('sessions')[0]!
    expect(read.ops).toContainEqual(['eq', 'child_id', KID])
    expect(read.ops).toContainEqual(['eq', 'status', 'done'])
  })

  it('lists nothing, and does not fail the page, when the read does not work', async () => {
    db = fakeDb({}, {}) // signed out: the learner cannot be found
    await expect(getPastPractice()).resolves.toEqual([])
  })
})

describe('reading one finished practice again', () => {
  // Five questions: the first was missed, the other four were right (the session row says 4 right).
  const items = [1, 2, 3, 4, 5].map((position) => ({
    session_id: SESSION,
    phase: 'try',
    position,
    question: Q,
    answer: position === 1 ? 'zzz' : Q.answer,
    correct: position !== 1,
    difficulty: 2,
    seconds: 20,
  }))

  beforeEach(() => {
    db = fakeDb({ children: [kidRow()], sessions: [session(SESSION), session('theirs', { child_id: OTHER_KID }), session('open', { status: 'in_progress' })] }, { userId: 'login-kid' })
    admin = fakeDb({ session_items: items })
  })

  it('gives the missed question with what was written and the right answer, and the count', async () => {
    const r = await getPastResult(SESSION)
    expect(r).toMatchObject({ firstName: 'Amina', topic: 'Algebraic expressions', day: 'Mon 16 Nov', score: '4 of 5 right', hasAnswers: true })
    expect(r.missed).toHaveLength(1)
    expect(r.missed[0]).toMatchObject({ n: 1, wrote: 'zzz', right: Q.answer, why: Q.why, rightWay: Q.rightWay })
  })

  it("does not open another learner's practice", async () => {
    await expect(getPastResult('theirs')).rejects.toThrow('NEXT_NOT_FOUND')
    expect(admin.reads('session_items')).toHaveLength(0)
  })

  it('does not open a practice that is not finished: its right answers are not for the screen yet', async () => {
    await expect(getPastResult('open')).rejects.toThrow('NEXT_NOT_FOUND')
    expect(admin.reads('session_items')).toHaveLength(0)
  })

  it('does not open a practice that is not there', async () => {
    await expect(getPastResult('nope')).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('says there are no saved answers when none were saved (it does not say there is nothing to go over)', async () => {
    admin = fakeDb({ session_items: [] })
    const r = await getPastResult(SESSION)
    expect(r.hasAnswers).toBe(false)
    expect(r.missed).toEqual([])
  })
})

describe('where "Press and hold" goes', () => {
  const box = { id: 'sb1', school_id: DEMO_SCHOOL, kind: 'hillview' }

  it('a learner with a code login, in no demo, has nobody to hand the phone to: home', async () => {
    db = fakeDb({ children: [kidRow()], sessions: [session(SESSION)] }, { userId: 'login-kid' })
    const next = await getHandbackNext()
    expect(next.target).toEqual({ kind: 'home', href: '/k' })
    expect(next.seeAnswersHref).toBe(`/k/session/${SESSION}/results?from=done`)
  })

  it('a learner who has finished nothing has no answers to see', async () => {
    db = fakeDb({ children: [kidRow()], sessions: [] }, { userId: 'login-kid' })
    expect((await getHandbackNext()).seeAnswersHref).toBeNull()
  })

  it('a grown-up who handed the phone over (signed in as a parent, with the hand-over cookie) opens their own page for the practice', async () => {
    state.cookies[HANDOVER_COOKIE] = await signHandover(SESSION, KID)
    db = fakeDb({ children: [kidRow({ user_id: null })], sessions: [session(SESSION)], profiles: [{ user_id: 'login-parent', role: 'parent' }] }, { userId: 'login-parent' })
    const next = await getHandbackNext()
    expect(next.target).toEqual({ kind: 'open', href: `/p/${KID}/sessions/${SESSION}` })
  })

  it('a made-up learner of the visitor\'s own demo copy, with a made-up grown-up, switches to the grown-up', async () => {
    state.demoSandbox = 'sb1'
    db = fakeDb({ children: [kidRow({ school_id: DEMO_SCHOOL })], sessions: [session(SESSION)] }, { userId: 'login-kid' })
    admin = fakeDb({ demo_sandboxes: [box] })
    const next = await getHandbackNext()
    expect(next.target).toEqual({ kind: 'demo-parent', href: `/p/${KID}/sessions/${SESSION}` })
  })

  it('a real learner who still has the demo cookie of an earlier visit goes home: their school is not the demo school', async () => {
    state.demoSandbox = 'sb1'
    db = fakeDb({ children: [kidRow({ school_id: SCHOOL })], sessions: [session(SESSION)] }, { userId: 'login-kid' })
    admin = fakeDb({ demo_sandboxes: [box] })
    expect((await getHandbackNext()).target).toEqual({ kind: 'home', href: '/k' })
  })

  it('a made-up learner who has no made-up grown-up goes home', async () => {
    state.demoSandbox = 'sb1'
    db = fakeDb({ children: [kidRow({ school_id: DEMO_SCHOOL, first_name: 'Nobody' })], sessions: [session(SESSION)] }, { userId: 'login-kid' })
    admin = fakeDb({ demo_sandboxes: [box] })
    expect((await getHandbackNext()).target).toEqual({ kind: 'home', href: '/k' })
  })

  it('an empty demo school has no made-up grown-up either', async () => {
    state.demoSandbox = 'sb1'
    db = fakeDb({ children: [kidRow({ school_id: DEMO_SCHOOL })], sessions: [session(SESSION)] }, { userId: 'login-kid' })
    admin = fakeDb({ demo_sandboxes: [{ ...box, kind: 'empty' }] })
    expect((await getHandbackNext()).target).toEqual({ kind: 'home', href: '/k' })
  })
})

describe('the hold in a demo copy (the server action)', () => {
  const box = { id: 'sb1', school_id: DEMO_SCHOOL, kind: 'hillview' }

  it("signs in as the learner's made-up grown-up and opens that grown-up's page for the practice", async () => {
    state.demoSandbox = 'sb1'
    db = fakeDb({ children: [kidRow({ school_id: DEMO_SCHOOL })], sessions: [session(SESSION)] }, { userId: 'login-kid' })
    admin = fakeDb({ demo_sandboxes: [box] })
    await expect(handBackToDemoParent()).rejects.toThrow(`REDIRECT /p/${KID}/sessions/${SESSION}`)
    expect(state.signedInAs).toEqual([['sb1', { kind: 'parent', key: 'thandi' }]])
  })

  it('outside a demo copy it signs nobody in and goes to the learner\'s own home', async () => {
    db = fakeDb({ children: [kidRow()], sessions: [session(SESSION)] }, { userId: 'login-kid' })
    await expect(handBackToDemoParent()).rejects.toThrow('REDIRECT /k')
    expect(state.signedInAs).toEqual([])
  })

  it('with a demo cookie but a learner of another school it signs nobody in', async () => {
    state.demoSandbox = 'sb1'
    db = fakeDb({ children: [kidRow({ school_id: SCHOOL })], sessions: [session(SESSION)] }, { userId: 'login-kid' })
    admin = fakeDb({ demo_sandboxes: [box] })
    await expect(handBackToDemoParent()).rejects.toThrow('REDIRECT /k')
    expect(state.signedInAs).toEqual([])
  })
})
