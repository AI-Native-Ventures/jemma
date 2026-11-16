// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeAdmin, type FakeAdmin, type Row } from './p97-fake-db'

// P112: a learner who signed up alone joins their school class with the teacher's class code, and the teacher says yes. These tests cover the
// request (what is refused, that one request waits at a time), the card the learner sees, and the teacher's tap in both ways (an existing learner of
// the class, or a new one). The database is an in-memory stand-in that keeps its writes in order. No database, no browser, no agent, no model.

const state = vi.hoisted(() => ({ db: null as unknown as FakeAdmin }))
vi.spyOn(console, 'error').mockImplementation(() => undefined)

import { APPROVAL_NOT_SAVED } from '@/lib/approvals'
import { cleanJoinCode, decideJoin, joinCardFor, needsOfClass, requestToJoin } from '@/lib/class-join'

const LEARNER = 'learner-1'
const TEACHER = 'teacher-1'

const world = (over: Record<string, Row[]> = {}) => ({
  schools: [
    { id: 's1', name: 'Hillview Primary', kind: 'school' },
    { id: 'own1', name: "Zola's own", kind: 'private' },
  ],
  classes: [
    { id: 'c1', school_id: 's1', teacher_id: TEACHER, name: '6B Mathematics', grade: 6, join_code: 'ABC234' },
    { id: 'cp', school_id: 'own1', teacher_id: LEARNER, name: 'Grade 6 Mathematics', grade: 6, join_code: 'PRV234' },
  ],
  children: [
    { id: 'kid1', school_id: 's1', first_name: 'Amina', last_name: null, grade: 6, user_id: null, private_of: null },
    { id: 'kid2', school_id: 's1', first_name: 'Thabo', last_name: null, grade: 6, user_id: 'someone-else', private_of: null },
    { id: 'own-kid', school_id: 'own1', first_name: 'Zola', last_name: null, grade: 6, user_id: LEARNER, private_of: null },
  ],
  enrolments: [
    { class_id: 'c1', child_id: 'kid1' },
    { class_id: 'c1', child_id: 'kid2' },
  ],
  profiles: [
    { user_id: TEACHER, display_name: 'Ms Banda', school_id: 's1' },
    { user_id: LEARNER, display_name: 'Zola', school_id: 'own1' },
  ],
  class_join_requests: [] as Row[],
  needs_you_items: [] as Row[],
  approvals: [] as Row[],
  ...Object.fromEntries(Object.entries(over).map(([table, rows]) => [table, structuredClone(rows)])),
})

const open = (over: Record<string, Row[]> = {}) => {
  state.db = fakeAdmin(world(over))
  return state.db
}
const asLearner = (code: string) => requestToJoin(state.db as never, { userId: LEARNER, code })
const writes = () => state.db.calls
const row = (table: string, id: string) => state.db.tables[table]!.find((r) => r.id === id)!

const waiting = (over: Partial<Row> = {}): Row => ({ id: 'req1', class_id: 'c1', own_child_id: 'own-kid', requested_name: 'Zola', status: 'pending', ...over })
const decide = (decision: 'approved' | 'declined', choice?: { kind: 'existing'; childId: string } | { kind: 'new' }, over: { classId?: string } = {}) =>
  decideJoin(state.db as never, { classId: over.classId ?? 'c1', requestId: 'req1', teacherId: TEACHER, schoolId: 's1', decision, choice })

beforeEach(() => {
  open()
})

describe('the class code', () => {
  it('is read in any case with stray spaces', () => {
    expect(cleanJoinCode(' abc 234 ')).toBe('ABC234')
  })
})

describe('the learner asks to join', () => {
  it('writes one waiting request and one Needs you item for the class teacher, and says who will answer', async () => {
    const res = await asLearner('ABC234')
    expect(res).toMatchObject({ ok: true, teacherName: 'Ms Banda', className: '6B Mathematics' })
    expect(state.db.tables.class_join_requests).toEqual([expect.objectContaining({ class_id: 'c1', own_child_id: 'own-kid', requested_name: 'Zola', status: 'pending' })])
    const requestId = state.db.tables.class_join_requests![0]!.id
    expect(state.db.tables.needs_you_items).toEqual([
      expect.objectContaining({ owner_id: TEACHER, school_id: 's1', child_id: 'own-kid', kind: 'approve_join', ref_id: requestId, title: 'Zola wants to join 6B Mathematics' }),
    ])
  })

  it('takes a code typed in lower case with spaces', async () => {
    expect(await asLearner(' abc 234 ')).toMatchObject({ ok: true })
  })

  it.each(['', 'ABC', 'ZZZZZZ'])('refuses the code "%s" and writes nothing', async (code) => {
    const res = await asLearner(code)
    expect(res).toEqual({ ok: false, message: code.trim() ? 'No class has that code. Check it with your teacher.' : "Type your teacher's class code." })
    expect(writes()).toEqual([])
  })

  it('refuses the code of a personal class (a class of a private workspace is not a school class)', async () => {
    expect(await asLearner('PRV234')).toEqual({ ok: false, message: 'No class has that code. Check it with your teacher.' })
    expect(writes()).toEqual([])
  })

  it('refuses a second request while one is waiting, and says who is being waited for', async () => {
    expect(await asLearner('ABC234')).toMatchObject({ ok: true })
    const res = await asLearner('ABC234')
    expect(res).toEqual({ ok: false, message: 'You already asked. Waiting for Ms Banda to say yes.' })
    expect(state.db.tables.class_join_requests).toHaveLength(1)
    expect(state.db.tables.needs_you_items).toHaveLength(1)
  })

  it('refuses a learner who already has a school record', async () => {
    open({ children: [{ id: 'sk', school_id: 's1', first_name: 'Zola', grade: 6, user_id: LEARNER, private_of: null }] })
    expect(await asLearner('ABC234')).toEqual({ ok: false, message: 'You already have a school class.' })
    expect(writes()).toEqual([])
  })

  it('refuses a learner who already joined (the own record is a twin of a school record)', async () => {
    open({
      children: [
        { id: 'sk', school_id: 's1', first_name: 'Zola', grade: 6, user_id: LEARNER, private_of: null },
        { id: 'own-kid', school_id: 'own1', first_name: 'Zola', grade: 6, user_id: LEARNER, private_of: 'sk' },
      ],
    })
    expect(await asLearner('ABC234')).toEqual({ ok: false, message: 'You already have a school class.' })
    expect(writes()).toEqual([])
  })

  it('refuses a login that is not a learner on their own', async () => {
    const res = await requestToJoin(state.db as never, { userId: 'a-stranger', code: 'ABC234' })
    expect(res).toEqual({ ok: false, message: 'Only a learner who signed up on their own can join a class.' })
    expect(writes()).toEqual([])
  })

  it('may ask again after the teacher said no', async () => {
    open({ class_join_requests: [waiting({ status: 'declined' })] })
    expect(await asLearner('ABC234')).toMatchObject({ ok: true })
    expect(state.db.tables.class_join_requests).toHaveLength(2)
  })

  it('takes the request back when the teacher could not be told, and says so in plain words', async () => {
    state.db = fakeAdmin(world(), { writeError: (table, verb) => (table === 'needs_you_items' && verb === 'insert' ? 'down' : null) })
    expect(await asLearner('ABC234')).toEqual({ ok: false, message: 'Could not send the request. Try again.' })
    expect(state.db.tables.class_join_requests).toEqual([])
  })
})

describe('the card the learner sees', () => {
  it('is a form for a learner on their own', async () => {
    expect(await joinCardFor(state.db as never, LEARNER)).toEqual({ kind: 'form', declined: false })
  })

  it('says who the learner is waiting for', async () => {
    open({ class_join_requests: [waiting()] })
    expect(await joinCardFor(state.db as never, LEARNER)).toEqual({ kind: 'waiting', teacherName: 'Ms Banda', className: '6B Mathematics' })
  })

  it('is a form again, with a note, after a no', async () => {
    open({ class_join_requests: [waiting({ status: 'declined' })] })
    expect(await joinCardFor(state.db as never, LEARNER)).toEqual({ kind: 'form', declined: true })
  })

  it('is not there for a learner who has a school record, for a twin, or for anyone who is not a learner', async () => {
    open({ children: [{ id: 'sk', school_id: 's1', first_name: 'Zola', grade: 6, user_id: LEARNER, private_of: null }] })
    expect(await joinCardFor(state.db as never, LEARNER)).toEqual({ kind: 'hidden' })
    open({
      children: [
        { id: 'sk', school_id: 's1', first_name: 'Zola', grade: 6, user_id: LEARNER, private_of: null },
        { id: 'own-kid', school_id: 'own1', first_name: 'Zola', grade: 6, user_id: LEARNER, private_of: 'sk' },
      ],
    })
    expect(await joinCardFor(state.db as never, LEARNER)).toEqual({ kind: 'hidden' })
    expect(await joinCardFor(state.db as never, 'a-stranger')).toEqual({ kind: 'hidden' })
  })

  it('does not fail the page when the table is not there yet', async () => {
    state.db = fakeAdmin(world())
    const from = state.db.from
    state.db.from = ((table: string) => (table === 'class_join_requests' ? (() => { throw new Error('relation does not exist') })() : from(table))) as never
    expect(await joinCardFor(state.db as never, LEARNER)).toEqual({ kind: 'form', declined: false })
  })
})

describe('the teacher says yes to a new learner', () => {
  beforeEach(() => {
    open({ class_join_requests: [waiting()], needs_you_items: [{ id: 'n1', kind: 'approve_join', ref_id: 'req1', status: 'open' }] })
  })

  it('makes a school child of the class (first name, class grade, the learner login, enrolled) and turns the learner own record into its twin', async () => {
    expect(await decide('approved', { kind: 'new' })).toEqual({ ok: true })
    const made = state.db.tables.children!.find((c) => c.school_id === 's1' && c.user_id === LEARNER)!
    expect(made).toMatchObject({ first_name: 'Zola', grade: 6, user_id: LEARNER })
    expect(state.db.tables.enrolments).toContainEqual(expect.objectContaining({ class_id: 'c1', child_id: made.id }))
    expect(row('children', 'own-kid')).toMatchObject({ private_of: made.id, user_id: LEARNER, school_id: 'own1' })
    expect(row('class_join_requests', 'req1')).toMatchObject({ status: 'approved', decided_by: TEACHER })
    expect(row('needs_you_items', 'n1').status).toBe('done')
    expect(state.db.tables.approvals).toEqual([expect.objectContaining({ kind: 'class_join', decision: 'approved', school_id: 's1', child_id: 'own-kid', ref_id: 'req1', decided_by: TEACHER })])
  })

  it('saves the approval before any other write', async () => {
    await decide('approved', { kind: 'new' })
    expect(writes()[0]).toMatchObject({ table: 'approvals', verb: 'insert' })
  })
})

describe('the teacher says yes to a learner of the class who has no login yet', () => {
  beforeEach(() => {
    open({ class_join_requests: [waiting()], needs_you_items: [{ id: 'n1', kind: 'approve_join', ref_id: 'req1', status: 'open' }] })
  })

  it('gives that school child the learner login, makes no new child, and links the own record as its twin', async () => {
    expect(await decide('approved', { kind: 'existing', childId: 'kid1' })).toEqual({ ok: true })
    expect(row('children', 'kid1')).toMatchObject({ user_id: LEARNER, first_name: 'Amina' })
    expect(state.db.tables.children).toHaveLength(3)
    expect(state.db.tables.enrolments).toHaveLength(2)
    expect(row('children', 'own-kid')).toMatchObject({ private_of: 'kid1' })
    expect(row('class_join_requests', 'req1')).toMatchObject({ status: 'approved' })
    expect(row('needs_you_items', 'n1').status).toBe('done')
  })

  it('refuses a learner who already has a login: nothing is approved, nothing is written', async () => {
    expect(await decide('approved', { kind: 'existing', childId: 'kid2' })).toEqual({ ok: false, message: 'That learner already has a login. Pick someone else, or add a new learner.' })
    expect(writes()).toEqual([])
  })

  it('refuses a child who is not in this class', async () => {
    open({ class_join_requests: [waiting()], enrolments: [{ class_id: 'c1', child_id: 'kid2' }] })
    expect(await decide('approved', { kind: 'existing', childId: 'kid1' })).toEqual({ ok: false, message: 'That learner is not in this class.' })
    expect(writes()).toEqual([])
  })

  it('may be tapped again after a failure half way: the same learner is not given twice', async () => {
    state.db = fakeAdmin(world({ class_join_requests: [waiting()] }), { writeError: (table, verb) => (table === 'children' && verb === 'update' ? 'the pool is full' : null) })
    const first = await decide('approved', { kind: 'new' })
    expect(first).toEqual({ ok: false, message: 'Could not finish. Nothing was lost: try again.' })
    expect(state.db.tables.approvals).toEqual([])
    // the failure was the twin link, after the school child was made
    expect(state.db.tables.children!.filter((c) => c.school_id === 's1' && c.user_id === LEARNER)).toHaveLength(1)
    const again = fakeAdmin(state.db.tables)
    state.db = again
    expect(await decide('approved', { kind: 'new' })).toEqual({ ok: true })
    expect(state.db.tables.children!.filter((c) => c.school_id === 's1' && c.user_id === LEARNER)).toHaveLength(1)
    expect(state.db.tables.enrolments!.filter((e) => e.class_id === 'c1' && e.child_id !== 'kid1' && e.child_id !== 'kid2')).toHaveLength(1)
    expect(row('class_join_requests', 'req1').status).toBe('approved')
  })
})

describe('what is refused before anything is approved', () => {
  it('a yes with no choice of who the learner is', async () => {
    open({ class_join_requests: [waiting()] })
    expect(await decide('approved')).toEqual({ ok: false, message: 'Pick who this is first.' })
    expect(writes()).toEqual([])
  })

  it('a request that was already decided', async () => {
    open({ class_join_requests: [waiting({ status: 'approved' })] })
    expect(await decide('approved', { kind: 'new' })).toEqual({ ok: false, message: 'This request was already answered.' })
    expect(writes()).toEqual([])
  })

  it('a request of another class', async () => {
    open({ class_join_requests: [waiting({ class_id: 'other' })] })
    expect(await decide('approved', { kind: 'new' })).toEqual({ ok: false, message: 'This request was already answered.' })
    expect(writes()).toEqual([])
  })

  it('a learner who already has a school record by now', async () => {
    open({
      class_join_requests: [waiting()],
      children: [
        { id: 'sk', school_id: 's1', first_name: 'Zola', grade: 6, user_id: LEARNER, private_of: null },
        { id: 'own-kid', school_id: 'own1', first_name: 'Zola', grade: 6, user_id: LEARNER, private_of: 'sk' },
      ],
    })
    expect(await decide('approved', { kind: 'new' })).toEqual({ ok: false, message: 'This learner already has a school class.' })
    expect(writes()).toEqual([])
  })
})

describe('the teacher says no', () => {
  it('closes the request and the Needs you item, changes no child, and saves the approval', async () => {
    open({ class_join_requests: [waiting()], needs_you_items: [{ id: 'n1', kind: 'approve_join', ref_id: 'req1', status: 'open' }] })
    expect(await decide('declined')).toEqual({ ok: true })
    expect(row('class_join_requests', 'req1')).toMatchObject({ status: 'declined', decided_by: TEACHER })
    expect(row('needs_you_items', 'n1').status).toBe('done')
    expect(state.db.tables.children).toHaveLength(3)
    expect(row('children', 'own-kid').private_of).toBeNull()
    expect(state.db.tables.approvals).toEqual([expect.objectContaining({ kind: 'class_join', decision: 'declined', child_id: 'own-kid' })])
    expect(writes().some((c) => c.table === 'children')).toBe(false)
  })
})

describe('the approval is saved first and goes with its step', () => {
  it('when it cannot be saved nothing else is written and the teacher reads the one plain line', async () => {
    state.db = fakeAdmin(world({ class_join_requests: [waiting()] }), { writeError: (table, verb) => (table === 'approvals' && verb === 'insert' ? 'approvals are down' : null) })
    expect(await decide('approved', { kind: 'new' })).toEqual({ ok: false, message: APPROVAL_NOT_SAVED })
    expect(writes().filter((c) => c.table !== 'approvals')).toEqual([])
  })

  it('when the step fails the approval row is taken back', async () => {
    state.db = fakeAdmin(world({ class_join_requests: [waiting()] }), { writeError: (table, verb) => (table === 'children' && verb === 'insert' ? 'the pool is full' : null) })
    const res = await decide('approved', { kind: 'new' })
    expect(res.ok).toBe(false)
    expect(state.db.tables.approvals).toEqual([])
    expect(row('class_join_requests', 'req1').status).toBe('pending')
  })

  it('two taps at once: one wins, the other takes its approval back', async () => {
    open({ class_join_requests: [waiting()] })
    const results = await Promise.all([decide('approved', { kind: 'new' }), decide('approved', { kind: 'new' })])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(state.db.tables.approvals).toHaveLength(1)
    expect(state.db.tables.children!.filter((c) => c.school_id === 's1' && c.user_id === LEARNER)).toHaveLength(1)
  })
})

describe('which Needs you items belong to a class', () => {
  const items = [
    { child_id: 'kid1', kind: 'check_answer', ref_id: 'p1' },
    { child_id: null, kind: 'desktop_off', ref_id: 'd' },
    { child_id: 'own-kid', kind: 'approve_join', ref_id: 'req1' },
    { child_id: 'own-kid', kind: 'approve_join', ref_id: 'req-other-class' },
    { child_id: 'stranger', kind: 'check_answer', ref_id: 'p2' },
  ]

  it('keeps a join item only in the class the request is for, and the other items as before', () => {
    expect(needsOfClass(items, ['kid1', 'kid2'], new Set(['req1'])).map((n) => n.ref_id)).toEqual(['p1', 'd', 'req1'])
  })

  it('shows no join item when the class has no waiting request', () => {
    expect(needsOfClass(items, ['kid1'], new Set()).map((n) => n.ref_id)).toEqual(['p1', 'd'])
  })
})
