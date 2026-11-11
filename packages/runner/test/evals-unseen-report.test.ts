import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { appendLedger, liveSpent, readLedger } from '../../../evals/lib/ledger'
import { loadUnseen, renderReport, writeReport, type PricingInfo, type ReportInput } from '../../../evals/lib/render'
import { baseName } from '../../../evals/lib/result'
import { TASKS } from '../../../evals/tasks'
import { freeModels, DEFAULT_MODELS } from '../../../evals/lib/unseen-models'
import { UNSEEN_FOLDER, type UnseenResult } from '../../../evals/lib/unseen'
import { result } from './evals-fixtures'

const tasks = TASKS.map((t) => ({ id: t.id, proves: t.proves }))
const mainResults = tasks.flatMap((t) => [1, 2, 3].map((n) => result(t.id, n)))
const price: PricingInfo = { fetchedAt: '2026-11-10', source: 'https://openrouter.ai/api/v1/models', models: {} }
const baseInput: ReportInput = { runId: '2026-11-10-full', results: mainResults, tasks, runs: 3, pricing: price, analysis: null, packetLiveRuns: 51 }

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'jemma-evals-unseen-'))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

const SCIENCE = 'grade9-natural-sciences-za'
const ENGLISH = 'grade5-english-za'
const KENYA = 'grade4-science-technology-ke'
const NO_ANSWER = 'Rate limit exceeded: Provider returned error.'

const tryOf = (docId: string, n: number, over: Partial<UnseenResult> = {}): UnseenResult => ({
  version: 1, runId: '2026-11-12-unseen', docId, n, attempt: 1, startedAt: '2026-11-12T08:00:00.000Z', verdict: 'pass', seconds: 60 + n * 10, calls: 1,
  way: 'vision', visionProblem: null, model: 'nvidia/nemotron-3.5-super-vl:free', error: null, noAnswer: null, checks: [], figures: null, draft: null, ...over,
})
const failCheck = { name: 'the map has the number of terms the document has', pass: false, detail: 'the document has 3 terms, the draft has terms 1, 2, 3, 4' }

/** Science: 3 passes. English: 1 pass, 1 fail, 1 text read. Kenya: 1 pass, 1 no answer after a repeat, 1 pass after a repeat. */
const tries = (): UnseenResult[] => [
  tryOf(SCIENCE, 1), tryOf(SCIENCE, 2), tryOf(SCIENCE, 3),
  tryOf(ENGLISH, 1), tryOf(ENGLISH, 2, { verdict: 'fail', checks: [failCheck] }), tryOf(ENGLISH, 3, { way: 'text', seconds: 200 }),
  tryOf(KENYA, 1),
  tryOf(KENYA, 2, { verdict: 'no_answer', way: null, noAnswer: NO_ANSWER, seconds: 15 }),
  tryOf(KENYA, 2, { attempt: 2, verdict: 'no_answer', way: null, noAnswer: NO_ANSWER, seconds: 16 }),
  tryOf(KENYA, 3, { verdict: 'no_answer', way: null, noAnswer: NO_ANSWER, seconds: 14 }),
  tryOf(KENYA, 3, { attempt: 2, seconds: 90 }),
]
const unseen = (over: Partial<NonNullable<ReportInput['unseen']>> = {}): ReportInput['unseen'] => ({
  runId: '2026-11-12-unseen',
  tries: tries(),
  stopped: null,
  models: { vision: 'nvidia/nemotron-3.5-super-vl:free', text: 'nvidia/nemotron-3.5-super-vl:free' },
  labels: { [SCIENCE]: 'Grade 9 Natural Sciences, South Africa', [ENGLISH]: 'Grade 5 English, South Africa', [KENYA]: 'Grade 4 Science and Technology, Kenya' },
  ...over,
})
const section = (text: string) => text.split('## A curriculum Jemma had never seen')[1]!.split('\n## ')[0]!

describe('the section "A curriculum Jemma had never seen"', () => {
  test('one row per document: runs, passes, no answers, median seconds, which way read it, what went wrong', () => {
    const rows = section(renderReport({ ...baseInput, unseen: unseen() })).split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| Document') && !l.startsWith('| ---'))
    expect(rows).toHaveLength(3)
    expect(rows[0]).toBe('| Grade 9 Natural Sciences, South Africa | 3 | 3 | 0 | 80 | vision | nothing: every run passed every check |')
    // English: 1 pass, 1 fail, a text read: median of 70, 80 and 200 is 80
    expect(rows[1]).toMatch(/^\| Grade 5 English, South Africa \| 3 \| 2 \| 0 \| 80 \| vision 2, text 1 \| run 2: the map has the number of terms the document has \(the document has 3 terms, the draft has terms 1, 2, 3, 4\) \|$/)
  })

  test('a run with no answer is not a fail, and a repeat replaces the try that got none', () => {
    const rows = section(renderReport({ ...baseInput, unseen: unseen() })).split('\n').filter((l) => l.startsWith('| Grade 4'))
    // Kenya: run 1 passed, run 2 got no answer twice (final: no answer), run 3 got no answer once and then passed
    expect(rows[0]).toMatch(/^\| Grade 4 Science and Technology, Kenya \| 3 \| 2 \| 1 \| 80 \| vision \| /)
    expect(rows[0]).toContain('one run got no answer from the free endpoint ("Rate limit exceeded: Provider returned error."), so it was not judged')
    expect(rows[0]).not.toContain('fail')
  })

  test('it says how many live runs were made, how many were repeats, and how many were read as text', () => {
    const text = section(renderReport({ ...baseInput, unseen: unseen() }))
    expect(text).toContain('11 live runs of the curriculum reader were made in all, 2 of them repeats of a run where the provider gave no answer.')
    expect(text).toContain('1 run was read from the text of the document')
    expect(text).toContain('(vision: `nvidia/nemotron-3.5-super-vl:free`; text: `nvidia/nemotron-3.5-super-vl:free`)')
    expect(text).toContain('`evals/results/unseen-curriculum/2026-11-12-unseen/`')
  })

  test('a script that stopped early says why', () => {
    const text = section(renderReport({ ...baseInput, unseen: unseen({ stopped: 'three runs in a row got no answer from the provider', tries: [tryOf(SCIENCE, 1)] }) }))
    expect(text).toContain('The script stopped early: three runs in a row got no answer from the provider.')
  })

  test('no section without a run, and a report without one is the same as before', () => {
    const none = renderReport(baseInput)
    expect(none).not.toContain('never seen')
    expect(renderReport({ ...baseInput, unseen: null })).toBe(none)
    expect(renderReport({ ...baseInput, unseen: { ...unseen()!, tries: [] } })).toBe(none)
  })

  test('the section comes after the main results and before the cost paragraph, and has no em dash', () => {
    const text = renderReport({ ...baseInput, unseen: unseen() })
    expect(text.indexOf('## Results')).toBeLessThan(text.indexOf('## A curriculum Jemma had never seen'))
    expect(text.indexOf('## A curriculum Jemma had never seen')).toBeLessThan(text.indexOf('## Cost'))
    expect(text.includes(String.fromCharCode(0x2014))).toBe(false)
  })
})

describe('reading the saved runs', () => {
  const write = (run: string, files: Record<string, unknown>) => {
    const dir = join(root, UNSEEN_FOLDER, run)
    mkdirSync(dir, { recursive: true })
    for (const [name, value] of Object.entries(files)) writeFileSync(join(dir, name), JSON.stringify(value))
  }

  test('the newest run folder is the one shown, with the models and the reason it stopped from run.json', () => {
    write('2026-11-11-old', { [`${SCIENCE}-1-1.json`]: tryOf(SCIENCE, 1, { runId: '2026-11-11-old' }) })
    write('2026-11-12-unseen', {
      [`${SCIENCE}-1-1.json`]: tryOf(SCIENCE, 1),
      [`${SCIENCE}-2-1.json`]: tryOf(SCIENCE, 2),
      'run.json': { stopped: 'the cap of 12 live runs was reached', models: { VISION_MODEL: 'v:free', LLM_MODEL: 't:free' } },
    })
    const got = loadUnseen(join(root, UNSEEN_FOLDER))!
    expect(got.runId).toBe('2026-11-12-unseen')
    expect(got.tries).toHaveLength(2)
    expect(got.stopped).toBe('the cap of 12 live runs was reached')
    expect(got.models).toEqual({ vision: 'v:free', text: 't:free' })
    expect(got.labels[SCIENCE]).toBe('Grade 9 Natural Sciences, South Africa')
  })

  test('no folder, or an empty one, is no run', () => {
    expect(loadUnseen(join(root, UNSEEN_FOLDER))).toBeNull()
    mkdirSync(join(root, UNSEEN_FOLDER))
    expect(loadUnseen(join(root, UNSEEN_FOLDER))).toBeNull()
  })

  test('a result file that is not one is refused, with its name', () => {
    write('2026-11-12-unseen', { [`${SCIENCE}-1-1.json`]: { hello: 1 } })
    expect(() => loadUnseen(join(root, UNSEEN_FOLDER))).toThrow(/version/)
  })

  test('writeReport finds the runs next to the main run, and writing twice gives the same bytes', async () => {
    const dir = join(root, '2026-11-10-full')
    mkdirSync(dir, { recursive: true })
    for (const t of tasks) {
      for (let n = 1; n <= 3; n++) {
        writeFileSync(join(dir, `${baseName(t.id, n)}.json`), JSON.stringify(result(t.id, n, { runId: '2026-11-10-full' })))
        writeFileSync(join(dir, `${baseName(t.id, n)}.jsonl`), '{}\n')
      }
    }
    write('2026-11-12-unseen', Object.fromEntries(tries().map((t) => [`${t.docId}-${t.n}-${t.attempt}.json`, t])))
    const ledger = join(root, 'ledger.jsonl')
    writeFileSync(ledger, '')
    const out = join(root, 'EVALS.md')
    const options = { runId: '2026-11-10-full', resultsRoot: root, outFile: out, ledgerFile: ledger, fetchFn: (async () => new Response('{}')) as typeof fetch }
    const first = await writeReport(options)
    const bytes = readFileSync(out)
    expect(first).toContain('## A curriculum Jemma had never seen')
    expect(first).not.toContain('A second open-weights model')
    const second = await writeReport(options)
    expect(second).toBe(first)
    expect(readFileSync(out).equals(bytes)).toBe(true)
  })
})

describe('the ledger counts the curriculum reader apart from goose', () => {
  test('each kind has its own total, and a line written before the field existed is a goose line', () => {
    const file = join(root, 'ledger.jsonl')
    appendLedger({ at: 'a', runId: 'r', taskId: 'class-report', n: 1, attempts: 3, rehearsal: false }, file)
    appendLedger({ at: 'b', runId: 'r', taskId: 'class-report', n: 2, attempts: 2, rehearsal: false, kind: 'goose' }, file)
    appendLedger({ at: 'c', runId: 'u', taskId: 'draft_map:grade5-english-za', n: 1, attempts: 1, rehearsal: false, kind: 'draft_map' }, file)
    appendLedger({ at: 'd', runId: 'u', taskId: 'draft_map:grade5-english-za', n: 2, attempts: 1, rehearsal: true, kind: 'draft_map' }, file)
    expect(readLedger(file)).toHaveLength(4)
    expect(liveSpent(file)).toBe(5)
    expect(liveSpent(file, 'goose')).toBe(5)
    expect(liveSpent(file, 'draft_map')).toBe(1)
  })

  test('the goose total in EVALS.md leaves the curriculum reader runs out', async () => {
    const dir = join(root, '2026-11-10-full')
    mkdirSync(dir, { recursive: true })
    for (const t of tasks) {
      for (let n = 1; n <= 3; n++) {
        writeFileSync(join(dir, `${baseName(t.id, n)}.json`), JSON.stringify(result(t.id, n, { runId: '2026-11-10-full' })))
        writeFileSync(join(dir, `${baseName(t.id, n)}.jsonl`), '{}\n')
      }
    }
    const ledger = join(root, 'ledger.jsonl')
    appendLedger({ at: 'a', runId: 'r', taskId: 'class-report', n: 1, attempts: 42, rehearsal: false }, ledger)
    appendLedger({ at: 'c', runId: 'u', taskId: 'draft_map:x', n: 1, attempts: 12, rehearsal: false, kind: 'draft_map' }, ledger)
    const text = await writeReport({ runId: '2026-11-10-full', resultsRoot: root, outFile: join(root, 'EVALS.md'), ledgerFile: ledger, fetchFn: (async () => new Response('{}')) as typeof fetch })
    expect(text).toContain('42 live goose runs were spent in all for this work, harness testing included (cap 45).')
  })
})

describe('only free models are used for the live runs', () => {
  test('the defaults are free OpenRouter ids', () => {
    expect(freeModels({})).toEqual(DEFAULT_MODELS)
    for (const list of Object.values(DEFAULT_MODELS)) for (const id of list.split(',')) expect(id.endsWith(':free')).toBe(true)
  })

  test('the environment may change them, but a model that is not free is refused', () => {
    expect(freeModels({ VISION_MODEL: 'google/gemma-4-31b-it:free' }).VISION_MODEL).toBe('google/gemma-4-31b-it:free')
    expect(() => freeModels({ LLM_MODEL: 'anthropic/claude-sonnet-5-5' })).toThrow(/only free models/)
    expect(() => freeModels({ VISION_MODEL_FALLBACKS: 'a/b:free, c/d' })).toThrow(/c\/d/)
  })
})
