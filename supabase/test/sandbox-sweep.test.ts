import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { createServiceClient, type JemmaDb } from '../../packages/profiling/src/db'
import { createSandbox, deleteSandbox, sweepOldSandboxes, type Sandbox, type SandboxKind } from '../seed/demo'

// The sweep of old demo sandboxes on real rows: my own sandboxes, made here and backdated here.
//
// This runs on a database other people share (judges' copies, the owner's own class, other workers' sandboxes), so no call
// below can reach anything but my own rows: every sweep passes `onlySandboxIds` (the ids made in this file) and the real `now`.
// The sweep's own cutoff is 7 days, so even a call without the filter would only match what I backdated, but none is made without it.

const url = process.env.SUPABASE_URL!
const anonKey = process.env.SUPABASE_ANON_KEY!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const admin: JemmaDb = createServiceClient({ SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: serviceKey })

const DAY = 24 * 60 * 60_000
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString()

type Logins = { teacher: { userId: string; email: string; password: string } } & Record<string, unknown>
type Made = Sandbox & { userIds: string[]; logins: Logins }

/** Every user id in a sandbox's logins: Ms Banda, the other teachers, the four parents and Amina (a Hillview copy has eight), or the one teacher of an empty school. */
function userIdsOf(value: unknown): string[] {
  if (!value || typeof value !== 'object') return []
  const v = value as Record<string, unknown>
  return typeof v.userId === 'string' ? [v.userId] : Object.values(v).flatMap(userIdsOf)
}

const made: Made[] = []
const extraSchools: string[] = []

async function make(stage: 'start' | 'marked', ageDays: number, kind: SandboxKind = 'hillview'): Promise<Made> {
  const s = await createSandbox(admin, { stage, kind })
  const row = await admin.from('demo_sandboxes').select('logins').eq('id', s.sandboxId).single()
  const logins = row.data!.logins as unknown as Logins
  const m = { ...s, logins, userIds: userIdsOf(logins) }
  made.push(m)
  const aged = await admin.from('demo_sandboxes').update({ created_at: ago(ageDays) }).eq('id', s.sandboxId).select('id')
  expect(aged.data).toHaveLength(1)
  // The seed writes lines of the activity log when the copy is made (a made-up class starts with its CAPS map, and the line says so). They are
  // as old as the copy: a copy that looks `ageDays` old has lines that look the same age, or it would count as in use.
  const lines = await admin.from('activity_log').update({ created_at: ago(ageDays), at: ago(ageDays) }).eq('school_id', s.schoolId).select('id')
  expect(lines.error).toBeNull()
  return m
}

const sandboxRow = async (id: string) => (await admin.from('demo_sandboxes').select('id').eq('id', id)).data ?? []
const schoolRow = async (id: string) => (await admin.from('schools').select('id').eq('id', id)).data ?? []
const userExists = async (id: string) => {
  const r = await admin.auth.admin.getUserById(id)
  return !r.error && !!r.data.user
}
const filesOf = async (schoolId: string) => (await admin.storage.from('papers').list(schoolId, { limit: 100 })).data ?? []
const mine = () => made.map((m) => m.sandboxId)

let idleWithFiles: Made
let signedIn: Made
let active: Made
let young: Made
let idle1: Made
let idle2: Made
let idle3: Made
let plainSchool: string
let emptyOld: Made

beforeAll(async () => {
  // A copy that has files (papers and curriculum) and log lines, made to look 40 days old and unused.
  idleWithFiles = await make('marked', 40)
  const lines = await admin.from('activity_log').update({ created_at: ago(40), at: ago(40) }).eq('school_id', idleWithFiles.schoolId).select('id')
  expect(lines.data!.length).toBeGreaterThan(0)

  signedIn = await make('start', 40)
  const client = createClient(url, anonKey, opts)
  const login = await client.auth.signInWithPassword({ email: signedIn.logins.teacher.email, password: signedIn.logins.teacher.password })
  expect(login.error).toBeNull()

  active = await make('start', 40)
  const logged = await admin.from('activity_log').insert({ school_id: active.schoolId, text: 'A teacher used it today', tool: 'mark_paper' }).select('id')
  expect(logged.error).toBeNull()

  young = await make('start', 1)
  idle1 = await make('start', 30)
  idle2 = await make('start', 20)
  idle3 = await make('start', 10)
  emptyOld = await make('start', 35, 'empty')

  // A school that has no sandbox row at all, and is "old".
  const school = await admin.from('schools').insert({ name: 'sweep test school without a sandbox', country: 'ZA', created_at: ago(90) }).select('id').single()
  plainSchool = school.data!.id
  extraSchools.push(plainSchool)
}, 600_000)

afterAll(async () => {
  for (const m of made) await deleteSandbox(admin, m.sandboxId).catch(() => undefined)
  if (extraSchools.length) await admin.from('schools').delete().in('id', extraSchools)
}, 300_000)

describe('sweepOldSandboxes on real rows', () => {
  test('the starting point is what the cases say: my sandboxes are old, nobody signed in except where I made it so', async () => {
    const idleUser = await admin.auth.admin.getUserById(idle1.logins.teacher.userId)
    expect(idleUser.data.user?.last_sign_in_at ?? null).toBeNull()
    const seen = await admin.auth.admin.getUserById(signedIn.logins.teacher.userId)
    expect(Date.parse(seen.data.user!.last_sign_in_at!)).toBeGreaterThan(Date.now() - DAY)
  })

  test('keeps an old copy with a recent sign-in, an old copy with a recent log line, and a young copy', async () => {
    const kept = [signedIn, active, young]
    const removed = await sweepOldSandboxes(admin, { onlySandboxIds: kept.map((m) => m.sandboxId) })
    expect(removed).toEqual([])
    for (const m of kept) {
      expect(await sandboxRow(m.sandboxId)).toHaveLength(1)
      expect(await schoolRow(m.schoolId)).toHaveLength(1)
      for (const id of m.userIds) expect(await userExists(id)).toBe(true)
    }
  })

  test('removes an old copy nobody used, with its school, its eight users and its files', async () => {
    expect((await filesOf(idleWithFiles.schoolId)).length).toBeGreaterThan(0) // there is something to remove
    const removed = await sweepOldSandboxes(admin, { onlySandboxIds: [idleWithFiles.sandboxId] })
    expect(removed).toEqual([idleWithFiles.sandboxId])
    expect(await sandboxRow(idleWithFiles.sandboxId)).toEqual([])
    expect(await schoolRow(idleWithFiles.schoolId)).toEqual([])
    for (const id of idleWithFiles.userIds) expect(await userExists(id)).toBe(false)
    expect(await filesOf(idleWithFiles.schoolId)).toEqual([])
  })

  test('a copy has eight users (three teachers, four parents, Amina) and an empty school has one', () => {
    expect(idleWithFiles.userIds).toHaveLength(8)
    expect(emptyOld.userIds).toHaveLength(1)
    expect(emptyOld.kind).toBe('empty')
  })

  test('removes an old empty school nobody used, with its teacher', async () => {
    expect(await schoolRow(emptyOld.schoolId)).toHaveLength(1)
    const removed = await sweepOldSandboxes(admin, { onlySandboxIds: [emptyOld.sandboxId] })
    expect(removed).toEqual([emptyOld.sandboxId])
    expect(await sandboxRow(emptyOld.sandboxId)).toEqual([])
    expect(await schoolRow(emptyOld.schoolId)).toEqual([])
    for (const id of emptyOld.userIds) expect(await userExists(id)).toBe(false)
  })

  test('a learner login made after the sandbox was is removed with it', async () => {
    // Hillview copies made by this file are removed in the tests above and below; make one more, give a learner a login by hand, age it, sweep it.
    const extra = await make('start', 50)
    const kid = await admin.from('children').select('id').eq('school_id', extra.schoolId).eq('first_name', 'Thabo').single()
    const user = await admin.auth.admin.createUser({ email: `late-${extra.sandboxId.slice(0, 8)}@kids.jemma.invalid`, password: 'not-a-real-pin-0000', email_confirm: true })
    expect(user.error).toBeNull()
    const lateId = user.data.user!.id
    await admin.from('profiles').insert({ user_id: lateId, role: 'learner', display_name: 'Thabo', school_id: extra.schoolId })
    await admin.from('children').update({ user_id: lateId }).eq('id', kid.data!.id)
    // The user is not in the sandbox row's logins: the school knows it.
    expect(extra.userIds).not.toContain(lateId)
    const removed = await sweepOldSandboxes(admin, { onlySandboxIds: [extra.sandboxId] })
    expect(removed).toEqual([extra.sandboxId])
    expect(await userExists(lateId)).toBe(false)
  })

  test('removes at most `limit` per call, oldest first, and the next call takes the rest', async () => {
    const ids = [idle3, idle1, idle2].map((m) => m.sandboxId) // in no particular order
    const first = await sweepOldSandboxes(admin, { onlySandboxIds: ids, limit: 2 })
    expect(first).toEqual([idle1.sandboxId, idle2.sandboxId]) // 30 and 20 days old
    expect(await sandboxRow(idle3.sandboxId)).toHaveLength(1)
    expect(await schoolRow(idle3.schoolId)).toHaveLength(1)
    const second = await sweepOldSandboxes(admin, { onlySandboxIds: ids, limit: 2 })
    expect(second).toEqual([idle3.sandboxId])
    expect(await sandboxRow(idle3.sandboxId)).toEqual([])
  })

  test('a school without a sandbox row is never touched, even when its id is handed to the sweep', async () => {
    expect(await sweepOldSandboxes(admin, { onlySandboxIds: [plainSchool] })).toEqual([])
    expect(await schoolRow(plainSchool)).toHaveLength(1)
    // And after all the removals above it is still there, with the sandboxes that were kept.
    expect(await schoolRow(plainSchool)).toHaveLength(1)
    for (const m of [signedIn, active, young]) expect(await schoolRow(m.schoolId)).toHaveLength(1)
  })

  test('the sweep never sees a sandbox that is not in the list it was given', async () => {
    // idle1 to idle3 and the first copy are gone; nothing of mine that is old and idle is left, so even the whole list removes nothing.
    expect(await sweepOldSandboxes(admin, { onlySandboxIds: mine() })).toEqual([])
    for (const m of [signedIn, active, young]) expect(await sandboxRow(m.sandboxId)).toHaveLength(1)
  })
})
