import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { TASKS } from '../../../evals/tasks'
import { renderReport, writeReport, type PricingInfo, type ReportInput } from '../../../evals/lib/render'
import { chooseMainRun, listRunFolders, loadSecondRun } from '../../../evals/lib/second'
import { baseName } from '../../../evals/lib/result'
import { gooseModels } from '../src/goose'
import { failing, result } from './evals-fixtures'

const tasks = TASKS.map((t) => ({ id: t.id, proves: t.proves }))
const taskIds = tasks.map((t) => t.id)
const GEMMA = 'google/gemma-4-31b-it:free'
const NEMOTRON = 'nvidia/nemotron-3.5-super-vl:free'

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'jemma-evals-second-'))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

/** A run folder with `taskList` x `runs` results. `over` changes chosen results. */
function writeFolder(name: string, taskList: string[], over: (taskId: string, n: number) => Partial<ReturnType<typeof result>> = () => ({}), runs = 3): string {
  const dir = join(root, name)
  mkdirSync(dir, { recursive: true })
  for (const id of taskList) {
    for (let n = 1; n <= runs; n++) {
      writeFileSync(join(dir, `${baseName(id, n)}.json`), JSON.stringify(result(id, n, { runId: name, ...over(id, n) }), null, 2))
      writeFileSync(join(dir, `${baseName(id, n)}.jsonl`), '{"type":"jemma_attempt"}\n')
    }
  }
  return dir
}

const gemmaAttempt = (seconds: number, status: 'done' | 'failed' = 'done', note = 'All finished.') => ({ model: GEMMA, seconds, status, note, saved: status === 'done', timedOut: false, tokens: { input: 90_000, output: 4_000, costUsd: 0 } })
/** Three class-report runs on Gemma. Run 2 fails the way a provider limit would. */
const gemmaFolder = (name = '2026-11-11-gemma') =>
  writeFolder(name, ['class-report'], (_id, n) => {
    const base = { finalModel: GEMMA, attempts: [gemmaAttempt(90 + n * 10)], seconds: 90 + n * 10, toolCalls: Array.from({ length: 4 + n }, () => 'jemma__get_class_results'), tokens: { input: 90_000, output: 4_000, costUsd: 0 } }
    if (n !== 2) return base
    return {
      ...base,
      ...failing('the event ended done', 'status=failed; error=class_report: Ran into this error: Request failed: Too many requests (429)'),
      event: { status: 'failed', error: 'class_report: Ran into this error: Request failed: Too many requests (429)' },
      attempts: [gemmaAttempt(12, 'failed', 'Ran into this error: Request failed: Too many requests (429)')],
    }
  })

const price: PricingInfo = {
  fetchedAt: '2026-11-10',
  source: 'https://openrouter.ai/api/v1/models',
  models: { [NEMOTRON]: { paidId: 'nvidia/nemotron-3.5-super-vl', promptPerM: 0.1, completionPerM: 0.4, freeListed: true } },
}
const modelsBody = {
  data: [
    { id: 'nvidia/nemotron-3.5-super-vl', pricing: { prompt: '0.0000001', completion: '0.0000004' } },
    { id: 'google/gemma-4-31b-it', pricing: { prompt: '0.0000001', completion: '0.0000003' } },
  ],
}
const okFetch = () => (async () => new Response(JSON.stringify(modelsBody))) as typeof fetch
const noNetwork = (async () => {
  throw new Error('the report must not use the network here')
}) as typeof fetch

describe('which folder is the main run', () => {
  const full = { name: '2026-11-10-full', taskIds }
  const partial = { name: '2026-11-11-gemma', taskIds: ['class-report'] }

  test('a newer folder that covers only some tasks never becomes the main run', () => {
    expect(chooseMainRun([full, partial], taskIds)).toBe('2026-11-10-full')
    expect(chooseMainRun([partial, full], taskIds)).toBe('2026-11-10-full')
  })
  test('of several complete folders the newest by name is the main run', () => {
    expect(chooseMainRun([full, { name: '2026-11-12-again', taskIds }, partial], taskIds)).toBe('2026-11-12-again')
  })
  test('a rehearsal folder is never the main run, even when it covers every task', () => {
    expect(chooseMainRun([full, { name: 'rehearsal-2026-11-12', taskIds }], taskIds)).toBe('2026-11-10-full')
  })
  test('a folder that lacks one task is partial', () => {
    expect(chooseMainRun([full, { name: '2026-11-13', taskIds: taskIds.slice(1) }], taskIds)).toBe('2026-11-10-full')
  })
  test('with no complete folder it says so and names what is missing', () => {
    expect(() => chooseMainRun([partial], taskIds)).toThrow(/no run folder covers every task/)
    expect(() => chooseMainRun([partial], taskIds)).toThrow(/guidance-sourced/)
    expect(() => chooseMainRun([], taskIds)).toThrow(/no run folder/)
  })
  test('an explicit run id is taken as it is', () => {
    expect(chooseMainRun([full, partial], taskIds, '2026-11-11-gemma')).toBe('2026-11-11-gemma')
  })
  test('the folders on disk are listed in name order, without rehearsals, files or hidden folders', () => {
    writeFolder('2026-11-11-gemma', ['class-report'])
    writeFolder('2026-11-10-full', ['class-report', 'diagnose'])
    writeFolder('rehearsal-x', ['class-report'])
    mkdirSync(join(root, '.cache'))
    writeFileSync(join(root, 'ledger.jsonl'), '')
    expect(listRunFolders(root)).toEqual([
      { name: '2026-11-10-full', taskIds: ['class-report', 'diagnose'] },
      { name: '2026-11-11-gemma', taskIds: ['class-report'] },
    ])
  })
})

describe('the second open-weights model section', () => {
  const mainResults = tasks.flatMap((t) => [1, 2, 3].map((n) => result(t.id, n)))
  const input = (others: ReportInput['others']): ReportInput => ({ runId: '2026-11-10-full', results: mainResults, tasks, runs: 3, pricing: price, analysis: null, packetLiveRuns: 42, others })
  const secondFrom = async (name = '2026-11-11-gemma') => {
    const dir = gemmaFolder(name)
    return { runId: name, results: loadSecondRun(dir, name), pricing: { fetchedAt: '2026-11-11', source: price.source, models: { [GEMMA]: { paidId: 'google/gemma-4-31b-it', promptPerM: 0.1, completionPerM: 0.3, freeListed: true } } } }
  }

  test('one table row per other folder: run id, model that answered, task, runs, passes, median seconds, median tool calls, cost', async () => {
    const text = renderReport(input([await secondFrom()]))
    expect(text).toContain('## A second open-weights model on one task')
    const header = text.split('\n').find((l) => l.startsWith('| Run id |'))!
    expect(header).toBe('| Run id | Model that answered | Task | Runs | Passes | Median seconds | Median tool calls | Cost |')
    const row = text.split('\n').find((l) => l.startsWith('| `2026-11-11-gemma`'))!
    // seconds 100, 110 (run 2 keeps 110 because the override only touches the failed run's attempts), 120: median 110; calls 5, 6, 7: median 6
    expect(row).toMatch(/^\| `2026-11-11-gemma` \| `google\/gemma-4-31b-it:free` \| `class-report` \| 3 \| 2 \| 110 \| 6 \| \$0 on the free tier; about \$0\.\d+ at the listed paid price \|$/)
  })

  test('the section comes after the main results and before the cost paragraph', async () => {
    const text = renderReport(input([await secondFrom()]))
    const at = (s: string) => text.indexOf(s)
    expect(at('## Results')).toBeLessThan(at('## A second open-weights model on one task'))
    expect(at('## A second open-weights model on one task')).toBeLessThan(at('## Cost'))
  })

  test('a failed run is named with the reason from its own result file, in one generated sentence', async () => {
    const text = renderReport(input([await secondFrom()]))
    const section = text.split('## A second open-weights model on one task')[1]!.split('## Cost')[0]!
    expect(section).toContain('In `2026-11-11-gemma`, 1 of 3 runs failed: run 2 (the model run on google/gemma-4-31b-it:free said: Ran into this error: Request failed: Too many requests (429); 1 of 2 checks failed).')
    expect(section.match(/runs? failed/g)).toHaveLength(1)
  })

  test('with no model message the event error is named, and with neither the failed checks are', () => {
    const dir = writeFolder('2026-11-11-reason', ['class-report'], (_id, n) => {
      const ok = { finalModel: GEMMA, attempts: [gemmaAttempt(70)] }
      if (n === 1) return { ...ok, ...failing('the event ended done', 'x'), event: { status: 'failed', error: 'class_report: the runner gave up' } }
      if (n === 2) return { ...ok, ...failing('the report copy exists in the reports folder', 'no file') }
      return ok
    })
    const text = renderReport(input([{ runId: '2026-11-11-reason', results: loadSecondRun(dir, '2026-11-11-reason'), pricing: null }]))
    expect(text).toContain('run 1 (the event said: class_report: the runner gave up; 1 of 2 checks failed); run 2 (1 of 2 checks failed: the report copy exists in the reports folder).')
  })

  test('a long message is cut at a word with three dots, not in the middle of a word', async () => {
    const long = 'Ran into this error: Server error: This model is currently experiencing high demand. '.repeat(6)
    const dir = writeFolder('2026-11-11-long', ['class-report'], (_id, n) => (n === 1 ? { ...failing('the event ended done'), finalModel: GEMMA, attempts: [gemmaAttempt(10, 'failed', long)] } : { finalModel: GEMMA, attempts: [gemmaAttempt(70)] }))
    const text = renderReport(input([{ runId: '2026-11-11-long', results: loadSecondRun(dir, '2026-11-11-long'), pricing: null }]))
    expect(text).toMatch(/said: Ran into this error: .*\.\.\.; 1 of 2 checks failed\)/)
  })

  test('with no failed run there is no failure sentence', () => {
    const dir = writeFolder('2026-11-11-ok', ['class-report'], () => ({ finalModel: GEMMA, attempts: [gemmaAttempt(80)] }))
    const text = renderReport(input([{ runId: '2026-11-11-ok', results: loadSecondRun(dir, '2026-11-11-ok'), pricing: null }]))
    const section = text.split('## A second open-weights model on one task')[1]!.split('## Cost')[0]!
    expect(section).not.toContain('failed')
    expect(section).toContain('| 3 | 3 |')
  })

  test('a harness error is named as such, and the cost says when no price could be read', () => {
    const dir = writeFolder('2026-11-11-err', ['class-report'], (_id, n) => (n === 1 ? { pass: false, error: 'the sandbox could not be made', finalModel: null, attempts: [], tokens: null } : { finalModel: GEMMA, attempts: [gemmaAttempt(70)] }))
    const text = renderReport(input([{ runId: '2026-11-11-err', results: loadSecondRun(dir, '2026-11-11-err'), pricing: null }]))
    expect(text).toContain('run 1 (harness error: the sandbox could not be made)')
    expect(text).toContain('$0 on the free tier; no paid price was read')
  })

  test('several other folders give several rows in name order', async () => {
    const b = await secondFrom('2026-11-12-gemma-again')
    const a = await secondFrom('2026-11-11-gemma')
    const text = renderReport(input([a, b]))
    expect(text.indexOf('| `2026-11-11-gemma`')).toBeLessThan(text.indexOf('| `2026-11-12-gemma-again`'))
  })

  test('the numbers come only from the files: no em dash, no local path', async () => {
    const text = renderReport(input([await secondFrom()]))
    expect(text.includes(String.fromCharCode(0x2014))).toBe(false)
    expect(text).not.toContain('/Users/')
  })

  test('a result file for another task, or without its stream, is refused', () => {
    const dir = gemmaFolder('2026-11-11-bad')
    rmSync(join(dir, 'class-report-3.jsonl'))
    expect(() => loadSecondRun(dir, '2026-11-11-bad')).toThrow(/class-report-3\.jsonl/)
    writeFileSync(join(dir, 'class-report-3.jsonl'), '{}\n')
    writeFileSync(join(dir, 'class-report-3.json'), JSON.stringify(result('diagnose', 3)))
    expect(() => loadSecondRun(dir, '2026-11-11-bad')).toThrow(/holds task diagnose run 3/)
  })
})

describe('without a second folder the report stays as it was', () => {
  const mainResults = tasks.flatMap((t) => [1, 2, 3].map((n) => result(t.id, n)))
  const base: ReportInput = { runId: 'r', results: mainResults, tasks, runs: 3, pricing: price, analysis: null, packetLiveRuns: 42 }

  test('no section when there are no other folders, and an empty list is the same as none', () => {
    const none = renderReport(base)
    expect(none).not.toContain('A second open-weights model')
    expect(renderReport({ ...base, others: [] })).toBe(none)
  })

  test('the real 2026-11-10-full folder alone gives byte for byte the EVALS.md that was committed for it', async () => {
    const repoResults = fileURLToPath(new URL('../../../evals/results/2026-11-10-full/', import.meta.url))
    const pinned = readFileSync(fileURLToPath(new URL('./fixtures/evals-2026-11-10-full.md', import.meta.url)), 'utf8')
    const copy = join(root, '2026-11-10-full')
    mkdirSync(copy)
    for (const name of readdirSync(repoResults)) {
      if (name === 'superseded') continue
      if (name.endsWith('.jsonl')) writeFileSync(join(copy, name), '')
      else copyFileSync(join(repoResults, name), join(copy, name))
    }
    const ledger = join(root, 'ledger.jsonl')
    writeFileSync(ledger, JSON.stringify({ at: 'x', runId: 'r', taskId: 'class-report', n: 1, attempts: 42, rehearsal: false }) + '\n')
    const out = join(root, 'EVALS.md')
    const text = await writeReport({ runId: '2026-11-10-full', resultsRoot: root, outFile: out, ledgerFile: ledger, fetchFn: noNetwork })
    expect(text).toBe(pinned)
    expect(readFileSync(out, 'utf8')).toBe(pinned)
  })
})

describe('writing the report twice gives the same bytes', () => {
  test('with a second folder, the second run reads the saved price and does not ask the network again', async () => {
    writeFolder('2026-11-10-full', taskIds)
    gemmaFolder('2026-11-11-gemma')
    const ledger = join(root, 'ledger.jsonl')
    writeFileSync(ledger, JSON.stringify({ at: 'x', runId: 'r', taskId: 'class-report', n: 1, attempts: 45, rehearsal: false }) + '\n')
    let asked = 0
    const counting = (async (...args: Parameters<typeof fetch>) => {
      asked++
      return okFetch()(...args)
    }) as typeof fetch
    const out = join(root, 'EVALS.md')
    const first = await writeReport({ runId: '2026-11-10-full', resultsRoot: root, outFile: out, ledgerFile: ledger, fetchFn: counting })
    const bytes1 = readFileSync(out)
    expect(first).toContain('## A second open-weights model on one task')
    expect(asked).toBeGreaterThan(0)
    const before = asked
    const second = await writeReport({ runId: '2026-11-10-full', resultsRoot: root, outFile: out, ledgerFile: ledger, fetchFn: counting })
    expect(asked).toBe(before)
    expect(second).toBe(first)
    expect(readFileSync(out).equals(bytes1)).toBe(true)
  })

  test('the second folder is found without being named, and a partial folder is not mistaken for the main run', async () => {
    writeFolder('2026-11-10-full', taskIds)
    gemmaFolder('2026-11-11-gemma')
    const folders = listRunFolders(root)
    expect(chooseMainRun(folders, taskIds)).toBe('2026-11-10-full')
    const ledger = join(root, 'ledger.jsonl')
    writeFileSync(ledger, '')
    const text = await writeReport({ runId: chooseMainRun(folders, taskIds), resultsRoot: root, outFile: join(root, 'EVALS.md'), ledgerFile: ledger, fetchFn: okFetch() })
    expect(text).toContain('| `2026-11-11-gemma` |')
    expect(text).not.toContain('| `2026-11-10-full` | `')
  })
})

describe('the Gemma run is set up so that no other model can answer', () => {
  const env = { JEMMA_OPEN_MODEL: GEMMA, JEMMA_OPEN_MODEL_FALLBACKS: GEMMA }
  test('the first model and an equal fallback list make a list of exactly one model', () => {
    expect(gooseModels(env)).toEqual([GEMMA])
  })
  test('an empty fallback list also leaves one model, but an unset one brings the Nemotron defaults back', () => {
    expect(gooseModels({ JEMMA_OPEN_MODEL: GEMMA, JEMMA_OPEN_MODEL_FALLBACKS: '' })).toEqual([GEMMA])
    expect(gooseModels({ JEMMA_OPEN_MODEL: GEMMA }).some((m) => m.startsWith('nvidia/'))).toBe(true)
  })
})
