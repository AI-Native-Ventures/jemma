import { env as rawEnv } from 'cloudflare:test'
import { afterAll, beforeAll, expect, test, vi } from 'vitest'
import { createServiceClient } from '@jemma/profiling/db'
import { documentsText, readPdfText } from '../../../packages/profiling/src/ai/pdf-text'
import { runDraftMap } from '../../../packages/profiling/src/jobs/cloud/draft-map'
import type { Env } from '../src/index'
import { processEvent } from '../src/consumer'
import { createSandbox, type Sandbox } from '../../../packages/profiling/test/helpers/sandbox'

// The text reader of the curriculum job (`unpdf`) in the Worker runtime itself: these tests run in workerd, not in Node.
// A small PDF with a text layer is made in code (no file system here), the job asks a fake vision model that gives no answer,
// and the text model reads what `unpdf` took out of the PDF.
// The database is shared with other workers and answers in seconds, not milliseconds, when they run their suites.
vi.setConfig({ testTimeout: 300_000, hookTimeout: 300_000 })
const testEnv = rawEnv as unknown as Env
const env = { ...testEnv, AI_MODE: 'live', EVENTS_QUEUE: { send: vi.fn(async () => {}) } } as never as Parameters<typeof processEvent>[0]
const db = createServiceClient({ SUPABASE_URL: testEnv.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: testEnv.SUPABASE_SERVICE_ROLE_KEY })
const tag = `uc${Date.now()}`
let sb: Sandbox

const LINES = [
  'Annual Teaching Plan 2026 for Grade 9 Mathematics in South Africa',
  'Term 1 Integers and exponents and rational and irrational numbers',
  'Term 2 Linear equations and inequalities and number patterns and ratio',
  'Term 3 Financial mathematics and functions and graphs and angles and triangles',
  'Term 4 Pythagoras and surface area and volume and mean median and probability',
  'Learners practise with a task in every term of the school year',
]

/** A one page PDF with a text layer, written by hand: objects, a cross reference table and a trailer. */
function textPdf(lines: string[]): Uint8Array {
  const content = `BT /F1 11 Tf 40 780 Td 16 TL ${lines.map((l) => `(${l.replace(/[()\\]/g, '')}) Tj T*`).join(' ')} ET`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((body, i) => {
    offsets.push(out.length)
    out += `${i + 1} 0 obj\n${body}\nendobj\n`
  })
  const xref = out.length
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return new TextEncoder().encode(out)
}
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))

/** A language model made by hand (the test helpers of the `ai` package are not reachable from the Worker test project). */
function fakeModel(handler: (options: unknown) => unknown) {
  const calls: { prompt: unknown }[] = []
  return {
    specificationVersion: 'v4' as const,
    provider: 'fake',
    modelId: 'fake',
    supportedUrls: {},
    calls,
    doGenerate: async (options: { prompt: unknown }) => {
      calls.push(options)
      return handler(options)
    },
    doStream: async () => {
      throw new Error('not used')
    },
  }
}
const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } }
const answering = (value: unknown) => fakeModel(() => ({ content: [{ type: 'text', text: JSON.stringify(value) }], finishReason: { unified: 'stop', raw: 'stop' }, usage, warnings: [] }))

beforeAll(async () => {
  sb = await createSandbox(db, tag)
})
afterAll(async () => {
  await db.storage.from('curriculum').remove([`${tag}/plan.pdf`])
  await sb?.cleanup()
})

test('unpdf reads the text layer of a PDF inside the Worker runtime', async () => {
  const pdf = textPdf(LINES)
  const read = await readPdfText(pdf)
  expect(read.pages).toBe(1)
  expect(read.text.replace(/\s+/g, ' ')).toContain('Linear equations and inequalities')
  const text = await documentsText([{ data: base64(pdf), mimeType: 'application/pdf' }])
  expect(text).toContain('Financial mathematics and functions and graphs')
})

test('a picture-only PDF has no text in the Worker runtime either', async () => {
  const empty = textPdf([])
  expect(await documentsText([{ data: base64(empty), mimeType: 'application/pdf' }])).toBeNull()
})

test('an event whose vision call gets no answer is read as text, in the Worker, and the tool log says so', async () => {
  await db.from('classes').update({ grade: 9, subject: 'Mathematics' }).eq('id', sb.classId)
  await db.from('curriculum_maps').update({ status: 'draft', approved_at: null, draft: {} }).eq('id', sb.mapId)
  await db.from('curriculum_docs').delete().eq('class_id', sb.classId)
  const path = `${tag}/plan.pdf`
  const up = await db.storage.from('curriculum').upload(path, textPdf(LINES), { contentType: 'application/pdf', upsert: true })
  if (up.error) throw up.error
  await db.from('curriculum_docs').insert({ class_id: sb.classId, storage_path: path, title: 'plan', pages: 1 })
  await db.from('tool_calls').delete().eq('school_id', sb.schoolId)

  const vision = fakeModel(() => {
    throw Object.assign(new Error('Provider returned error'), { statusCode: 502 })
  })
  const text = answering({
    draft: { grade: 9, terms: [{ term: 1, topics: [{ name: 'Integers and exponents', family: 'whole_numbers', prerequisites: [], misconceptions: [] }] }], leftOut: [] },
  })
  const event = await db.from('events').insert({ school_id: sb.schoolId, type: 'curriculum.uploaded', payload: { type: 'curriculum.uploaded', mapId: sb.mapId } }).select('id').single()
  if (event.error) throw event.error
  await processEvent(env, event.data.id, {
    draft_map: (ctx, eventId, ids) => runDraftMap(ctx, eventId, ids, { getModel: ((kind: string) => (kind === 'vision' ? vision : text)) as never }),
  })

  const row = await db.from('events').select('status, error').eq('id', event.data.id).single()
  expect(row.data).toMatchObject({ status: 'done', error: null })
  expect(text.calls).toHaveLength(1)
  const asked = JSON.stringify(text.calls[0]!.prompt)
  expect(asked).toContain('Linear equations and inequalities')
  const log = await db.from('tool_calls').select('input, ok').eq('school_id', sb.schoolId).eq('tool', 'read_documents')
  expect(log.data).toHaveLength(1)
  expect(log.data![0]).toMatchObject({ ok: true, input: { way: 'text', visionProblem: 'Provider returned error' } })
})
