import { MockLanguageModelV4 } from 'ai/test'
import type { z } from 'zod'
import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest'
import { MemoryStore } from '../../src/ai'
import { createServiceClient, type JemmaDb } from '../../src/db'
import { runJobWriteLesson } from '../../src/jobs/cloud/write-lesson'
import type { Question } from '../../src/schemas/lesson'
import { LessonSchema, type Lesson } from '../../src/schemas/lesson'
import type { SpeechSynth } from '../../src/speech'
import { registry } from '../../src/tools/registry'
import { planNextSession } from '../../src/tools/save/plan-next-session'
import { saveLesson } from '../../src/tools/save/save-lesson'
import { isWithImages, type ToolContext, type ToolDef } from '../../src/tools/context'
import { loadEnv } from '../helpers/env'
import { createSandbox, type Sandbox } from '../helpers/sandbox'

vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 })
const env = loadEnv()
const db: JemmaDb = createServiceClient({
  SUPABASE_URL: env.SUPABASE_URL!,
  SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY!,
})
const tag = `ls${Date.now()}`
const TOPIC = 'Adding fractions with different denominators'
let s: Sandbox
let eventId: string
let decimalsId: string
let topicId: string
const speechCalls: string[] = []
const speech: SpeechSynth = {
  async synthesize(script) {
    speechCalls.push(script)
    return { bytes: new Uint8Array([1, 2, 3]), mediaType: 'audio/mpeg' }
  },
}

// Monday 26 Oct 2026: Amina has netball on Tuesday, so the next free day is Wednesday.
const NOW = new Date('2026-10-26T10:00:00Z')
const ctx = (): ToolContext & { speech: SpeechSynth } => ({
  db,
  schoolId: s.schoolId,
  eventId,
  env: { replayStore: new MemoryStore(), LLM_PROVIDER: 'openrouter', LLM_MODEL: 'mock' },
  now: () => NOW,
  speech,
})

// These tools never return images, so narrow the union.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function plain<T extends ToolDef<any, any>>(tool: T, c: ToolContext, input: z.infer<T['input']>): Promise<z.infer<T['output']>> {
  const out = await tool.run(c, input)
  if (isWithImages(out)) throw new Error('unexpected images')
  return out
}

const q = (difficulty: 1 | 2 | 3, i: number, over: Partial<Question> = {}): Question => ({
  prompt: `1/2 + 1/4 (${difficulty}.${i})`,
  render: 'text',
  answer: '3/4',
  answerKind: 'fraction',
  difficulty,
  why: 'The pieces must be the same size first.',
  rightWay: 'Make quarters: 2/4 + 1/4 = 3/4.',
  ...over,
})
function lessonOf(format: Lesson['format'], bad: number[] = []): Lesson {
  const questions = ([1, 2, 3] as const).flatMap((d) => [0, 1, 2, 3, 4].map((i) => q(d, i)))
  for (const i of bad) questions[i] = { ...questions[i]!, answer: 'banana' }
  const base = { format, title: 'Adding fractions', minutes: 12, warmup: [q(1, 90), q(1, 91)], questions }
  if (format === 'audio') return { ...base, audio: { script: 'Today we add fractions. First make the pieces the same size.' } }
  if (format === 'reading') return { ...base, cards: [{ heading: 'Same size pieces', body: 'Make quarters first.' }] }
  return {
    ...base,
    diagram: {
      title: 'Fraction bars',
      caption: 'Line the bars up.',
      steps: [{ caption: 'Half', diagram: { kind: 'fraction_bar', rows: [{ parts: 2, shaded: 1 }] } }],
    },
  }
}

const mockLesson = (...lessons: Lesson[]) =>
  new MockLanguageModelV4({
    modelId: 'mock',
    doGenerate: lessons.map((l) => ({
      content: [{ type: 'text', text: JSON.stringify(l) }],
      finishReason: { unified: 'stop', raw: 'stop' },
      usage: {
        inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 1, text: 1, reasoning: 0 },
      },
      warnings: [],
    })) as never,
  })

async function resetChild() {
  await db.from('sessions').delete().eq('child_id', s.aminaId)
  await db.from('lessons').delete().eq('child_id', s.aminaId)
  await db.from('format_trials').delete().eq('child_id', s.aminaId)
  await db.from('gaps').delete().eq('child_id', s.aminaId)
  await db.from('activity_log').delete().eq('child_id', s.aminaId)
  speechCalls.length = 0
}
async function addGap(name: string, topic: string | null, stage: 'new' | 'practising' | 'fixed' = 'new') {
  const r = await db.from('gaps').insert({ child_id: s.aminaId, topic_id: topic, topic_name: name, stage }).select('id').single()
  if (r.error) throw r.error
}
async function trials(spec: Record<string, number>) {
  const rows = Object.entries(spec).flatMap(([format, n]) =>
    Array.from({ length: n }, () => ({ child_id: s.aminaId, topic_family: 'fractions', format: format as 'reading', score: 3 })),
  )
  const r = await db.from('format_trials').insert(rows)
  if (r.error) throw r.error
}

beforeAll(async () => {
  s = await createSandbox(db, tag)
  const ev = await db
    .from('events')
    .insert({ school_id: s.schoolId, type: 'session.finished', payload: { type: 'session.finished', sessionId: s.aminaId }, status: 'running' })
    .select('id')
    .single()
  eventId = ev.data!.id
  const t = await db.from('topics').select('id').eq('map_id', s.mapId).single()
  topicId = t.data!.id
  const d = await db
    .from('topics')
    .insert({ map_id: s.mapId, term: 1, position: 2, name: 'Adding decimals', family: 'decimals', prerequisite_ids: [] })
    .select('id')
    .single()
  decimalsId = d.data!.id
})
afterAll(async () => {
  await s?.cleanup()
})
beforeEach(resetChild)

test('tools are registered', () => {
  const names = registry.map((t) => t.name)
  expect(names).toContain('plan_next_session')
  expect(names).toContain('save_lesson')
})

test("plans Amina's next session by the rotation rule", async () => {
  await addGap(TOPIC, topicId, 'new')
  await trials({ diagram: 2, reading: 2, audio: 1 })
  const plan = await plain(planNextSession, ctx(), { childId: s.aminaId })
  expect(plan).toMatchObject({ planned: true, topicName: TOPIC, format: 'audio', plannedFor: '2026-10-28' })
  const sess = await db.from('sessions').select('status, lesson_id').eq('id', plan.sessionId!).single()
  expect(sess.data!.status).toBe('planned')
  // planning twice returns the same planned session
  const again = await plain(planNextSession, ctx(), { childId: s.aminaId })
  expect(again.sessionId).toBe(plan.sessionId)
})

test('ties on trials go diagram, reading, audio', async () => {
  await addGap(TOPIC, topicId, 'new')
  const plan = await plain(planNextSession, ctx(), { childId: s.aminaId })
  expect(plan.format).toBe('diagram')
})

test('lowest stage first, basics before what needs them', async () => {
  const basics = await db.from('topics').insert({ map_id: s.mapId, term: 1, position: 3, name: 'Equivalent fractions', family: 'fractions' }).select('id').single()
  await db.from('topics').update({ prerequisite_ids: [basics.data!.id] }).eq('id', topicId)
  await addGap(TOPIC, topicId, 'new')
  await addGap('Equivalent fractions', basics.data!.id, 'practising')
  await addGap('Adding decimals', decimalsId, 'fixed')
  const plan = await plain(planNextSession, ctx(), { childId: s.aminaId })
  expect(plan.topicName).toBe('Equivalent fractions')
  await db.from('topics').update({ prerequisite_ids: [] }).eq('id', topicId)
  await db.from('topics').delete().eq('id', basics.data!.id)
})

test('days away put that weeks map topics after the open gaps', async () => {
  await addGap(TOPIC, topicId, 'new')
  const plan = await plain(planNextSession, ctx(), { childId: s.aminaId })
  expect(plan.queue.map((x) => x.topicName)).toEqual([TOPIC, 'Adding decimals'])
  expect(plan.queue[1]!.reason).toBe('away')
})

test('lesson has 2 warm-up and 15 questions in 3 levels', async () => {
  await addGap(TOPIC, topicId, 'new')
  await plain(planNextSession, ctx(), { childId: s.aminaId })
  const model = mockLesson(lessonOf('diagram'))
  await runJobWriteLesson(ctx(), eventId, { childId: s.aminaId }, { model })
  const row = await db.from('lessons').select('content, format').eq('child_id', s.aminaId).single()
  const lesson = LessonSchema.parse(row.data!.content)
  expect(lesson.warmup).toHaveLength(2)
  expect(lesson.questions).toHaveLength(15)
  expect([1, 2, 3].map((d) => lesson.questions.filter((x) => x.difficulty === d).length)).toEqual([5, 5, 5])
  const log = await db.from('activity_log').select('text, school_id').eq('child_id', s.aminaId)
  expect(log.data!.map((l) => l.text)).toContainEqual(expect.stringMatching(/^Built tonight's 12-minute lesson on adding fractions.* with fraction bars$/))
  expect(log.data![0]!.school_id).toBe(s.schoolId)
})

test('planning the same child twice at once leaves one planned session', async () => {
  await addGap(TOPIC, topicId, 'new')
  const [a, b, c] = await Promise.all([1, 2, 3].map(() => plain(planNextSession, ctx(), { childId: s.aminaId })))
  expect(new Set([a.sessionId, b.sessionId, c.sessionId]).size).toBe(1)
  const rows = await db.from('sessions').select('id').eq('child_id', s.aminaId).eq('status', 'planned')
  expect(rows.data).toHaveLength(1)
})

test('bad answers are regenerated then dropped', async () => {
  await addGap(TOPIC, topicId, 'new')
  const plan = await plain(planNextSession, ctx(), { childId: s.aminaId })
  // first reply has a bad answer, the regeneration still has it: that question is dropped
  const model = mockLesson(lessonOf(plan.format as 'diagram', [2]), lessonOf(plan.format as 'diagram', [2]))
  await runJobWriteLesson(ctx(), eventId, { childId: s.aminaId }, { model })
  expect(model.doGenerateCalls).toHaveLength(2)
  const row = await db.from('lessons').select('content').eq('child_id', s.aminaId).single()
  expect((row.data!.content as Lesson).questions).toHaveLength(14)
})

test('bad answers fixed by the regeneration are kept', async () => {
  await addGap(TOPIC, topicId, 'new')
  const plan = await plain(planNextSession, ctx(), { childId: s.aminaId })
  const model = mockLesson(lessonOf(plan.format as 'diagram', [2]), lessonOf(plan.format as 'diagram'))
  await runJobWriteLesson(ctx(), eventId, { childId: s.aminaId }, { model })
  const row = await db.from('lessons').select('content').eq('child_id', s.aminaId).single()
  expect((row.data!.content as Lesson).questions).toHaveLength(15)
})

test('save_lesson rejects bad answers unless asked to drop, and keeps at least 4 per level', async () => {
  await addGap(TOPIC, topicId, 'new')
  const plan = await plain(planNextSession, ctx(), { childId: s.aminaId })
  const format = plan.format as 'diagram'
  await expect(saveLesson.run(ctx(), { sessionId: plan.sessionId!, lesson: lessonOf(format, [0]) })).rejects.toThrow(/question 1/)
  await expect(
    saveLesson.run(ctx(), { sessionId: plan.sessionId!, lesson: lessonOf(format, [0, 1]), dropInvalid: true }),
  ).rejects.toThrow(/at least 4/)
  const ok = await plain(saveLesson, ctx(), { sessionId: plan.sessionId!, lesson: lessonOf(format, [0]), dropInvalid: true })
  expect(ok.format).toBe(format)
})

test('audio lesson stores speech once', async () => {
  await addGap(TOPIC, topicId, 'new')
  await trials({ diagram: 2, reading: 2 })
  const plan = await plain(planNextSession, ctx(), { childId: s.aminaId })
  expect(plan.format).toBe('audio')
  const first = await plain(saveLesson, ctx(), { sessionId: plan.sessionId!, lesson: lessonOf('audio') })
  const second = await plain(saveLesson, ctx(), { sessionId: plan.sessionId!, lesson: lessonOf('audio') })
  expect(second.lessonId).toBe(first.lessonId)
  expect(speechCalls).toHaveLength(1)
  const row = await db.from('lessons').select('audio_path').eq('id', first.lessonId).single()
  expect(row.data!.audio_path).toBe(`${first.lessonId}.mp3`)
  const file = await db.storage.from('lesson-audio').download(`${first.lessonId}.mp3`)
  expect(file.error).toBeNull()
  await db.storage.from('lesson-audio').remove([`${first.lessonId}.mp3`])
})

test('existing lesson is returned, not regenerated', async () => {
  await addGap(TOPIC, topicId, 'new')
  await plain(planNextSession, ctx(), { childId: s.aminaId })
  const model = mockLesson(lessonOf('diagram'), lessonOf('diagram'))
  await runJobWriteLesson(ctx(), eventId, { childId: s.aminaId }, { model })
  await runJobWriteLesson(ctx(), eventId, { childId: s.aminaId }, { model })
  expect(model.doGenerateCalls).toHaveLength(1)
  const lessons = await db.from('lessons').select('id').eq('child_id', s.aminaId)
  expect(lessons.data).toHaveLength(1)
})
