import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest'
import { MemoryStore } from '../src/ai'
import { createServiceClient, type JemmaDb } from '../src/db'
import { announceNeedsYou, ownerOf } from '../src/orchestrator'
import { isWithImages, type ToolContext } from '../src/tools/context'
import { defaultAuthor } from '../src/tools/save/people'
import { planNextSession, type SessionPlan } from '../src/tools/save/plan-next-session'
import { loadDiagnoseInputs, updateLearnerProfile } from '../src/tools/save/update-learner-profile'
import { addClass, addTeacher, type ExtraClass } from './helpers/classes'
import { loadEnv } from './helpers/env'
import { createSandbox, type Sandbox } from './helpers/sandbox'

// A learner can be in more than one class. Each tool that used to take "the child's one class" (`enrolments ... limit(1)`) now uses
// the class the work belongs to. For a learner in exactly one class every result is what it was: Thabo is in one class here, Amina
// in two (Maths, and Natural Sciences with another teacher).

vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 })
const env = loadEnv()
const db: JemmaDb = createServiceClient({ SUPABASE_URL: env.SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY! })
const tag = `oc${Date.now()}`
const TOPIC = 'Adding fractions with different denominators'
let s: Sandbox
let b: ExtraClass
let teacherB: string
let eventA: string
let eventB: string
let eventNone: string
let homeworkAmina: string
let homeworkThabo: string

const NOW = new Date('2026-10-26T10:00:00Z')
const ctx = (eventId: string | null): ToolContext => ({ db, schoolId: s.schoolId, eventId, env: { replayStore: new MemoryStore() }, now: () => NOW })
const event = async (type: string, payload: Record<string, string>) =>
  (await db.from('events').insert({ school_id: s.schoolId, type, payload: { type, ...payload }, status: 'running' } as never).select('id').single()).data!.id

async function plan(eventId: string | null, childId: string): Promise<SessionPlan> {
  const out = await planNextSession.run(ctx(eventId), { childId })
  if (isWithImages(out)) throw new Error('unexpected images')
  return out
}
async function resetPlans() {
  for (const childId of [s.aminaId, s.thaboId]) {
    await db.from('sessions').delete().eq('child_id', childId)
    await db.from('lessons').delete().eq('child_id', childId)
    await db.from('gaps').delete().eq('child_id', childId)
  }
}

beforeAll(async () => {
  s = await createSandbox(db, tag)
  teacherB = await addTeacher(db, s, tag)
  b = await addClass(db, s, { tag: `${tag}b`, name: '9A Natural Sciences', subject: 'Natural Sciences', grade: 9, topics: ['Photosynthesis', 'Cells'], family: 'life_living', teacherId: teacherB })
  eventA = await event('paper.checked', { paperId: s.paperId })
  eventB = await event('paper.checked', { paperId: b.paperId })
  eventNone = await event('observation.added', { childId: s.aminaId })
  homeworkAmina = (await db.from('papers').insert({ child_id: s.aminaId, owner: 'parent', kind: 'homework', status: 'marked' }).select('id').single()).data!.id
  homeworkThabo = (await db.from('papers').insert({ child_id: s.thaboId, owner: 'parent', kind: 'homework', status: 'marked' }).select('id').single()).data!.id
})
afterAll(async () => {
  await s?.cleanup()
  if (teacherB) await db.auth.admin.deleteUser(teacherB)
})
beforeEach(resetPlans)

// ---- update_learner_profile: the topics are those of the class of the work ---------------------------------------------------

test('diagnose: a learner in one class gets that class topic list, for a test and for homework (as before)', async () => {
  const test1 = await loadDiagnoseInputs(ctx(null), { childId: s.thaboId, testId: s.testId })
  expect(test1.topicNames).toEqual([TOPIC])
  const homework = await loadDiagnoseInputs(ctx(null), { childId: s.thaboId, paperId: homeworkThabo })
  expect(homework.topicNames).toEqual([TOPIC])
})

test('diagnose: a learner in two classes gets the topics of the class of the test', async () => {
  const inA = await loadDiagnoseInputs(ctx(null), { childId: s.aminaId, testId: s.testId })
  expect(inA.topicNames).toEqual([TOPIC])
  const inB = await loadDiagnoseInputs(ctx(null), { childId: s.aminaId, testId: b.testId })
  expect(inB.topicNames).toEqual(['Photosynthesis', 'Cells'])
  expect(inB.wrong).toHaveLength(1)
  expect(inB.wrong[0]).toMatchObject({ resultId: b.resultId, topicName: 'Photosynthesis', labels: ['Mistake in Photosynthesis'] })
})

test('diagnose: a teacher paper given by its id belongs to the class of its test, not to the first class of the learner', async () => {
  const out = await loadDiagnoseInputs(ctx(null), { childId: s.aminaId, paperId: b.paperId })
  expect(out.topicNames).toEqual(['Photosynthesis', 'Cells'])
})

test('diagnose: homework has no class, so a learner in two classes gets the topics of both, the older class first', async () => {
  const out = await loadDiagnoseInputs(ctx(null), { childId: s.aminaId, paperId: homeworkAmina })
  expect(out.topicNames).toEqual([TOPIC, 'Photosynthesis', 'Cells'])
})

test('diagnose: saving the diagnosis of a class B test opens the gap on a class B topic and logs it under class B', async () => {
  const saved = await updateLearnerProfile.run(ctx(eventB), {
    childId: s.aminaId,
    testId: b.testId,
    diagnoses: [{ resultId: b.resultId, misconception: 'Mistake in Photosynthesis', gapTopicName: 'Photosynthesis', missingBasic: null }],
  })
  expect(saved).toEqual({ gapsOpened: 1, gapsMoved: 0 })
  const gap = (await db.from('gaps').select('topic_id, topic_name').eq('child_id', s.aminaId)).data!
  expect(gap).toEqual([{ topic_id: b.topicIds[0], topic_name: 'Photosynthesis' }])
  const label = (await db.from('question_results').select('misconception').eq('id', b.resultId).single()).data!.misconception
  expect(label).toBe('Mistake in Photosynthesis') // a label of class B's topic, found among class B's labels
  const log = (await db.from('activity_log').select('class_id, tool').eq('child_id', s.aminaId).eq('tool', 'update_learner_profile')).data!
  expect(log).toEqual([{ class_id: b.classId, tool: 'update_learner_profile' }])
})

// ---- people: the teacher of the class of the work ---------------------------------------------------------------------------

test('default author: a learner in one class is attributed to the teacher of that class (as before)', async () => {
  expect(await defaultAuthor(ctx(null), s.thaboId, 'teacher')).toBe(s.teacherId)
  expect(await defaultAuthor(ctx(eventB), s.thaboId, 'teacher')).toBe(s.teacherId) // an event of a class he is not in changes nothing
})

test('default author: a learner in two classes is attributed to the teacher of the class of the event, or of the class asked for', async () => {
  expect(await defaultAuthor(ctx(eventB), s.aminaId, 'teacher')).toBe(teacherB)
  expect(await defaultAuthor(ctx(eventA), s.aminaId, 'teacher')).toBe(s.teacherId)
  expect(await defaultAuthor(ctx(null), s.aminaId, 'teacher', b.classId)).toBe(teacherB)
  expect(await defaultAuthor(ctx(eventB), s.aminaId, 'teacher', s.classId)).toBe(s.teacherId) // the class asked for wins
})

test('default author: with no class to go by, the oldest class of the learner, as before', async () => {
  expect(await defaultAuthor(ctx(null), s.aminaId, 'teacher')).toBe(s.teacherId)
  expect(await defaultAuthor(ctx(eventNone), s.aminaId, 'teacher')).toBe(s.teacherId)
})

// ---- plan_next_session: the gaps and the map of the class whose event started the planning -----------------------------------

async function openGaps() {
  await db.from('gaps').insert([
    { child_id: s.aminaId, topic_id: (await db.from('topics').select('id').eq('map_id', s.mapId).single()).data!.id, topic_name: TOPIC, stage: 'new' },
    { child_id: s.aminaId, topic_id: b.topicIds[0]!, topic_name: 'Photosynthesis', stage: 'new' },
  ])
}

test('plan: a learner in one class is planned as before, from that class gaps and map', async () => {
  const topicId = (await db.from('topics').select('id').eq('map_id', s.mapId).single()).data!.id
  await db.from('gaps').insert({ child_id: s.thaboId, topic_id: topicId, topic_name: TOPIC, stage: 'new' })
  for (const eventId of [null, eventA, eventB]) {
    await db.from('sessions').delete().eq('child_id', s.thaboId)
    await db.from('lessons').delete().eq('child_id', s.thaboId)
    const out = await plan(eventId, s.thaboId)
    expect(out).toMatchObject({ planned: true, topicName: TOPIC })
    expect(out.queue.map((q) => q.topicName)).toEqual([TOPIC])
  }
})

// The sandbox has Amina away on a school day (Monday 5 Oct), so a plan also adds map topics that no gap or lesson covers.
const gapNames = (p: SessionPlan) => p.queue.filter((q) => q.reason === 'gap').map((q) => q.topicName)
const awayNames = (p: SessionPlan) => p.queue.filter((q) => q.reason === 'away').map((q) => q.topicName)

test('plan: a learner in two classes is planned from the gaps and the map of the class of the event', async () => {
  await openGaps()
  const forB = await plan(eventB, s.aminaId)
  expect(forB).toMatchObject({ planned: true, topicName: 'Photosynthesis' })
  expect(gapNames(forB)).toEqual(['Photosynthesis'])
  expect(awayNames(forB)).toEqual(['Cells']) // a topic of class B's map, none of class A's
  await resetPlans()
  await openGaps()
  const forA = await plan(eventA, s.aminaId)
  expect(forA).toMatchObject({ planned: true, topicName: TOPIC })
  expect(gapNames(forA)).toEqual([TOPIC])
  expect(awayNames(forA)).toEqual([]) // class A's map has one topic and it is a gap
})

test('plan: with no class to go by, a learner in two classes is planned from all the gaps and both maps, as before', async () => {
  await openGaps()
  const out = await plan(null, s.aminaId)
  expect(gapNames(out).sort()).toEqual([TOPIC, 'Photosynthesis'].sort())
  expect(awayNames(out)).toEqual(['Cells'])
  await resetPlans()
  await openGaps()
  const aboutLearner = await plan(eventNone, s.aminaId)
  expect(gapNames(aboutLearner).sort()).toEqual([TOPIC, 'Photosynthesis'].sort())
  expect(awayNames(aboutLearner)).toEqual(['Cells'])
})

test('plan: with no gap at all, the away topic comes from the map of the class of the event', async () => {
  const forB = await plan(eventB, s.aminaId)
  expect(forB.queue.every((q) => q.reason === 'away')).toBe(true)
  expect(forB.topicName).toBe('Photosynthesis') // the first topic of class B's map, one day away
  await resetPlans()
  const forA = await plan(eventA, s.aminaId)
  expect(forA.queue.every((q) => q.reason === 'away')).toBe(true)
  expect(forA.topicName).toBe(TOPIC)
})

// ---- orchestrator ownerOf: the owner and the link of the class of the event ---------------------------------------------------

test('ownerOf: with no class it is the oldest class of the school, as before; with a class it is that class', async () => {
  expect(await ownerOf(db, s.schoolId)).toEqual({ userId: s.teacherId, href: `/t/${s.classId}` })
  expect(await ownerOf(db, s.schoolId, s.classId)).toEqual({ userId: s.teacherId, href: `/t/${s.classId}` })
  expect(await ownerOf(db, s.schoolId, b.classId)).toEqual({ userId: teacherB, href: `/t/${b.classId}` })
})

test('ownerOf: a class of another school is not used', async () => {
  const other = await createSandbox(db, `${tag}o`)
  try {
    expect(await ownerOf(db, s.schoolId, other.classId)).toEqual({ userId: s.teacherId, href: `/t/${s.classId}` })
  } finally {
    await other.cleanup()
  }
})

test('announceNeedsYou: the notification of an item leads to the class of the item', async () => {
  const since = new Date(Date.now() - 60_000).toISOString()
  await db.from('needs_you_items').insert([
    { owner_id: teacherB, school_id: s.schoolId, kind: 'check_answer', ref_id: b.paperId, status: 'open', title: 'Check one in B', detail: 'Class B' },
    { owner_id: s.teacherId, school_id: s.schoolId, kind: 'check_answer', ref_id: s.paperId, status: 'open', title: 'Check one in A', detail: 'Class A' },
  ])
  await announceNeedsYou(db, s.schoolId, since, new Set())
  const forB = (await db.from('notifications').select('title, href').eq('user_id', teacherB).eq('title', 'Check one in B')).data
  const forA = (await db.from('notifications').select('title, href').eq('user_id', s.teacherId).eq('title', 'Check one in A')).data
  expect(forB).toEqual([{ title: 'Check one in B', href: `/t/${b.classId}` }])
  expect(forA).toEqual([{ title: 'Check one in A', href: `/t/${s.classId}` }])
})
