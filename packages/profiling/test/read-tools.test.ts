import { afterAll, beforeAll, expect, test, vi } from 'vitest'
import { createServiceClient, type JemmaDb } from '../src/db'
import { MemoryStore } from '../src/ai'
import { connectInMemory } from '../src/server'
import type { ToolContext } from '../src/tools/context'
import { insertActivity, insertObservation, saveAttendance } from '../src/records'
import { createSandbox, type Sandbox } from './helpers/sandbox'
import { loadEnv } from './helpers/env'

vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 })
const env = loadEnv()
const db: JemmaDb = createServiceClient({
  SUPABASE_URL: env.SUPABASE_URL!,
  SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY!,
})
const tag = `rd${Date.now()}`
let s: Sandbox
let eventId: string

const ctx = (): ToolContext => ({
  db,
  schoolId: s.schoolId,
  eventId,
  env: { replayStore: new MemoryStore() },
  now: () => new Date(),
})

beforeAll(async () => {
  s = await createSandbox(db, tag)
  const ev = await db
    .from('events')
    .insert({ school_id: s.schoolId, type: 'paper.snapped', payload: { type: 'paper.snapped', paperId: s.paperId }, status: 'running' })
    .select('id')
    .single()
  eventId = ev.data!.id
})
afterAll(async () => {
  await s?.cleanup()
})

async function call(name: string, args: Record<string, unknown>) {
  const { client, close } = await connectInMemory(ctx())
  try {
    return await client.callTool({ name, arguments: args })
  } finally {
    await close()
  }
}
type Part = { type: string; [k: string]: unknown }

test('read tools return images as MCP image content', async () => {
  const paper = await call('get_paper', { paperId: s.paperId })
  expect(paper.isError).toBeFalsy()
  const images = (paper.content as Part[]).filter((p) => p.type === 'image')
  expect(images).toHaveLength(1)
  expect(images[0]).toMatchObject({ mimeType: 'image/png' })
  expect(String(images[0]!.data).length).toBeGreaterThan(10)
  expect(paper.structuredContent).toMatchObject({
    paperId: s.paperId,
    roster: expect.arrayContaining(['Amina', 'Thabo']),
    key: expect.arrayContaining([expect.objectContaining({ n: 1, answer: '3/4' })]),
  })

  const memo = await call('get_memo', { testId: s.testId })
  expect((memo.content as Part[]).some((p) => p.type === 'image')).toBe(true)
  expect(memo.structuredContent).toMatchObject({ topicNames: ['Adding fractions with different denominators'] })

  const doc = await call('get_curriculum_doc', { mapId: s.mapId })
  expect((doc.content as Part[]).some((p) => p.type === 'image')).toBe(true)
  expect(doc.structuredContent).toMatchObject({ classGrade: 6, classSubject: 'Maths' })
})

test('get_class_results groups marked results by learner', async () => {
  const res = await call('get_class_results', { testId: s.testId })
  const out = res.structuredContent as { learners: { firstName: string; results: { resultId: string }[] }[] }
  expect(out.learners.map((l) => l.firstName).sort()).toEqual(['Amina', 'Thabo'])
  expect(out.learners.find((l) => l.firstName === 'Amina')!.results).toHaveLength(2)
  // every result carries its id, the one update_learner_profile asks for
  const ids = out.learners.flatMap((l) => l.results.map((r) => r.resultId))
  expect(ids).toHaveLength(4)
  const found = await db.from('question_results').select('id').in('id', ids)
  expect(found.data).toHaveLength(4)
})

test('get_job names the job for an event', async () => {
  const res = await call('get_job', { eventId })
  // the paper is already marked and the whole test is marked, so the first AI job is the tail's first diagnose
  expect(res.structuredContent).toMatchObject({ job: 'diagnose', eventType: 'paper.snapped', promptName: 'diagnose', ids: { testId: s.testId } })
})

test('get_child_context returns profile, gaps and trials', async () => {
  const res = await call('get_child_context', { childId: s.aminaId })
  expect(res.structuredContent).toMatchObject({ profile: { child: { firstName: 'Amina' } }, gaps: [], formatTrials: [], session: null })
})

test('complete_job closes the event', async () => {
  const res = await call('complete_job', { eventId, status: 'failed', note: 'boom' })
  expect(res.structuredContent).toEqual({ ok: true })
  const row = await db.from('events').select('status, error, finished_at').eq('id', eventId).single()
  expect(row.data).toMatchObject({ status: 'failed', error: 'boom' })
  expect(row.data!.finished_at).not.toBeNull()
})

test('complete_job leaves an event of a desktop runner alone: the runner settles it after the whole plan', async () => {
  const desktop = await db
    .from('events')
    .insert({ school_id: s.schoolId, type: 'observation.added', payload: { type: 'observation.added', childId: s.aminaId }, status: 'running', runner: 'desktop' })
    .select('id')
    .single()
  const id = desktop.data!.id
  for (const status of ['done', 'failed'] as const) {
    const res = await call('complete_job', { eventId: id, status, note: 'a step ended' })
    expect(res.structuredContent).toEqual({ ok: true })
    const row = await db.from('events').select('status, error, finished_at').eq('id', id).single()
    expect(row.data).toEqual({ status: 'running', error: null, finished_at: null })
  }
  // a tool call for an event of another school is still refused
  const other = await call('complete_job', { eventId: crypto.randomUUID(), status: 'done' })
  expect(other.isError).toBe(true)
})

test('record writers validate and return ids', async () => {
  const obs = await insertObservation(db, { childId: s.aminaId, authorId: s.teacherId, kind: 'participation', text: 'Asked a question' })
  expect(obs).toMatch(/^[0-9a-f-]{36}$/)
  await expect(insertObservation(db, { childId: s.aminaId, authorId: s.teacherId, kind: 'bad' as never, text: 'x' })).rejects.toThrow()
  const saved = await saveAttendance(db, { classId: s.classId, day: '2026-10-20', entries: [{ childId: s.aminaId, status: 'late' }, { childId: s.thaboId, status: 'here' }] })
  expect(saved).toBe(2)
  const act = await insertActivity(db, { childId: s.aminaId, createdBy: s.teacherId, kind: 'club', name: 'Chess', place: null, days: ['Wed'], since: 'Mar 2026' })
  expect(act).toMatch(/^[0-9a-f-]{36}$/)
})
