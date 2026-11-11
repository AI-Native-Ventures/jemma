import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { MockLanguageModelV4 } from 'ai/test'
import { describe, expect, test } from 'vitest'
import { readPdfText } from '../src/ai/pdf-text'
import { memoryDb, type MemoryDb } from './helpers/memory-db'
import { loadTruth, perfectDraft, type Truth } from '../../../evals/lib/unseen'
import { networkProblem, noAnswerReason, runOnce } from '../../../evals/lib/unseen-run'


// The live script of "A curriculum Jemma had never seen", with a fake model and a database in memory: the real school, class,
// upload, job, tool log, scoring and clean-up, no live call and no network. It shows that a live run fails only for reasons about
// the model. (The real database is tried in evals-unseen-fixture.test.ts.)

const root = resolve(import.meta.dirname, '../../..')

const science = loadTruth('grade9-natural-sciences-za')
const kenya = loadTruth('grade4-science-technology-ke')
const fileOf = (t: Truth) => new Uint8Array(readFileSync(join(root, 'fixtures/curriculum/unseen', t.file)))
const aiEnv = { LLM_PROVIDER: 'openrouter', VISION_PROVIDER: 'openrouter', LLM_MODEL: 'text:free', VISION_MODEL: 'vision:free', OPENROUTER_API_KEY: 'not-a-key' }

const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } }
const answering = (value: unknown) =>
  new MockLanguageModelV4({ doGenerate: async () => ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }], finishReason: { unified: 'stop', raw: 'stop' }, usage, warnings: [] }) as never })
const failing = (message: string, statusCode: number) =>
  new MockLanguageModelV4({
    doGenerate: async () => {
      throw Object.assign(new Error(message), { statusCode })
    },
  })
const models = (vision: MockLanguageModelV4, text: MockLanguageModelV4) => ((kind: string) => (kind === 'vision' ? vision : text)) as never

let db: MemoryDb
async function run(truth: Truth, getModel: never, n = 1) {
  db = memoryDb()
  const pages = (await readPdfText(fileOf(truth))).pages
  return runOnce({ db, aiEnv, getModel, truth, bytes: fileOf(truth), pages, runId: 'test-run', n, attempt: 1 })
}
/** Nothing the run made is left: no school, no class, no teacher, no file. */
const nothingLeft = () => {
  expect(db.tables.schools ?? []).toEqual([])
  expect(db.users.size).toBe(0)
  expect(Object.values(db.files.curriculum ?? {})).toEqual([])
}

describe('one live run, with a fake model', () => {
  test('a perfect draft from the vision model passes, is read by vision, makes one call, and leaves nothing behind', async () => {
    const vision = answering({ draft: perfectDraft(science) })
    const text = answering({ draft: perfectDraft(science) })
    const got = await run(science, models(vision, text))
    expect(got).toMatchObject({ verdict: 'pass', way: 'vision', calls: 1, error: null, noAnswer: null, docId: science.id, n: 1, attempt: 1, visionProblem: null })
    expect(got.checks.every((c) => c.pass)).toBe(true)
    expect(got.figures).toMatchObject({ found: 15, of: 15, invented: 0 })
    expect(text.doGenerateCalls).toHaveLength(0)
    nothingLeft()
  })

  test('when vision gives nothing the text model reads the typed PDF: two calls, read by text, and the reason is kept', async () => {
    const vision = failing('Provider returned error', 502)
    const text = answering({ draft: perfectDraft(science) })
    const got = await run(science, models(vision, text))
    expect(got).toMatchObject({ verdict: 'pass', way: 'text', calls: 2, visionProblem: 'Provider returned error' })
    nothingLeft()
  })

  test('a scan that the provider would not answer is "no answer", not a fail, and the error is not kept as a failure', async () => {
    const vision = failing('Rate limit exceeded: free-models-per-min', 429)
    const text = answering({ draft: perfectDraft(kenya) })
    const got = await run(kenya, models(vision, text))
    expect(got).toMatchObject({ verdict: 'no_answer', calls: 1, way: null, error: null, draft: null })
    expect(got.noAnswer).toContain('Rate limit exceeded')
    expect(text.doGenerateCalls).toHaveLength(0)
    nothingLeft()
  })

  test('a fetch that never got an answer is a failure of this Mac\'s network: marked as such, not judged, not a provider no answer', async () => {
    const down = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new TypeError('fetch failed')
      },
    })
    const got = await run(kenya, models(down, down))
    expect(got).toMatchObject({ verdict: 'no_answer', noAnswer: null, error: null, draft: null })
    expect(got.machineNetwork).toBe('fetch failed')
    nothingLeft()
  })

  test('a model that answers for the wrong number of terms fails the check, and the job drops an empty fourth term first', async () => {
    const good = perfectDraft(kenya)
    const four = { ...good, terms: [...good.terms, { term: 4, topics: [{ name: 'Weather and seasons', family: 'weather', prerequisites: [], misconceptions: [] }] }] }
    const failed = await run(kenya, models(answering({ draft: four }), answering({ draft: good })))
    expect(failed.verdict).toBe('fail')
    expect(failed.checks.find((c) => c.name.includes('number of terms'))).toMatchObject({ pass: false })
    const empty = await run(kenya, models(answering({ draft: { ...good, terms: [...good.terms, { term: 4, topics: [] }] } }), answering({ draft: good })))
    expect(empty).toMatchObject({ verdict: 'pass' })
    expect(empty.figures?.termsInDraft).toEqual([1, 2, 3])
  })

  test('a model that answers in the wrong shape is a fail with the error, not a no answer', async () => {
    const got = await run(science, models(answering('this is not json'), answering('still not json')))
    expect(got.verdict).toBe('fail')
    expect(got.noAnswer).toBeNull()
    expect(got.error).toBeTruthy()
    expect(got.calls).toBe(2)
    nothingLeft()
  })

  test('a draft for the wrong grade is refused by the save tool, which is a fail of the model, not of the harness', async () => {
    const wrong = { ...perfectDraft(science), grade: 8 }
    const got = await run(science, models(answering({ draft: wrong }), answering({ draft: wrong })))
    expect(got.verdict).toBe('fail')
    expect(got.error).toContain('does not match the class grade')
  })
})

describe('what counts as the provider giving no answer', () => {
  const e = (message: string, extra: object = {}) => Object.assign(new Error(message), extra)
  test('a 429, a 5xx, a rate limit and a capacity message are no answer, and the retry wrapper words are cut', () => {
    expect(noAnswerReason(e('x', { statusCode: 429 }))).toBe('x')
    expect(noAnswerReason(e('Server error', { statusCode: 503 }))).toBe('Server error')
    expect(noAnswerReason(e('Rate limit exceeded: Provider returned error.'))).toBe('Rate limit exceeded: Provider returned error.')
    expect(noAnswerReason(e('Failed after 3 attempts. Last error: This model is currently experiencing high demand.'))).toBe('This model is currently experiencing high demand.')
  })
  test('it looks inside the cause and the last error', () => {
    expect(noAnswerReason(e('wrapper', { cause: e('Provider returned error', { statusCode: 502 }) }))).toBe('Provider returned error')
    expect(noAnswerReason(e('wrapper', { lastError: e('overloaded') }))).toBe('overloaded')
  })
  test('a wrong shape, a bad request, a missing topic or nothing at all is not', () => {
    expect(noAnswerReason(e('No object generated: response did not match schema'))).toBeNull()
    expect(noAnswerReason(e('bad', { statusCode: 400 }))).toBeNull()
    expect(noAnswerReason(e('draft has no topics'))).toBeNull()
    expect(noAnswerReason(null)).toBeNull()
    expect(noAnswerReason('text')).toBeNull()
  })
})

describe('what counts as a failure of this machine\'s network', () => {
  const e = (message: string, extra: object = {}) => Object.assign(new Error(message), extra)
  test('a dropped connection, a lookup that failed and a fetch that never got an answer are the network, and a provider answer is not', () => {
    expect(networkProblem(e('Cannot connect to API: fetch failed'))).toBe('Cannot connect to API: fetch failed')
    expect(networkProblem(e('wrapper', { cause: e('fetch failed', { cause: Object.assign(new Error('getaddrinfo ENOTFOUND openrouter.ai'), { code: 'ENOTFOUND' }) }) }))).toContain('ENOTFOUND')
    expect(networkProblem(e('Failed after 3 attempts. Last error: read ECONNRESET'))).toBe('read ECONNRESET')
    expect(networkProblem(e('wrapper', { lastError: e('The network connection was lost') }))).toBe('The network connection was lost')
    expect(networkProblem(e('Rate limit exceeded', { statusCode: 429 }))).toBeNull()
    expect(networkProblem(e('fetch failed', { statusCode: 503 }))).toBeNull()
    expect(networkProblem(e('Provider returned error'))).toBeNull()
    expect(networkProblem(e('draft has no topics'))).toBeNull()
    expect(networkProblem(null)).toBeNull()
  })
  test('a fetch that failed is no longer a provider no-answer', () => {
    expect(noAnswerReason(e('fetch failed'))).toBeNull()
  })
})
