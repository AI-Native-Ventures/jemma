import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { MockLanguageModelV4 } from 'ai/test'
import { describe, expect, test } from 'vitest'
import { MemoryStore } from '../../src/ai'
import { runDraftMap } from '../../src/jobs/cloud/draft-map'
import type { TopicMapDraft } from '../../src/schemas'
import type { ToolContext } from '../../src/tools/context'
import { memoryDb, type MemoryDb } from '../helpers/memory-db'

// The curriculum reader reads with the vision model first and exactly as it always did. Only when that fails or gives no topic,
// and the documents have a text layer, the text model is asked. These tests run the real job, the real tools and the real PDFs
// against a database in memory (no network), with a fake model.

const root = resolve(import.meta.dirname, '../../../..')
const pdf = (rel: string) => new Uint8Array(readFileSync(join(root, rel)))
const SAMPLE = 'fixtures/curriculum/grade6-maths-teaching-plan.pdf'
const GRADE9 = 'fixtures/curriculum/unseen/grade9-mathematics-za.pdf'
const KENYA = 'fixtures/curriculum/unseen/grade4-mathematics-ke.pdf'

const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } }
const answering = (value: unknown) =>
  new MockLanguageModelV4({ doGenerate: async () => ({ content: [{ type: 'text', text: JSON.stringify(value) }], finishReason: { unified: 'stop', raw: 'stop' }, usage, warnings: [] }) as never })
const failing = (message = 'Provider returned error', statusCode = 502) =>
  new MockLanguageModelV4({
    doGenerate: async () => {
      throw Object.assign(new Error(message), { statusCode })
    },
  })

const topic = (name: string, family = 'whole_numbers') => ({ name, family, prerequisites: [], misconceptions: [] })
const draftOf = (grade: number, terms: [1 | 2 | 3 | 4, string[]][]): TopicMapDraft => ({ grade, terms: terms.map(([term, names]) => ({ term, topics: names.map((n) => topic(n)) })), leftOut: [] })

type World = { db: MemoryDb; ctx: ToolContext; mapId: string }
/** A school, a class of this grade and subject, an empty draft map and one document: this PDF. */
function world(o: { grade: number; subject: string; country: string; file: string }): World {
  const schoolId = randomUUID()
  const classId = randomUUID()
  const mapId = randomUUID()
  const db = memoryDb(
    {
      schools: [{ id: schoolId, country: o.country }],
      classes: [{ id: classId, school_id: schoolId, teacher_id: randomUUID(), name: `${o.grade}A ${o.subject}`, grade: o.grade, subject: o.subject }],
      curriculum_maps: [{ id: mapId, class_id: classId, status: 'draft', draft: {} }],
      curriculum_docs: [{ class_id: classId, storage_path: 'plan.pdf', title: 'plan', pages: 4 }],
    },
    { curriculum: { 'plan.pdf': pdf(o.file) } },
  )
  return { db, mapId, ctx: { db, schoolId, eventId: null, env: { replayStore: new MemoryStore() }, now: () => new Date('2026-11-12T10:00:00Z') } }
}

const models = (vision: MockLanguageModelV4, text: MockLanguageModelV4) => ({ getModel: ((kind: string) => (kind === 'vision' ? vision : text)) as never })
const savedDraft = (w: World) => w.db.tables.curriculum_maps![0]!.draft as TopicMapDraft
const readLog = (w: World) => w.db.tables.tool_calls?.filter((r) => r.tool === 'read_documents') ?? []
const partsOf = (m: MockLanguageModelV4) => m.doGenerateCalls[0]!.prompt.find((p) => p.role === 'user')!.content as { type: string; text?: string; mediaType?: string }[]
const sha = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

/**
 * The whole first call (prompt and response format), fingerprinted. The value was made by the code as it was before this change
 * (develop at 78adafd) on this PDF and this class, and the code of this change made the same bytes, so a recorded answer is
 * still found. Change it only together with a new recording.
 */
const BASELINE_CALL_SHA = 'fca95e03807266435e0f81bc10047de9147db6bb3a31ce60000e9ea3c8f645f4'

describe('the first call is exactly the call a recorded answer was made with', () => {
  test('Mathematics, Grade 6, South Africa: the vision model gets the baseline header and the file, the text model is never asked', async () => {
    const w = world({ grade: 6, subject: 'Maths', country: 'ZA', file: SAMPLE })
    const vision = answering({ draft: draftOf(6, [[1, ['Adding fractions']], [2, ['Decimals']]]) })
    const text = answering({ draft: draftOf(6, [[1, ['Never used']]]) })
    await runDraftMap(w.ctx, null, { mapId: w.mapId }, models(vision, text))
    expect(vision.doGenerateCalls).toHaveLength(1)
    expect(text.doGenerateCalls).toHaveLength(0)
    const parts = partsOf(vision)
    expect(parts[0]).toMatchObject({ type: 'text', text: 'Class grade: 6. Draft the topic map for this grade only.\n\n<untrusted>\nThe documents follow as files.' })
    expect(parts[1]).toMatchObject({ type: 'file', mediaType: 'application/pdf' })
    expect(parts[2]).toMatchObject({ type: 'text', text: '</untrusted>' })
    const call = vision.doGenerateCalls[0]!
    expect(sha({ prompt: call.prompt, responseFormat: call.responseFormat })).toBe(BASELINE_CALL_SHA)
  })

  test('a vision answer with topics is used as it is, and the tool log says it was read with the vision model', async () => {
    const w = world({ grade: 6, subject: 'Maths', country: 'ZA', file: SAMPLE })
    const vision = answering({ draft: draftOf(6, [[1, ['Adding fractions', 'Comparing fractions']]]) })
    await runDraftMap(w.ctx, null, { mapId: w.mapId }, { getModel: (() => vision) as never })
    const log = readLog(w)
    expect(log).toHaveLength(1)
    expect(log[0]).toMatchObject({ tool: 'read_documents', ok: true, input: { way: 'vision', visionProblem: null, topics: 2, terms: 1 }, output: { way: 'vision', topics: 2, terms: 1 } })
  })
})

describe('when the vision model gives nothing and the document has a text layer', () => {
  test('the text model is asked with the same prompt and header and the words of the PDF, and the log says so', async () => {
    const w = world({ grade: 9, subject: 'Mathematics', country: 'ZA', file: GRADE9 })
    const vision = failing('Provider returned error')
    const text = answering({ draft: draftOf(9, [[1, ['Integers and exponents']], [2, ['Linear equations and inequalities']]]) })
    await runDraftMap(w.ctx, null, { mapId: w.mapId }, models(vision, text))
    expect(vision.doGenerateCalls).toHaveLength(1)
    expect(text.doGenerateCalls).toHaveLength(1)
    const asked = text.doGenerateCalls[0]!
    expect(asked.prompt.find((p) => p.role === 'system')).toEqual(vision.doGenerateCalls[0]!.prompt.find((p) => p.role === 'system'))
    const parts = partsOf(text)
    expect(parts).toHaveLength(1)
    expect(parts[0]!.type).toBe('text')
    expect(parts[0]!.text).toMatch(/^Class grade: 9\. Subject: Mathematics\. Draft the topic map for this grade and subject only\.\n\n<untrusted>\n/)
    expect(parts[0]!.text!.replace(/\s+/g, ' ')).toContain('Linear equations and inequalities')
    expect(parts[0]!.text).toMatch(/<\/untrusted>$/)
    expect(savedDraft(w).terms.map((t) => t.term)).toEqual([1, 2])
    expect(readLog(w)[0]).toMatchObject({ ok: true, input: { way: 'text', visionProblem: 'Provider returned error', documents: 1 } })
  })

  test('a vision answer with no topic also goes to the text model', async () => {
    const w = world({ grade: 9, subject: 'Mathematics', country: 'ZA', file: GRADE9 })
    const vision = answering({ draft: { grade: 9, terms: [], leftOut: [] } })
    const text = answering({ draft: draftOf(9, [[1, ['Integers and exponents']]]) })
    await runDraftMap(w.ctx, null, { mapId: w.mapId }, models(vision, text))
    expect(text.doGenerateCalls).toHaveLength(1)
    expect(readLog(w)[0]).toMatchObject({ input: { way: 'text', visionProblem: 'the vision model returned no topic' } })
  })

  test('the text model gives nothing either: the job fails and no map is saved', async () => {
    const w = world({ grade: 9, subject: 'Mathematics', country: 'ZA', file: GRADE9 })
    await expect(runDraftMap(w.ctx, null, { mapId: w.mapId }, models(failing('Provider returned error'), failing('Rate limit exceeded', 429)))).rejects.toThrow('Rate limit exceeded')
    expect(savedDraft(w)).toEqual({})
    expect(readLog(w)).toHaveLength(0)
  })
})

describe('a document without a text layer keeps the retry card', () => {
  test('vision fails on a scan: the error stays, the text model is never asked', async () => {
    const w = world({ grade: 4, subject: 'Mathematics', country: 'KE', file: KENYA })
    const vision = failing('This model is currently experiencing high demand', 503)
    const text = answering({ draft: draftOf(4, [[1, ['Never used']]]) })
    await expect(runDraftMap(w.ctx, null, { mapId: w.mapId }, models(vision, text))).rejects.toThrow('high demand')
    expect(text.doGenerateCalls).toHaveLength(0)
    expect(savedDraft(w)).toEqual({})
  })

  test('a vision answer with no topic on a scan keeps the plain error "draft has no topics"', async () => {
    const w = world({ grade: 4, subject: 'Mathematics', country: 'KE', file: KENYA })
    const text = answering({ draft: draftOf(4, [[1, ['Never used']]]) })
    await expect(runDraftMap(w.ctx, null, { mapId: w.mapId }, models(answering({ draft: { grade: 4, terms: [], leftOut: [] } }), text))).rejects.toThrow('draft has no topics')
    expect(text.doGenerateCalls).toHaveLength(0)
  })
})

describe('three terms stay three terms', () => {
  const three = (): TopicMapDraft => draftOf(4, [[1, ['Whole numbers up to 10 000']], [2, ['Division']], [3, ['Shapes: triangles, squares and circles']]])

  test('an empty fourth term from the model is dropped before the draft is saved, and the Needs you line says 3 terms', async () => {
    const w = world({ grade: 4, subject: 'Mathematics', country: 'KE', file: KENYA })
    const draft = three()
    const vision = answering({ draft: { ...draft, terms: [...draft.terms, { term: 4, topics: [] }] } })
    await runDraftMap(w.ctx, null, { mapId: w.mapId }, { getModel: (() => vision) as never })
    expect(savedDraft(w).terms.map((t) => t.term)).toEqual([1, 2, 3])
    expect(w.db.tables.needs_you_items![0]!.detail).toContain('3 topics in 3 terms')
    expect(readLog(w)[0]).toMatchObject({ output: { terms: 3, topics: 3 } })
  })

  test('the header for a class that is not the baseline names the subject and the grade', async () => {
    const w = world({ grade: 4, subject: 'Mathematics', country: 'KE', file: KENYA })
    const vision = answering({ draft: three() })
    await runDraftMap(w.ctx, null, { mapId: w.mapId }, { getModel: (() => vision) as never })
    expect(partsOf(vision)[0]!.text).toMatch(/^Class grade: 4\. Subject: Mathematics\. Draft the topic map for this grade and subject only\./)
  })
})
