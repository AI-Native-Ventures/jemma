import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { TASKS } from '../../../evals/tasks'
import {
  caughtBy,
  costOf,
  fetchPricing,
  loadResults,
  MissingResultsError,
  pickWeakest,
  renderReport,
  summarize,
  writeReport,
  type PricingInfo,
  type ReportInput,
} from '../../../evals/lib/render'
import { baseName } from '../../../evals/lib/result'
import { failing, result } from './evals-fixtures'

const tasks = TASKS.map((t) => ({ id: t.id, proves: t.proves }))
const DASH = String.fromCharCode(0x2014)

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'jemma-evals-test-'))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

/** Writes a complete run folder: every task, three runs, with `over` applied to chosen runs. */
function writeRun(runId: string, over: (taskId: string, n: number) => Partial<ReturnType<typeof result>> = () => ({})): string {
  const dir = join(root, runId)
  mkdirSync(dir, { recursive: true })
  for (const t of tasks) {
    for (let n = 1; n <= 3; n++) {
      writeFileSync(join(dir, `${baseName(t.id, n)}.json`), JSON.stringify(result(t.id, n, { runId, ...over(t.id, n) }), null, 2))
      writeFileSync(join(dir, `${baseName(t.id, n)}.jsonl`), '{"type":"jemma_attempt"}\n')
    }
  }
  return dir
}

const price: PricingInfo = {
  fetchedAt: '2026-11-10',
  source: 'https://openrouter.ai/api/v1/models',
  models: { 'nvidia/nemotron-3.5-super-vl:free': { paidId: 'nvidia/nemotron-3.5-super-vl', promptPerM: 0.1, completionPerM: 0.4, freeListed: true } },
}
const input = (results: ReturnType<typeof result>[], over: Partial<ReportInput> = {}): ReportInput => ({ runId: 'test-run', results, tasks, runs: 3, pricing: price, analysis: null, packetLiveRuns: 40, ...over })
const allResults = (over: (taskId: string, n: number) => Partial<ReturnType<typeof result>> = () => ({})) => tasks.flatMap((t) => [1, 2, 3].map((n) => result(t.id, n, over(t.id, n))))

describe('the generator refuses to run without every result file', () => {
  test('a complete run folder loads', () => {
    const dir = writeRun('complete')
    expect(loadResults(dir, tasks, 3)).toHaveLength(33)
  })
  test('a missing .json names the file, and every missing file is listed', () => {
    const dir = writeRun('missing')
    rmSync(join(dir, 'class-report-2.json'))
    rmSync(join(dir, 'photo-through-goose-3.json'))
    expect(() => loadResults(dir, tasks, 3)).toThrow(MissingResultsError)
    try {
      loadResults(dir, tasks, 3)
    } catch (err) {
      const missing = (err as MissingResultsError).missing
      expect(missing).toEqual(['class-report-2.json', 'photo-through-goose-3.json'])
      expect((err as Error).message).toContain('class-report-2.json')
    }
  })
  test('a missing stream file is also an error', () => {
    const dir = writeRun('nostream')
    rmSync(join(dir, 'diagnose-1.jsonl'))
    expect(() => loadResults(dir, tasks, 3)).toThrow(/diagnose-1\.jsonl/)
  })
  test('a whole task that never ran is listed run by run', () => {
    const dir = writeRun('notask')
    for (const n of [1, 2, 3]) {
      rmSync(join(dir, `messy-records-${n}.json`))
      rmSync(join(dir, `messy-records-${n}.jsonl`))
    }
    try {
      loadResults(dir, tasks, 3)
      throw new Error('should have thrown')
    } catch (err) {
      expect((err as MissingResultsError).missing).toHaveLength(6)
    }
  })
  test('a file that holds another task or run, or is not a result, is refused', () => {
    const dir = writeRun('mixed')
    writeFileSync(join(dir, 'class-report-1.json'), JSON.stringify(result('diagnose', 1)))
    expect(() => loadResults(dir, tasks, 3)).toThrow(/holds task diagnose run 1/)
    writeFileSync(join(dir, 'class-report-1.json'), '{"hello":1}')
    expect(() => loadResults(dir, tasks, 3)).toThrow(/version/)
    writeFileSync(join(dir, 'class-report-1.json'), 'not json')
    expect(() => loadResults(dir, tasks, 3)).toThrow(/not valid JSON/)
  })
  test('writeReport throws and writes nothing when a file is missing', async () => {
    const dir = writeRun('norun')
    rmSync(join(dir, 'guidance-sourced-3.json'))
    const out = join(root, 'EVALS.md')
    await expect(writeReport({ runId: 'norun', resultsRoot: root, outFile: out, fetchFn: (async () => new Response('{}')) as typeof fetch })).rejects.toThrow(/guidance-sourced-3\.json/)
    expect(() => readFileSync(out)).toThrow()
  })
})

describe('pass and fail both render', () => {
  const mixed = allResults((id, n) => (id === 'photo-through-goose' ? (n === 1 ? {} : failing('the paper ends marked', 'status=needs_you')) : {}))
  const text = renderReport(input(mixed))
  test('the table has one row per task with pass or fail for each run, and the median numbers', () => {
    for (const t of tasks) expect(text).toContain(`| \`${t.id}\` | ${t.proves}`)
    const row = text.split('\n').find((l) => l.startsWith('| `photo-through-goose`'))!
    expect(row).toContain('| pass | fail | fail |')
    const ok = text.split('\n').find((l) => l.startsWith('| `class-report`'))!
    expect(ok).toContain('| pass | pass | pass | 42 | 82,000 / 3,000 |')
  })
  test('it counts passes and fails from the files', () => expect(text).toContain('**31 of 33 runs passed** (2 failed)'))
  test('the failed checks of a run are listed with the run numbers', () => {
    expect(text).toContain('`photo-through-goose`:')
    expect(text).toMatch(/the paper ends marked \(runs 2, 3\): status=needs_you/)
  })
  test('an all-pass report says no check failed', () => expect(renderReport(input(allResults()))).toContain('None. Every check passed in every run.'))
  test('a rehearsal is labelled so nobody mistakes it for a live result', () => {
    expect(renderReport(input(allResults(() => ({ rehearsal: true }))))).toContain('rehearsal with a fake goose')
    expect(text).not.toContain('rehearsal with a fake goose')
  })
  test('there is no em dash and no local path anywhere', () => {
    expect(text.includes(DASH)).toBe(false)
    expect(text).not.toMatch(new RegExp(['/Users/', ['\\.claude', '/'].join(''), ['coord', 'work'].join('-')].join('|')))
  })
  test('a harness error is shown as a failed run with its error text', () => {
    const errored = renderReport(input(allResults((id, n) => (id === 'diagnose' && n === 2 ? { pass: false, error: 'the sandbox could not be made', checks: [{ name: 'the run reached its checks', pass: false, detail: 'the sandbox could not be made' }] } : {}))))
    expect(errored).toContain('harness error: the sandbox could not be made')
  })
})

describe('variation and the cost paragraph', () => {
  test('a task whose runs disagree is listed with the reason, one whose runs agree is not', () => {
    const text = renderReport(input(allResults((id, n) => (id === 'class-report' && n === 3 ? failing('the report copy exists in the reports folder', 'no file') : {}))))
    const section = text.split('## Variation')[1]!.split('## One failure')[0]!
    expect(section).toContain('`class-report` (2 of 3 passed): run 3 failed (the report copy exists in the reports folder)')
    expect(section).not.toContain('`diagnose`')
  })
  test('a different model, a different attempt count, or who stopped bad wording also count as variation', () => {
    const text = renderReport(
      input(
        allResults((id, n) => {
          if (id === 'model-down-recovery' && n === 2) return { finalModel: 'google/gemma-4-31b-it:free', attempts: [...result(id, n).attempts, ...result(id, n).attempts] }
          if (id === 'injection-in-a-note') return { extras: { whoStayedClean: n === 1 ? 'model_clean' : 'save_tool_dropped', droppedByTool: n === 1 ? 0 : 1 } }
          return {}
        }),
      ),
    )
    const section = text.split('## Variation')[1]!.split('## One failure')[0]!
    expect(section).toContain('`model-down-recovery`')
    expect(section).toContain('different models finished the job')
    expect(section).toContain('a different number of goose attempts')
    expect(section).toContain('`injection-in-a-note`')
    expect(section).toContain('who stopped the bad wording differed (run 1: model clean, run 2: save tool dropped, run 3: save tool dropped)')
  })
  test('identical runs say that every task agreed', () => expect(renderReport(input(allResults()))).toContain('agreed on pass or fail and on how they got there'))
  test('the injection task shows in the table which one acted in each run', () => {
    const text = renderReport(input(allResults((id, n) => (id === 'injection-in-a-note' ? { extras: { whoStayedClean: n === 1 ? 'model_clean' : 'save_tool_dropped', droppedByTool: n === 1 ? 0 : 2, droppedReasons: 'uses the word "gifted"' } } : {}))))
    expect(text).toContain('| `injection-in-a-note` | 1 | the model stayed clean on its own')
    expect(text).toContain('| `injection-in-a-note` | 2 | the model wrote the wrong wording and the save tool dropped 2 pattern(s)')
  })
  test('the cost paragraph states the free cost, the listed paid price with its date, and the cost from the tokens', () => {
    const text = renderReport(input(allResults()))
    const cost = text.split('## Cost')[1]!.split('## Variation')[0]!
    expect(cost).toContain('actual cost was $0:')
    expect(cost).toContain('nvidia/nemotron-3.5-super-vl` at $0.10 per million input tokens and $0.40 per million output tokens')
    expect(cost).toContain('on 2026-11-10')
    // 33 runs of (80000 + n*1000) in and 3000 out: sum in = 11 * (81000 + 82000 + 83000) = 2,706,000; out = 99 * 1000 = 99,000
    expect(cost).toContain(`about $${((2_706_000 * 0.1 + 99_000 * 0.4) / 1e6).toFixed(2)} in all`)
  })
  test('costOf works from the files: per run, and tokens of a model with no price are left out', () => {
    const results = [result('class-report', 1), result('class-report', 2, { attempts: [{ model: 'other/model:free', seconds: 1, status: 'done', note: '', saved: true, timedOut: false, tokens: { input: 10, output: 5, costUsd: 0 } }] })]
    const c = costOf(results, price)
    expect(c.perRun[0]).toBeCloseTo((81_000 * 0.1 + 3_000 * 0.4) / 1e6, 10)
    expect(c.perRun[1]).toBe(0)
    expect(c.unpriced).toEqual([{ model: 'other/model:free', tokens: 15 }])
  })
  test('with no paid listing, or no price at all, the paragraph says so instead of making a number up', () => {
    const none = renderReport(input(allResults(), { pricing: { ...price, models: { 'nvidia/nemotron-3.5-super-vl:free': { paidId: null, promptPerM: null, completionPerM: null, freeListed: true } } } }))
    expect(none).toContain('lists no paid version')
    const unread = renderReport(input(allResults(), { pricing: null, pricingError: 'OpenRouter answered 503' }))
    expect(unread).toContain('could not be read (OpenRouter answered 503)')
    expect(unread).not.toMatch(/would have cost/)
  })
  test('fetchPricing reads the paid listing for a :free id from the public endpoint, and notes when there is none', async () => {
    const body = { data: [{ id: 'nvidia/nemotron-3.5-super-vl', pricing: { prompt: '0.0000002', completion: '0.0000008' } }, { id: 'nvidia/nemotron-3.5-super-vl:free', pricing: { prompt: '0', completion: '0' } }, { id: 'free/only:free', pricing: { prompt: '0', completion: '0' } }] }
    const fetchFn = (async (url: string) => {
      expect(url).toBe('https://openrouter.ai/api/v1/models')
      return new Response(JSON.stringify(body))
    }) as unknown as typeof fetch
    const got = await fetchPricing(['nvidia/nemotron-3.5-super-vl:free', 'free/only:free', 'gone/model:free'], fetchFn, new Date('2026-11-10T12:00:00Z'))
    expect(got.fetchedAt).toBe('2026-11-10')
    expect(got.models['nvidia/nemotron-3.5-super-vl:free']).toEqual({ paidId: 'nvidia/nemotron-3.5-super-vl', promptPerM: 0.2, completionPerM: 0.8, freeListed: true })
    expect(got.models['free/only:free']).toMatchObject({ paidId: null, promptPerM: null, freeListed: true })
    expect(got.models['gone/model:free']).toMatchObject({ paidId: null, freeListed: false })
    await expect(fetchPricing(['x'], (async () => new Response('no', { status: 503 })) as unknown as typeof fetch)).rejects.toThrow('503')
  })
})

describe('the weakest task and the failure we did not fix', () => {
  const sums = (over: (taskId: string, n: number) => Partial<ReturnType<typeof result>>) => summarize({ results: allResults(over), tasks })
  test('the task with the fewest passes is the weakest, then the one with the most failed checks', () => {
    const a = pickWeakest(sums((id, n) => (id === 'photo-through-goose' ? failing('x') : id === 'diagnose' && n === 1 ? failing('y') : {})), 3)
    expect(a.task.id).toBe('photo-through-goose')
    expect(a.allPassed).toBe(false)
    expect(a.reason).toContain('0 of 3 runs passed')
    const b = pickWeakest(sums((id, n) => (id === 'photo-through-goose' && n < 3 ? failing('x') : id === 'diagnose' && n < 3 ? { pass: false, checks: [...failing('x').checks!, { name: 'z', pass: false, detail: '' }] } : {})), 3)
    expect(b.task.id).toBe('diagnose')
  })
  test('when everything passes, the weakest signal is where the save tool caught the model, then the slowest task', () => {
    const caught = pickWeakest(sums((id, n) => (id === 'guidance-sourced' && n === 2 ? { extras: { invalidIdsFromModel: 2 } } : {})), 3)
    expect(caught.allPassed).toBe(true)
    expect(caught.task.id).toBe('guidance-sourced')
    expect(caught.reason).toContain('every task passed 3 of 3')
    expect(caught.reason).toContain('had to catch the model in 1 of 3 runs')
    const slow = pickWeakest(sums((id) => (id === 'messy-records' ? { seconds: 300 } : {})), 3)
    expect(slow.task.id).toBe('messy-records')
    expect(slow.reason).toContain('slowest task (median 300 s)')
  })
  test('caughtBy sees a dropped pattern, a made-up id and the injection outcome', () => {
    expect(caughtBy(result('a', 1, { extras: { droppedByTool: 1 } }))).toBe(true)
    expect(caughtBy(result('a', 1, { extras: { invalidIdsFromModel: 1 } }))).toBe(true)
    expect(caughtBy(result('a', 1, { extras: { whoStayedClean: 'save_tool_dropped' } }))).toBe(true)
    expect(caughtBy(result('a', 1, { extras: { whoStayedClean: 'model_clean' } }))).toBe(false)
  })
  test('the section names the task, shows what happened in every run with its transcript file, and carries the written analysis', () => {
    const analysis = { taskId: 'photo-through-goose', why: 'The model did not see the image.', tryNext: ['Check the image content.', 'Try a vision model.'] }
    const text = renderReport(input(allResults((id, n) => (id === 'photo-through-goose' ? { ...failing('the paper ends marked', 'status=needs_you'), event: { status: 'failed', error: 'read_paper: no image' }, toolCalls: ['jemma__get_paper'] } : {})), { analysis }))
    const section = text.split('## One failure we did not fix')[1]!.split('## How to run it yourself')[0]!
    expect(section).toContain('Task `photo-through-goose`: it has the worst real result: 0 of 3 runs passed. It was not fixed.')
    for (const n of [1, 2, 3]) expect(section).toContain(`Run ${n}: fail. Event failed (read_paper: no image)`)
    expect(section).toContain('`evals/results/test-run/photo-through-goose-2.jsonl`')
    expect(section).toContain('The model did not see the image.')
    expect(section).toContain('1. Check the image content.')
    expect(section).toContain('2. Try a vision model.')
  })
  test('writeReport refuses an analysis written about a different task', async () => {
    const dir = writeRun('wrong', (id) => (id === 'photo-through-goose' ? failing('x') : {}))
    writeFileSync(join(dir, 'analysis.json'), JSON.stringify({ taskId: 'class-report', why: 'x', tryNext: ['y'] }))
    writeFileSync(join(dir, 'pricing.json'), JSON.stringify(price))
    await expect(writeReport({ runId: 'wrong', resultsRoot: root, outFile: join(root, 'EVALS.md') })).rejects.toThrow(/about `class-report`, but the weakest task .* is `photo-through-goose`/)
  })
  test('writeReport writes the file from a complete run, with the saved price and no network', async () => {
    const dir = writeRun('right', (id) => (id === 'photo-through-goose' ? failing('the paper ends marked') : {}))
    writeFileSync(join(dir, 'analysis.json'), JSON.stringify({ taskId: 'photo-through-goose', why: 'Because.', tryNext: ['One.', 'Two.'] }))
    writeFileSync(join(dir, 'pricing.json'), JSON.stringify(price))
    const out = join(root, 'EVALS.md')
    const text = await writeReport({ runId: 'right', resultsRoot: root, outFile: out, fetchFn: (async () => { throw new Error('no network in this test') }) as typeof fetch })
    expect(readFileSync(out, 'utf8')).toBe(text)
    expect(text.endsWith('\n') && !text.endsWith('\n\n')).toBe(true)
    expect(text).toContain('**30 of 33 runs passed**')
    expect(text).toContain('Because.')
    expect(text).toContain('on 2026-11-10')
  })
})
