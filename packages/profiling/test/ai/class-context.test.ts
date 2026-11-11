import { afterAll, beforeAll, expect, test, vi } from 'vitest'
import { classContext, classIdFor, classIdOfRef, isBaselineClass } from '../../src/ai/subject-profile'
import { createServiceClient, type JemmaDb } from '../../src/db'
import { addClass, addTeacher, type ExtraClass } from '../helpers/classes'
import { loadEnv } from '../helpers/env'
import { createSandbox, type Sandbox } from '../helpers/sandbox'

// Which class a job works for, from what it was given. Runs against the shared test database, in its own made-up schools.

vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 })
const env = loadEnv()
const db: JemmaDb = createServiceClient({ SUPABASE_URL: env.SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY! })
const tag = `cx${Date.now()}`
let s: Sandbox
let b: ExtraClass
let secondTeacher: string
let homeworkAmina: string
let homeworkThabo: string
let sessionInB: string
let eventForB: string
let eventForChildOnly: string
let eventForA: string

const event = async (type: string, payload: Record<string, string>) =>
  (await db.from('events').insert({ school_id: s.schoolId, type, payload: { type, ...payload }, status: 'running' } as never).select('id').single()).data!.id

beforeAll(async () => {
  s = await createSandbox(db, tag)
  secondTeacher = await addTeacher(db, s, tag)
  b = await addClass(db, s, { tag: `${tag}b`, name: '9A Natural Sciences', subject: 'Natural Sciences', grade: 9, topics: ['Photosynthesis', 'Cells'], family: 'life_living', teacherId: secondTeacher })
  // Homework: a paper of a learner with no test.
  homeworkAmina = (await db.from('papers').insert({ child_id: s.aminaId, owner: 'parent', kind: 'homework', status: 'marked' }).select('id').single()).data!.id
  homeworkThabo = (await db.from('papers').insert({ child_id: s.thaboId, owner: 'parent', kind: 'homework', status: 'marked' }).select('id').single()).data!.id
  sessionInB = (
    await db.from('sessions').insert({ child_id: s.aminaId, status: 'planned', planned_for: '2026-10-28', warmup: [], topic_id: b.topicIds[0]!, topic_name: 'Photosynthesis', format: 'reading' }).select('id').single()
  ).data!.id
  eventForB = await event('key.snapped', { testId: b.testId })
  eventForA = await event('paper.checked', { paperId: s.paperId })
  eventForChildOnly = await event('observation.added', { childId: s.aminaId })
})
afterAll(async () => {
  await s?.cleanup()
  if (secondTeacher) await db.auth.admin.deleteUser(secondTeacher)
})

test('the sandbox class (Maths, Grade 6, ZA) is the baseline, found from its class, map, test, paper and learner', async () => {
  const refs = [{ classId: s.classId }, { mapId: s.mapId }, { testId: s.testId }, { paperId: s.paperId }, { childId: s.thaboId }]
  for (const ref of refs) {
    const c = await classContext(db, ref)
    expect(c, JSON.stringify(ref)).toMatchObject({ classId: s.classId, subject: 'Maths', subjectKey: 'mathematics', grade: 6, country: 'ZA', countryName: 'South Africa' })
    expect(isBaselineClass(c)).toBe(true)
  }
})

test('a Natural Sciences Grade 9 class is not the baseline, found from its class, map, test and paper', async () => {
  for (const ref of [{ classId: b.classId }, { mapId: b.mapId }, { testId: b.testId }, { paperId: b.paperId }]) {
    const c = await classContext(db, ref)
    expect(c, JSON.stringify(ref)).toMatchObject({ classId: b.classId, subject: 'Natural Sciences', subjectKey: 'natural_sciences', grade: 9 })
    expect(isBaselineClass(c)).toBe(false)
  }
})

test('the country is the school country: Kenya when the school is in Kenya', async () => {
  await db.from('schools').update({ country: 'KE' }).eq('id', s.schoolId)
  try {
    expect(await classContext(db, { classId: b.classId })).toMatchObject({ country: 'KE', countryName: 'Kenya' })
    expect(isBaselineClass(await classContext(db, { classId: s.classId }))).toBe(false) // Maths Grade 6, but in Kenya
  } finally {
    await db.from('schools').update({ country: 'ZA' }).eq('id', s.schoolId)
  }
})

test('a learner in two classes is not placed by the learner alone: no class is better than the wrong one', async () => {
  expect(await classIdFor(db, { childId: s.aminaId })).toBeNull()
  expect(await classContext(db, { childId: s.aminaId })).toBeNull()
})

test('a learner in two classes is placed by the session topic, or by the event, when the learner is in that class', async () => {
  expect(await classIdFor(db, { childId: s.aminaId, sessionId: sessionInB })).toBe(b.classId)
  expect(await classIdFor(db, { childId: s.aminaId, eventId: eventForB })).toBe(b.classId)
  expect(await classIdFor(db, { childId: s.aminaId, eventId: eventForA })).toBe(s.classId)
  // an event about the learner alone names no class
  expect(await classIdFor(db, { childId: s.aminaId, eventId: eventForChildOnly })).toBeNull()
  // the session wins over the event
  expect(await classIdFor(db, { childId: s.aminaId, sessionId: sessionInB, eventId: eventForA })).toBe(b.classId)
})

test('a class the learner is not in is not used: Thabo is only in the Maths class', async () => {
  expect(await classIdFor(db, { childId: s.thaboId, eventId: eventForB })).toBe(s.classId)
  expect(await classIdFor(db, { childId: s.thaboId, sessionId: sessionInB })).toBe(s.classId)
})

test('homework has no test: a learner in one class is placed, a learner in two is not', async () => {
  expect(await classIdFor(db, { paperId: homeworkThabo })).toBe(s.classId)
  expect(await classIdFor(db, { paperId: homeworkAmina })).toBeNull()
  expect(await classIdFor(db, { paperId: homeworkAmina, eventId: eventForB })).toBe(b.classId)
})

test('an event is placed by what its payload names, and an event about a learner alone is not', async () => {
  expect(await classIdFor(db, { eventId: eventForB })).toBe(b.classId)
  expect(await classIdFor(db, { eventId: eventForA })).toBe(s.classId)
  expect(await classIdFor(db, { eventId: eventForChildOnly })).toBeNull()
  expect(await classIdFor(db, { eventId: 'not-an-id' })).toBeNull()
})

test('the id on a Needs you item is placed whether it is a paper, a test, a map, a class, an event or a session', async () => {
  expect(await classIdOfRef(db, b.paperId)).toBe(b.classId)
  expect(await classIdOfRef(db, b.testId)).toBe(b.classId)
  expect(await classIdOfRef(db, b.mapId)).toBe(b.classId)
  expect(await classIdOfRef(db, b.classId)).toBe(b.classId)
  expect(await classIdOfRef(db, eventForB)).toBe(b.classId)
  expect(await classIdOfRef(db, sessionInB)).toBe(b.classId)
  expect(await classIdOfRef(db, s.paperId)).toBe(s.classId)
  expect(await classIdOfRef(db, '00000000-0000-4000-8000-000000000000')).toBeNull()
  expect(await classIdOfRef(db, null)).toBeNull()
  expect(await classIdOfRef(db, 'nope')).toBeNull()
})
