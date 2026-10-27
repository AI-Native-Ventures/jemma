import { afterAll, beforeAll, expect, test, vi } from 'vitest'
import { MockLanguageModelV4 } from 'ai/test'
import { createServiceClient, type JemmaDb } from '../../src/db'
import { MemoryStore } from '../../src/ai'
import { connectInMemory } from '../../src/server'
import type { ToolContext } from '../../src/tools/context'
import { runGuidance } from '../../src/jobs/cloud/guidance'
import { createSandbox, type Sandbox } from '../helpers/sandbox'
import { loadEnv } from '../helpers/env'

vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 })
const env = loadEnv()
const db: JemmaDb = createServiceClient({
  SUPABASE_URL: env.SUPABASE_URL!,
  SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY!,
})
const tag = `by${Date.now()}`
let a: Sandbox
let b: Sandbox
let eventId: string

const ctxFor = (s: Sandbox): ToolContext => ({
  db,
  schoolId: s.schoolId,
  eventId: s === a ? eventId : null,
  env: { replayStore: new MemoryStore() },
  now: () => new Date(),
})

beforeAll(async () => {
  a = await createSandbox(db, `${tag}a`)
  b = await createSandbox(db, `${tag}b`)
  const ev = await db
    .from('events')
    .insert({ school_id: a.schoolId, type: 'observation.added', payload: { type: 'observation.added', childId: a.aminaId }, status: 'running' })
    .select('id')
    .single()
  eventId = ev.data!.id
})
afterAll(async () => {
  await a?.cleanup()
  await b?.cleanup()
})

async function call(s: Sandbox, name: string, args: Record<string, unknown>) {
  const { client, close } = await connectInMemory(ctxFor(s))
  try {
    return await client.callTool({ name, arguments: args })
  } finally {
    await close()
  }
}

const resultIds = async () =>
  (await db.from('question_results').select('id').eq('child_id', a.aminaId)).data!.map((r) => r.id)

function mockModel(object: unknown) {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: 'text' as const, text: JSON.stringify(object) }],
      finishReason: { unified: 'stop' as const, raw: 'stop' },
      usage: {
        inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 1, text: 1, reasoning: 0 },
      },
      warnings: [],
    }),
  })
}

test('observation, attendance and activity tools write rows', async () => {
  const obs = await call(a, 'add_observation', { childId: a.aminaId, kind: 'participation', text: 'Put her hand up twice today' })
  expect(obs.isError).toBeFalsy()
  const obsId = (obs.structuredContent as { observationId: string }).observationId
  const row = await db.from('observations').select('text, author_id').eq('id', obsId).single()
  expect(row.data).toMatchObject({ text: 'Put her hand up twice today', author_id: a.teacherId })

  const att = await call(a, 'record_attendance', {
    classId: a.classId,
    day: '2026-10-20',
    entries: [{ childId: a.aminaId, status: 'late' }, { childId: a.thaboId, status: 'here' }],
  })
  expect(att.structuredContent).toEqual({ saved: 2 })
  const stored = await db.from('attendance').select('status').eq('child_id', a.aminaId).eq('day', '2026-10-20').single()
  expect(stored.data!.status).toBe('late')

  const act = await call(a, 'add_activity', { childId: a.aminaId, kind: 'club', name: 'Chess', place: 'Library', days: ['Wed'], since: 'Oct 2026' })
  expect(act.isError).toBeFalsy()
  const actId = (act.structuredContent as { activityId: string }).activityId
  const arow = await db.from('activities').select('name, place').eq('id', actId).single()
  expect(arow.data).toMatchObject({ name: 'Chess', place: 'Library' })
})

test('teacher-only kinds are refused for another school', async () => {
  const obs = await call(b, 'add_observation', { childId: a.aminaId, kind: 'effort', text: 'x' })
  expect(obs.isError).toBe(true)
  const att = await call(b, 'record_attendance', { classId: a.classId, day: '2026-10-21', entries: [{ childId: a.aminaId, status: 'here' }] })
  expect(att.isError).toBe(true)
  const act = await call(b, 'add_activity', { childId: a.aminaId, kind: 'sport', name: 'Hockey', days: [], since: '2026' })
  expect(act.isError).toBe(true)
  const g = await call(b, 'subject_guidance', { childId: a.aminaId, guidance: { headline: 'h', focus: [], lookingAhead: 'l' } })
  expect(g.isError).toBe(true)
  const none = await db.from('attendance').select('child_id').eq('child_id', a.aminaId).eq('day', '2026-10-21')
  expect(none.data).toEqual([])
})

test('guidance cites evidence for every focus item', async () => {
  const [good] = await resultIds()
  const res = await call(a, 'subject_guidance', {
    childId: a.aminaId,
    guidance: {
      headline: 'Amina is doing well. One thing to work on this week: adding fractions.',
      focus: [
        { title: 'Adding fractions', why: 'Two papers show tops and bottoms added', evidence: [{ label: 'Test 2 Q1', resultIds: [good] }] },
        { title: 'Times tables', why: 'No proof at all', evidence: [] },
        { title: 'Made up', why: 'Points at a result that is not hers', evidence: [{ label: 'Ghost', resultIds: ['00000000-0000-4000-8000-000000000000'] }] },
      ],
      lookingAhead: 'Next up is subtracting fractions.',
    },
  })
  expect(res.isError).toBeFalsy()
  expect(res.structuredContent).toEqual({ updated: true })
  const card = await db.from('guidance_cards').select('content').eq('child_id', a.aminaId).single()
  const content = card.data!.content as { focus: { title: string }[] }
  expect(content.focus.map((f) => f.title)).toEqual(['Adding fractions'])
})

test('guidance uses the newest note', async () => {
  await db.from('guidance_cards').update({ created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }).eq('child_id', a.aminaId)
  await db.from('observations').insert({ child_id: a.aminaId, author_id: a.teacherId, kind: 'effort', text: 'Stayed after class to redo fractions' })
  const [rid] = await resultIds()
  const model = mockModel({
    headline: 'Amina is working hard on fractions.',
    focus: [{ title: 'Adding fractions', why: 'Tops and bottoms added', evidence: [{ label: 'Test 2 Q1', resultIds: [rid] }] }],
    lookingAhead: 'Subtracting fractions comes next.',
  })
  await runGuidance(ctxFor(a), eventId, { childId: a.aminaId }, model)
  const prompt = JSON.stringify(model.doGenerateCalls[0]!.prompt)
  expect(prompt).toContain('Stayed after class to redo fractions')
  expect(prompt).toContain('untrusted')
  expect(prompt).toContain('never careers')
  const log = await db.from('activity_log').select('text, school_id, child_id').eq('child_id', a.aminaId).eq('tool', 'subject_guidance')
  expect(log.data!.map((l) => l.text)).toContain('Used your note on Amina in her guidance card')
  expect(log.data![0]!.school_id).toBe(a.schoolId)
})
