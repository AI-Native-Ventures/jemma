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

const GRADE9 = 'grade9-mathematics-za'
const GRADE5 = 'grade5-mathematics-za'
const KENYA = 'grade4-mathematics-ke'
// the three earlier documents, outside Mathematics
const SCIENCE = 'grade9-natural-sciences-za'
const ENGLISH = 'grade5-english-za'
const SCITECH = 'grade4-science-technology-ke'
const NO_ANSWER = 'Rate limit exceeded: Provider returned error.'

const tryOf = (docId: string, n: number, over: Partial<UnseenResult> = {}): UnseenResult => ({
  version: 1, runId: '2026-11-12-unseen', docId, n, attempt: 1, startedAt: '2026-11-12T08:00:00.000Z', verdict: 'pass', seconds: 60 + n * 10, calls: 1,
  way: 'vision', visionProblem: null, model: 'nvidia/nemotron-3.5-super-vl:free', error: null, noAnswer: null, checks: [], figures: null, draft: null, ...over,
})
const failCheck = { name: 'the map has the number of terms the document has', pass: false, detail: 'the document has 3 terms, the draft has terms 1, 2, 3, 4' }

/** Grade 9: 3 passes. Grade 5: 1 pass, 1 fail, 1 text read. Kenya: 1 pass, 1 no answer after a repeat, 1 pass after a repeat. */
const tries = (): UnseenResult[] => [
  tryOf(GRADE9, 1), tryOf(GRADE9, 2), tryOf(GRADE9, 3),
  tryOf(GRADE5, 1), tryOf(GRADE5, 2, { verdict: 'fail', checks: [failCheck] }), tryOf(GRADE5, 3, { way: 'text', seconds: 200 }),
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
  labels: { [GRADE9]: 'Grade 9 Mathematics, South Africa', [GRADE5]: 'Grade 5 Mathematics, South Africa', [KENYA]: 'Grade 4 Mathematics, Kenya' },
  ...over,
})
const section = (text: string) => text.split('## A curriculum Jemma had never seen')[1]!.split('\n## ')[0]!

describe('the section "A curriculum Jemma had never seen"', () => {
  test('one row per document: runs, passes, no answers, median seconds, which way read it, what went wrong', () => {
    const rows = section(renderReport({ ...baseInput, unseen: unseen() })).split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| Document') && !l.startsWith('| ---'))
    expect(rows).toHaveLength(3)
    expect(rows[0]).toBe('| Grade 9 Mathematics, South Africa | 3 | 3 | 0 | 80 | vision | run 1: no draft, run 2: no draft, run 3: no draft | nothing: every run passed every check |')
    // English: 1 pass, 1 fail, a text read: median of 70, 80 and 200 is 80
    expect(rows[1]).toMatch(/^\| Grade 5 Mathematics, South Africa \| 3 \| 2 \| 0 \| 80 \| vision 2, text 1 \| run 1: no draft, run 2: no draft, run 3: no draft \| run 2: the map has the number of terms the document has \(the document has 3 terms, the draft has terms 1, 2, 3, 4\) \|$/)
  })

  test('a run with no answer is not a fail, and a repeat replaces the try that got none', () => {
    const rows = section(renderReport({ ...baseInput, unseen: unseen() })).split('\n').filter((l) => l.startsWith('| Grade 4'))
    // Kenya: run 1 passed, run 2 got no answer twice (final: no answer), run 3 got no answer once and then passed
    expect(rows[0]).toMatch(/^\| Grade 4 Mathematics, Kenya \| 3 \| 2 \| 1 \| 80 \| vision \| /)
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

  test('tries lost to this Mac\'s network are not counted as live runs or as repeats, and are told apart', () => {
    const lost = (attempt: number) => tryOf(KENYA, 3, { attempt, verdict: 'no_answer', calls: 0, way: null, model: null, seconds: 0, machineNetwork: 'teacher: fetch failed' })
    const text = section(renderReport({ ...baseInput, unseen: unseen({ tries: [tryOf(SCIENCE, 1), tryOf(KENYA, 1), tryOf(KENYA, 2), lost(1), lost(2), lost(3), tryOf(KENYA, 3, { attempt: 4 })] }) }))
    expect(text).toContain('4 live runs of the curriculum reader were made in all.')
    expect(text).not.toContain('repeats of a run')
    expect(text).toContain('3 more tries never got past this Mac\'s own network (not the provider), so they were not counted and no model was asked.')
  })

  test('for each run it says who asked about the topic listed in two terms: the model, code or nobody, and says that code can ask', () => {
    const asked = (by: 'model' | 'code' | 'none') => ({ twoTermsAskedBy: by, codeQuestions: by === 'code' ? 2 : 0, draft: { grade: 9, terms: [], leftOut: [] } })
    const text = section(renderReport({ ...baseInput, unseen: unseen({ tries: [tryOf(GRADE9, 1, asked('code')), tryOf(GRADE9, 2, asked('model')), tryOf(GRADE9, 3, { ...asked('none'), verdict: 'fail', checks: [failCheck] })] }) }))
    const row = text.split('\n').find((l) => l.startsWith('| Grade 9'))!
    expect(row).toContain('| run 1: code, run 2: the model, run 3: nobody |')
    expect(text).toContain('| Who asked about the topic listed in two terms |')
    expect(text).toContain('The question about a topic that the plan lists in two terms can come from code: when the model keeps such a topic in both terms and asks nothing, the step that saves the map adds the question "Listed in Term X and Term Y. Which term is it taught in?" and writes in the tool log how many it added.')
    // a result from before the figure existed, with a draft, says it was not recorded
    const old = section(renderReport({ ...baseInput, unseen: unseen({ tries: [tryOf(GRADE9, 1, { draft: { grade: 9, terms: [], leftOut: [] } })] }) }))
    expect(old).toContain('| run 1: not recorded |')
  })

  test('the family words that were not in the Mathematics list are named, with the number of runs that used them', () => {
    const figures = (extraFamilies: string[]) => ({ found: 14, of: 14, invented: 0, drafted: 14, rightTerm: 14, termsInDraft: [1, 2, 3, 4], extraFamilies })
    const text = section(renderReport({ ...baseInput, unseen: unseen({ tries: [tryOf(GRADE9, 1, { figures: figures(['algebra', 'geometry']) }), tryOf(GRADE9, 2, { figures: figures(['algebra']) }), tryOf(GRADE9, 3, { figures: figures([]) })] }) }))
    expect(text).toContain('Family words outside the Mathematics list (whole_numbers, fractions, decimals, shapes, measurement, data) that the scorer accepted as one or two short lowercase words: algebra (2 runs), geometry (1 run).')
    // none used: said, so the reader knows it was looked at; runs from before the figure existed say nothing
    const none = section(renderReport({ ...baseInput, unseen: unseen({ tries: [tryOf(GRADE9, 1, { figures: figures([]) })] }) }))
    expect(none).toContain('Every family word was in the Mathematics list.')
    expect(section(renderReport({ ...baseInput, unseen: unseen({ tries: [tryOf(GRADE9, 1)] }) }))).not.toContain('Family words')
  })

  describe('Outside Mathematics', () => {
    const outside = (over: Partial<NonNullable<NonNullable<ReportInput['unseen']>['outside']>> = {}) => ({
      runId: '2026-11-11-18-26-unseen',
      tries: [
        tryOf(SCIENCE, 1), tryOf(SCIENCE, 2), tryOf(SCIENCE, 3),
        tryOf(ENGLISH, 1, { verdict: 'fail', checks: [failCheck] }), tryOf(ENGLISH, 2, { verdict: 'fail', checks: [failCheck] }), tryOf(ENGLISH, 3, { verdict: 'fail', checks: [failCheck] }),
        tryOf(SCITECH, 1, { verdict: 'fail', checks: [failCheck] }),
        tryOf(SCITECH, 2, { verdict: 'fail', error: 'Failed to process successful response', way: null, model: null }),
        tryOf(SCITECH, 3, { verdict: 'no_answer', calls: 0, way: null, model: null, seconds: 0, machineNetwork: 'teacher: fetch failed' }),
        tryOf(SCITECH, 3, { attempt: 2, verdict: 'no_answer', calls: 0, way: null, model: null, seconds: 0, machineNetwork: 'teacher: fetch failed' }),
      ],
      labels: { [SCIENCE]: 'Grade 9 Natural Sciences, South Africa', [ENGLISH]: 'Grade 5 English, South Africa', [SCITECH]: 'Grade 4 Science and Technology, Kenya' },
      ...over,
    })
    const paragraph = (text: string) => text.split('### Outside Mathematics (not part of what Jemma claims today)')[1]!.split('\n## ')[0]!.trim()

    test('one short paragraph under the section: why they are there, and the numbers as they are', () => {
      const text = paragraph(section(renderReport({ ...baseInput, unseen: unseen({ outside: outside() }) })))
      expect(text).toContain('The first version of Jemma covers Mathematics only')
      expect(text).toContain('Grade 9 Natural Sciences, South Africa 3 of 3')
      expect(text).toContain('Grade 5 English, South Africa 0 of 3')
      expect(text).toContain('Grade 4 Science and Technology, Kenya 0 of 2 judged runs (one run never reached a model because this Mac\'s own network failed)')
      expect(text.split('\n\n')).toHaveLength(1)
    })

    test('an error with no body kept is said plainly: a fail, and nobody can tell the model from the provider', () => {
      const text = paragraph(section(renderReport({ ...baseInput, unseen: unseen({ outside: outside() }) })))
      expect(text).toContain('One run ended on the error "Failed to process successful response". The body of that answer was not kept, so nobody can tell whether the model or the provider was at fault. It counts as a fail.')
    })

    test('an error whose body was kept does not get that sentence', () => {
      const kept = outside({ tries: [tryOf(SCITECH, 1, { verdict: 'fail', error: 'Failed to process successful response; HTTP 200, body starts: {"id":"x"}', way: null, model: null })] })
      expect(paragraph(section(renderReport({ ...baseInput, unseen: unseen({ outside: kept }) })))).not.toContain('was not kept')
    })

    test('the paragraph is written below the main table, also when there is no Mathematics run yet', () => {
      const withBoth = section(renderReport({ ...baseInput, unseen: unseen({ outside: outside() }) }))
      expect(withBoth.indexOf('| Document |')).toBeLessThan(withBoth.indexOf('### Outside Mathematics'))
      const only = section(renderReport({ ...baseInput, unseen: unseen({ tries: [], outside: outside() }) }))
      expect(only).toContain('No run on the Mathematics documents has been made yet.')
      expect(only).toContain('### Outside Mathematics (not part of what Jemma claims today)')
      expect(only).not.toContain('| Document |')
    })

    test('no outside run, no paragraph', () => {
      expect(section(renderReport({ ...baseInput, unseen: unseen() }))).not.toContain('Outside Mathematics')
    })

    test('the outside runs are not counted in the live runs of the main run', () => {
      const text = section(renderReport({ ...baseInput, unseen: unseen({ outside: outside() }) }))
      expect(text).toContain('11 live runs of the curriculum reader were made in all')
    })
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

  test('the newest run folder with Mathematics documents is the one shown, with the models and the reason it stopped from run.json', () => {
    write('2026-11-11-old-maths', { [`${GRADE9}-1-1.json`]: tryOf(GRADE9, 1, { runId: '2026-11-11-old-maths' }) })
    write('2026-11-12-unseen', {
      [`${GRADE9}-1-1.json`]: tryOf(GRADE9, 1),
      [`${GRADE9}-2-1.json`]: tryOf(GRADE9, 2),
      'run.json': { stopped: 'the cap of 12 live runs was reached', models: { VISION_MODEL: 'v:free', LLM_MODEL: 't:free' } },
    })
    const got = loadUnseen(join(root, UNSEEN_FOLDER))!
    expect(got.runId).toBe('2026-11-12-unseen')
    expect(got.tries).toHaveLength(2)
    expect(got.stopped).toBe('the cap of 12 live runs was reached')
    expect(got.models).toEqual({ vision: 'v:free', text: 't:free' })
    expect(got.labels[GRADE9]).toBe('Grade 9 Mathematics, South Africa')
    expect(got.outside).toBeNull()
  })

  test('an earlier run on documents outside Mathematics is kept apart: not in the main tries, with its own labels', () => {
    write('2026-11-11-18-26-unseen', {
      [`${SCIENCE}-1-1.json`]: tryOf(SCIENCE, 1, { runId: '2026-11-11-18-26-unseen' }),
      [`${ENGLISH}-1-1.json`]: tryOf(ENGLISH, 1, { runId: '2026-11-11-18-26-unseen', verdict: 'fail' }),
      [`${SCITECH}-3-1.json`]: tryOf(SCITECH, 3, { runId: '2026-11-11-18-26-unseen', verdict: 'no_answer', calls: 0, way: null, machineNetwork: 'teacher: fetch failed' }),
      'run.json': { stopped: 'this Mac\'s network failed three times in a row', models: { VISION_MODEL: 'old-v:free', LLM_MODEL: 'old-t:free' } },
    })
    write('2026-11-12-unseen', { [`${GRADE9}-1-1.json`]: tryOf(GRADE9, 1) })
    const got = loadUnseen(join(root, UNSEEN_FOLDER))!
    expect(got.runId).toBe('2026-11-12-unseen')
    expect(got.tries.map((t) => t.docId)).toEqual([GRADE9])
    expect(got.outside?.runId).toBe('2026-11-11-18-26-unseen')
    expect(got.outside?.tries.map((t) => t.docId).sort()).toEqual([SCITECH, ENGLISH, SCIENCE])
    expect(got.outside?.labels[SCIENCE]).toBe('Grade 9 Natural Sciences, South Africa')
    expect(got.outside?.labels[SCITECH]).toBe('Grade 4 Science and Technology, Kenya')
  })

  test('with no Mathematics run yet, the earlier run is still there to be shown as outside Mathematics', () => {
    write('2026-11-11-18-26-unseen', { [`${SCIENCE}-1-1.json`]: tryOf(SCIENCE, 1) })
    const got = loadUnseen(join(root, UNSEEN_FOLDER))!
    expect(got.tries).toEqual([])
    expect(got.outside?.tries).toHaveLength(1)
  })

  test('no folder, or an empty one, is no run', () => {
    expect(loadUnseen(join(root, UNSEEN_FOLDER))).toBeNull()
    mkdirSync(join(root, UNSEEN_FOLDER))
    expect(loadUnseen(join(root, UNSEEN_FOLDER))).toBeNull()
  })

  test('a result file that is not one is refused, with its name', () => {
    write('2026-11-12-unseen', { [`${GRADE9}-1-1.json`]: { hello: 1 } })
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
    // a cap counts one run id: the live calls of an earlier run do not eat into the cap of a new one
    appendLedger({ at: 'e', runId: 'v', taskId: 'draft_map:grade9-mathematics-za', n: 1, attempts: 1, rehearsal: false, kind: 'draft_map' }, file)
    expect(liveSpent(file, 'draft_map')).toBe(2)
    expect(liveSpent(file, 'draft_map', 'u')).toBe(1)
    expect(liveSpent(file, 'draft_map', 'v')).toBe(1)
    expect(liveSpent(file, 'draft_map', 'nothing yet')).toBe(0)
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
