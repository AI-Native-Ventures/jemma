import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MockLanguageModelV4 } from 'ai/test'
import { afterAll, beforeAll, expect, test, vi } from 'vitest'
import { MemoryStore } from '../../src/ai'
import { PROMPT_JOBS, renderPrompt, type PromptJob } from '../../src/ai/prompt-variants'
import { makeClassContext } from '../../src/ai/subject-profile'
import { createServiceClient, type JemmaDb } from '../../src/db'
import { makeClassReportJob } from '../../src/jobs/cloud/class-report'
import { makeDiagnoseJob } from '../../src/jobs/cloud/diagnose'
import { runDraftMap } from '../../src/jobs/cloud/draft-map'
import { runGuidance } from '../../src/jobs/cloud/guidance'
import { runReadKey } from '../../src/jobs/cloud/read-key'
import { runJobReadPaper } from '../../src/jobs/cloud/read-paper'
import { runJobWriteLesson } from '../../src/jobs/cloud/write-lesson'
import type { Lesson, Question } from '../../src/schemas/lesson'
import type { TopicMapDraft } from '../../src/schemas'
import type { ToolContext } from '../../src/tools/context'
import { planNextSession } from '../../src/tools/save/plan-next-session'
import { loadEnv } from '../helpers/env'
import { createSandbox, type Sandbox } from '../helpers/sandbox'

// Every cloud job is told the class it works for. These tests capture what the model would be sent (the system text and the
// header) with a fake model, for the baseline class (Maths, Grade 6, South Africa), which must be what it was before, and for
// a Grade 9 Natural Sciences class in Kenya. No live model.

vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 })
const env = loadEnv()
const db: JemmaDb = createServiceClient({ SUPABASE_URL: env.SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY! })
const tag = `sj${Date.now()}`
const TOPIC = 'Adding fractions with different denominators'
let base: Sandbox
let kenya: Sandbox
let baseEvent: string
let kenyaEvent: string

const jobsDir = join(import.meta.dirname, '../../src/jobs')
const mdOf = (job: PromptJob) => readFileSync(join(jobsDir, `${job}.md`), 'utf8')
const NOW = new Date('2026-10-26T10:00:00Z')
const ctxFor = (s: Sandbox, eventId: string): ToolContext => ({
  db,
  schoolId: s.schoolId,
  eventId,
  env: { replayStore: new MemoryStore(), LLM_PROVIDER: 'openrouter', LLM_MODEL: 'mock' },
  now: () => NOW,
})

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
}
const mockReturning = (value: unknown) =>
  new MockLanguageModelV4({
    modelId: 'mock',
    doGenerate: async () => ({ content: [{ type: 'text', text: JSON.stringify(value) }], finishReason: { unified: 'stop', raw: 'stop' }, usage, warnings: [] }) as never,
  })

type Message = { role: string; content: unknown }
const messages = (m: MockLanguageModelV4) => m.doGenerateCalls[0]!.prompt as Message[]
/** The system text of the first call. */
const systemOf = (m: MockLanguageModelV4) => String(messages(m).find((x) => x.role === 'system')!.content)
/** The text parts of the user message of the first call, joined. */
const userOf = (m: MockLanguageModelV4) =>
  messages(m)
    .filter((x) => x.role === 'user')
    .flatMap((x) => (Array.isArray(x.content) ? (x.content as { type: string; text?: string }[]) : []))
    .filter((p) => p.type === 'text')
    .map((p) => p.text)
    .join('\n')

/** A job that fails after the model call (its fake answer is not worth saving) still shows what the model was sent. */
const sent = async (run: () => Promise<unknown>) => {
  await run().catch(() => undefined)
}

const draft = (grade: number): TopicMapDraft => ({
  grade,
  terms: [{ term: 1, topics: [{ name: 'Topic one', family: 'life_living', prerequisites: [], misconceptions: [] }] }],
  leftOut: [],
})
const question = (difficulty: 1 | 2 | 3, i: number): Question => ({
  prompt: `Which one? (${difficulty}.${i})`,
  render: 'text',
  answer: 'B',
  answerKind: 'choice',
  difficulty,
  why: 'It is easy to mix them up.',
  rightWay: 'Look at the second one.',
  choices: ['one', 'two', 'three'],
} as Question)
const lesson = (format: Lesson['format']): Lesson => {
  const common = {
    title: 'A lesson',
    minutes: 12,
    warmup: [question(1, 90), question(1, 91)],
    questions: ([1, 2, 3] as const).flatMap((d) => [0, 1, 2, 3, 4].map((i) => question(d, i))),
  }
  if (format === 'audio') return { ...common, format, audio: { script: 'Today we look at one idea. Listen carefully.' } }
  if (format === 'reading') return { ...common, format, cards: [{ heading: 'One', body: 'Two.' }] }
  return {
    ...common,
    format: 'diagram',
    diagram: { title: 'A picture', caption: 'Look at it.', steps: [{ caption: 'First', diagram: { kind: 'fraction_bar', rows: [{ parts: 2, shaded: 1 }] } }] },
  }
}

beforeAll(async () => {
  base = await createSandbox(db, `${tag}a`)
  kenya = await createSandbox(db, `${tag}k`)
  await db.from('schools').update({ country: 'KE' }).eq('id', kenya.schoolId)
  await db.from('classes').update({ subject: 'Natural Sciences', grade: 9, name: '9A Natural Sciences' }).eq('id', kenya.classId)
  const ev = async (s: Sandbox) =>
    (await db.from('events').insert({ school_id: s.schoolId, type: 'paper.checked', payload: { type: 'paper.checked', paperId: s.paperId }, status: 'running' }).select('id').single()).data!.id
  baseEvent = await ev(base)
  kenyaEvent = await ev(kenya)
  // The class report works on diagnosed answers: point every wrong answer at its topic, as the diagnose job does.
  for (const s of [base, kenya]) {
    const topic = (await db.from('topics').select('id').eq('map_id', s.mapId).single()).data!
    await db.from('question_results').update({ gap_topic_id: topic.id }).in('child_id', [s.aminaId, s.thaboId])
  }
})
afterAll(async () => {
  await base?.cleanup()
  await kenya?.cleanup()
})

// ---- the baseline class: what the model is sent has not changed ----------------------------------------------------------

test('baseline: draft_map sends the file text and the old header, to the byte', async () => {
  await db.from('curriculum_maps').update({ status: 'draft', approved_at: null, draft: {} }).eq('id', base.mapId)
  const model = mockReturning({ draft: draft(6) })
  await runDraftMap(ctxFor(base, baseEvent), null, { mapId: base.mapId }, { getModel: () => model as never })
  expect(systemOf(model)).toBe(mdOf('draft_map'))
  expect(userOf(model)).toMatch(/^Class grade: 6\. Draft the topic map for this grade only\.\n\n<untrusted>\n/)
  expect(userOf(model)).not.toContain('Subject:')
})

test('baseline: read_key sends the file text', async () => {
  await db.from('answer_keys').update({ status: 'draft', approved_at: null, items: [] }).eq('test_id', base.testId)
  const model = mockReturning({ items: [{ n: 1, prompt: 'q', answer: '1', marks: 1, topicName: TOPIC, confidence: 0.9 }] })
  await runReadKey(ctxFor(base, baseEvent), null, { testId: base.testId }, { getModel: () => model as never })
  expect(systemOf(model)).toBe(mdOf('read_key'))
})

test('baseline: read_paper, diagnose, class_report, write_lesson and guidance send the text they were given, to the byte', async () => {
  const diagnose = mockReturning({ diagnoses: [] })
  await sent(() => makeDiagnoseJob(mdOf('diagnose'), { model: diagnose as never })(ctxFor(base, baseEvent), baseEvent, { testId: base.testId, childId: base.aminaId }))
  expect(diagnose.doGenerateCalls.length, 'diagnose asked the model').toBeGreaterThan(0)
  expect(systemOf(diagnose)).toBe(mdOf('diagnose'))

  const report = mockReturning({ why: 'w', missingBasic: 'm', explanation: 'e', reteach: { title: 't', minutes: 10, audience: 'a', youNeed: 'y', steps: [{ minutes: 10, text: 's' }], exitQuestion: 'q' } })
  await sent(() => makeClassReportJob(mdOf('class_report'), { model: report as never })(ctxFor(base, baseEvent), baseEvent, { classId: base.classId, testId: base.testId }))
  expect(report.doGenerateCalls.length, 'report asked the model').toBeGreaterThan(0)
  expect(systemOf(report)).toBe(mdOf('class_report'))

  const guidance = mockReturning({ headline: 'h', focus: [], lookingAhead: 'l' })
  await sent(() => runGuidance(ctxFor(base, baseEvent), baseEvent, { childId: base.aminaId }, guidance as never))
  expect(guidance.doGenerateCalls.length, 'guidance asked the model').toBeGreaterThan(0)
  expect(systemOf(guidance)).toBe(mdOf('guidance'))

  // Last: reading a paper again replaces its answers, and the class report works on marked papers.
  const paper = mockReturning({ nameAsWritten: 'Amina', nameConfidence: 0.9, pageUsable: true, answers: [] })
  await sent(() => runJobReadPaper(ctxFor(base, baseEvent), baseEvent, { paperId: base.paperId }, { model: paper as never, prompt: mdOf('read_paper') }))
  expect(paper.doGenerateCalls.length, 'paper asked the model').toBeGreaterThan(0)
  expect(systemOf(paper)).toBe(mdOf('read_paper'))
})

test('baseline: write_lesson sends the text it was given (the system text also carries the schema, after it)', async () => {
  await db.from('gaps').insert({ child_id: base.aminaId, topic_id: null, topic_name: TOPIC, stage: 'new' })
  const plan = (await planNextSession.run(ctxFor(base, baseEvent), { childId: base.aminaId })) as { format: Lesson['format'] }
  const model = mockReturning(lesson(plan.format))
  await sent(() => runJobWriteLesson(ctxFor(base, baseEvent), baseEvent, { childId: base.aminaId }, { model: model as never, prompt: mdOf('write_lesson') }))
  expect(systemOf(model).startsWith(`${mdOf('write_lesson')}\n\nReply with one JSON object only`)).toBe(true)
})

// ---- a Grade 9 Natural Sciences class in Kenya ----------------------------------------------------------------------------

const LINE = 'Subject: Natural Sciences. Grade: 9. Country: Kenya.'

test('Kenya Grade 9 Natural Sciences: draft_map is told the subject, the grade and the family keys', async () => {
  await db.from('curriculum_maps').update({ status: 'draft', approved_at: null, draft: {} }).eq('id', kenya.mapId)
  const model = mockReturning({ draft: draft(9) })
  await runDraftMap(ctxFor(kenya, kenyaEvent), null, { mapId: kenya.mapId }, { getModel: () => model as never })
  const system = systemOf(model)
  expect(system.startsWith(`${LINE}\n\n`)).toBe(true)
  for (const key of ['life_living', 'matter_materials', 'energy_change', 'earth_beyond']) expect(system).toContain(key)
  expect(system).not.toMatch(/Grade 6|fraction|South Africa|decimal comma|\bR5\b|\brand\b/)
  expect(userOf(model)).toMatch(/^Class grade: 9\. Subject: Natural Sciences\. Draft the topic map for this grade and subject only\.\n\n<untrusted>\n/)
  // the saved draft still has to be the class grade
  const saved = await db.from('curriculum_maps').select('draft, status').eq('id', kenya.mapId).single()
  expect(saved.data!.status).toBe('draft')
  expect((saved.data!.draft as TopicMapDraft).grade).toBe(9)
})

test('Kenya Grade 9 Natural Sciences: the grade of the draft must still equal the class grade', async () => {
  await db.from('curriculum_maps').update({ status: 'draft', approved_at: null, draft: {} }).eq('id', kenya.mapId)
  const model = mockReturning({ draft: draft(6) })
  await expect(runDraftMap(ctxFor(kenya, kenyaEvent), null, { mapId: kenya.mapId }, { getModel: () => model as never })).rejects.toThrow(/grade/i)
})

test('Kenya Grade 9 Natural Sciences: read_key is told the class', async () => {
  await db.from('answer_keys').update({ status: 'draft', approved_at: null, items: [] }).eq('test_id', kenya.testId)
  const model = mockReturning({ items: [{ n: 1, prompt: 'q', answer: '1', marks: 1, topicName: TOPIC, confidence: 0.9 }] })
  await runReadKey(ctxFor(kenya, kenyaEvent), null, { testId: kenya.testId }, { getModel: () => model as never })
  const system = systemOf(model)
  expect(system.startsWith(`${LINE}\n\n`)).toBe(true)
  expect(system).not.toMatch(/fraction|decimal comma|\bR5\b|South Africa/)
  expect(system).toContain('Write numbers and money the way the memo writes them.')
  expect(userOf(model)).toContain('Approved topic names')
})

test('Kenya Grade 9 Natural Sciences: write_lesson is told the class, the country and the real grade', async () => {
  await db.from('gaps').insert({ child_id: kenya.aminaId, topic_id: null, topic_name: TOPIC, stage: 'new' })
  const plan = (await planNextSession.run(ctxFor(kenya, kenyaEvent), { childId: kenya.aminaId })) as { format: Lesson['format'] }
  const model = mockReturning(lesson(plan.format))
  await runJobWriteLesson(ctxFor(kenya, kenyaEvent), kenyaEvent, { childId: kenya.aminaId }, { model: model as never, prompt: mdOf('write_lesson') })
  const system = systemOf(model)
  expect(system.startsWith(`${LINE}\n\n`)).toBe(true)
  expect(system).toContain('for a school in Kenya')
  expect(system).toContain('for a Grade 9 child')
  expect(system).not.toMatch(/Grade 6|fraction|South Africa|decimal comma|\bR5\b|\brand\b|`R`/)
})

test('Kenya Grade 9 Natural Sciences: read_paper, diagnose, class_report and guidance are told the class', async () => {
  const diagnose = mockReturning({ diagnoses: [] })
  await sent(() => makeDiagnoseJob(mdOf('diagnose'), { model: diagnose as never })(ctxFor(kenya, kenyaEvent), kenyaEvent, { testId: kenya.testId, childId: kenya.aminaId }))
  const report = mockReturning({ why: 'w', missingBasic: 'm', explanation: 'e', reteach: { title: 't', minutes: 10, audience: 'a', youNeed: 'y', steps: [{ minutes: 10, text: 's' }], exitQuestion: 'q' } })
  await sent(() => makeClassReportJob(mdOf('class_report'), { model: report as never })(ctxFor(kenya, kenyaEvent), kenyaEvent, { classId: kenya.classId, testId: kenya.testId }))
  const guidance = mockReturning({ headline: 'h', focus: [], lookingAhead: 'l' })
  await sent(() => runGuidance(ctxFor(kenya, kenyaEvent), kenyaEvent, { childId: kenya.aminaId }, guidance as never))
  // Last: reading a paper again replaces its answers, and the class report works on marked papers.
  const paper = mockReturning({ nameAsWritten: 'Amina', nameConfidence: 0.9, pageUsable: true, answers: [] })
  await sent(() => runJobReadPaper(ctxFor(kenya, kenyaEvent), kenyaEvent, { paperId: kenya.paperId }, { model: paper as never, prompt: mdOf('read_paper') }))
  for (const [name, m] of [['read_paper', paper], ['diagnose', diagnose], ['class_report', report], ['guidance', guidance]] as const) {
    expect(m.doGenerateCalls.length, `${name} asked the model`).toBeGreaterThan(0)
    const system = systemOf(m)
    expect(system.startsWith(`${LINE}\n\n`), name).toBe(true)
    expect(system, name).not.toMatch(/Grade 6|fraction|South Africa|decimal comma|\bR5\b|\brand\b|`R`/)
  }
})

test('a job that renders its prompt gives the same text as renderPrompt for that class', async () => {
  const model = mockReturning({ diagnoses: [] })
  await sent(() => makeDiagnoseJob(mdOf('diagnose'), { model: model as never })(ctxFor(kenya, kenyaEvent), kenyaEvent, { testId: kenya.testId, childId: kenya.aminaId }))
  const klass = makeClassContext({ classId: kenya.classId, subject: 'Natural Sciences', grade: 9, country: 'KE' })
  expect(systemOf(model)).toBe(renderPrompt('diagnose', mdOf('diagnose'), klass))
  expect(PROMPT_JOBS).toContain('diagnose')
})
