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
/** Goose's last message when the provider answered with an error, as saved in the real Gemma folder. */
const HIGH_DEMAND =
  'Ran into this error: Server error: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.. Please retry if you think this is a transient or recoverable error.'
const HIGH_DEMAND_QUOTED = 'Server error: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.'

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

type Attempt = ReturnType<typeof result>['attempts'][number]
const attempt = (seconds: number, status: 'done' | 'failed' = 'done', note = 'All finished.'): Attempt => ({ model: GEMMA, seconds, status, note, saved: status === 'done', timedOut: false, tokens: { input: 90_000, output: 4_000, costUsd: 0 } })
/** A run the provider refused: goose's own error line is the last thing the attempt said. Saved the way the first Gemma folder was (no providerError field). */
const refused = (n: number, seconds = 45): Partial<ReturnType<typeof result>> => ({
  ...failing('the event ended done', 'status=failed'),
  startedAt: `2026-11-11T08:1${n}:00.000Z`,
  finalModel: GEMMA,
  seconds,
  toolCalls: [],
  event: { status: 'failed', error: `class_report: ${GEMMA}: ${HIGH_DEMAND}` },
  attempts: [attempt(seconds, 'failed', HIGH_DEMAND)],
  tokens: { input: 0, output: 0, costUsd: 0 },
})
/** A run that the checks judged. Seconds 100, 110, 120 and tool calls 5, 6, 7 for runs 1, 2, 3. */
const judged = (n: number): Partial<ReturnType<typeof result>> => ({
  startedAt: `2026-11-11T08:1${n}:00.000Z`,
  finalModel: GEMMA,
  seconds: 90 + n * 10,
  attempts: [attempt(90 + n * 10)],
  toolCalls: Array.from({ length: 4 + n }, () => 'jemma__get_class_results'),
  tokens: { input: 90_000, output: 4_000, costUsd: 0 },
})

const price: PricingInfo = {
  fetchedAt: '2026-11-10',
  source: 'https://openrouter.ai/api/v1/models',
  models: { [NEMOTRON]: { paidId: 'nvidia/nemotron-3.5-super-vl', promptPerM: 0.1, completionPerM: 0.4, freeListed: true } },
}
const gemmaPrice: PricingInfo = { fetchedAt: '2026-11-11', source: price.source, models: { [GEMMA]: { paidId: 'google/gemma-4-31b-it', promptPerM: 0.1, completionPerM: 0.3, freeListed: true } } }
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

describe('the section for other run folders: refused runs are told apart from judged ones', () => {
  const mainResults = tasks.flatMap((t) => [1, 2, 3].map((n) => result(t.id, n)))
  const input = (others: ReportInput['others'], over: Partial<ReportInput> = {}): ReportInput => ({ runId: '2026-11-10-full', results: mainResults, tasks, runs: 3, pricing: price, analysis: null, packetLiveRuns: 48, others, ...over })
  const folder = (name: string, over: (n: number) => Partial<ReturnType<typeof result>>, pricing: PricingInfo | null = gemmaPrice) => {
    const dir = writeFolder(name, ['class-report'], (_id, n) => over(n))
    return { runId: name, results: loadSecondRun(dir, name), pricing }
  }
  const sectionOf = (text: string) => text.split('## A second open-weights model on one task')[1]!.split('## Cost')[0]!
  const HEADER = '| Run id | Model that answered | Task | Runs judged | Passes | Median seconds | Median tool calls | Cost |'

  test('a folder where every run was refused gets no table row, only one sentence with the message, the date and the verdict', () => {
    const text = renderReport(input([folder('2026-11-11-gemma', refused)]))
    expect(text).toContain('## A second open-weights model on one task')
    const section = sectionOf(text)
    expect(section).not.toContain(HEADER)
    expect(section).not.toContain('| --- |')
    expect(section).not.toContain('| `2026-11-11-gemma`')
    expect(section).toContain(`\`2026-11-11-gemma\`, \`class-report\` on \`google/gemma-4-31b-it:free\`: 3 of 3 runs got no answer from the free endpoint on 2026-11-11 ("${HIGH_DEMAND_QUOTED}"), so this model was not judged.`)
    expect(section.match(/Server error: This model/g)).toHaveLength(1)
    expect(section).not.toMatch(/\| 0 \|/)
  })

  test('a mixed folder: the row counts the judged runs only, and a sentence says how many got no answer', () => {
    const text = renderReport(input([folder('2026-11-11-mixed', (n) => (n === 2 ? refused(n, 47) : n === 3 ? { ...judged(n), ...failing('the report copy exists in the reports folder', 'no file') } : judged(n)))]))
    const section = sectionOf(text)
    expect(section).toContain(HEADER)
    // judged runs 1 and 3: seconds 100 and 120 (median 110), tool calls 5 and 7 (median 6). The refused run 2 (47 s, 0 calls) is left out.
    expect(section).toMatch(/^\| `2026-11-11-mixed` \| `google\/gemma-4-31b-it:free` \| `class-report` \| 2 \| 1 \| 110 \| 6 \| \$0 on the free tier; about \$0\.\d+ at the listed paid price \|$/m)
    expect(section).toContain(`\`2026-11-11-mixed\`, \`class-report\` on \`google/gemma-4-31b-it:free\`: 1 of 3 runs got no answer from the free endpoint on 2026-11-11 ("${HIGH_DEMAND_QUOTED}"); the other 2 were judged.`)
    expect(section).not.toContain('so this model was not judged')
  })

  test('a judged failure keeps its own sentence, and a refused run is not in it', () => {
    const text = renderReport(input([folder('2026-11-11-mixed', (n) => (n === 2 ? refused(n) : n === 3 ? { ...judged(n), ...failing('the report copy exists in the reports folder', 'no file') } : judged(n)))]))
    const section = sectionOf(text)
    expect(section).toContain('In `2026-11-11-mixed`, 1 of 2 judged runs failed: run 3 (1 of 2 checks failed: the report copy exists in the reports folder).')
  })

  test('a folder where every run was judged gets its row and no sentence about refusals', () => {
    const text = renderReport(input([folder('2026-11-11-ok', judged)]))
    const section = sectionOf(text)
    expect(section).toMatch(/^\| `2026-11-11-ok` \| `google\/gemma-4-31b-it:free` \| `class-report` \| 3 \| 3 \| 110 \| 6 \| /m)
    expect(section).not.toContain('got no answer')
    expect(section).not.toContain('judged runs failed')
  })

  test('with one folder that was judged and one that was refused, only the judged one has a row, in name order, and both are told', () => {
    const text = renderReport(input([folder('2026-11-11-gemma', refused), folder('2026-11-11-qwen', judged)]))
    const section = sectionOf(text)
    expect(section).toContain('| `2026-11-11-qwen` |')
    expect(section).not.toContain('| `2026-11-11-gemma` |')
    expect(section).toContain('`2026-11-11-gemma`, `class-report` on `google/gemma-4-31b-it:free`: 3 of 3 runs got no answer')
  })

  test('the section comes after the main results and before the cost paragraph', () => {
    const text = renderReport(input([folder('2026-11-11-gemma', refused)]))
    const at = (s: string) => text.indexOf(s)
    expect(at('## Results')).toBeLessThan(at('## A second open-weights model on one task'))
    expect(at('## A second open-weights model on one task')).toBeLessThan(at('## Cost'))
  })

  test('a run counts as refused from the saved providerError field when there is one', () => {
    const text = renderReport(input([folder('2026-11-11-field', (n) => ({ ...refused(n), attempts: [{ ...attempt(40, 'failed', 'goose said something else'), providerError: 'Rate limit exceeded: free-models-per-min' } as Attempt] }))]))
    expect(sectionOf(text)).toContain('("Rate limit exceeded: free-models-per-min"), so this model was not judged.')
  })

  test('a harness error is judged: it is counted in the row and named in the failure sentence', () => {
    const text = renderReport(input([folder('2026-11-11-err', (n) => (n === 1 ? { pass: false, error: 'the sandbox could not be made', finalModel: null, attempts: [], tokens: null } : judged(n)), null)]))
    const section = sectionOf(text)
    expect(section).toContain('run 1 (harness error: the sandbox could not be made)')
    expect(section).toContain('$0 on the free tier; no paid price was read')
    expect(section).toMatch(/\| 3 \| 2 \|/)
  })

  test('with no model message the event error is named, and with neither the failed checks are', () => {
    const text = renderReport(input([folder('2026-11-11-reason', (n) => {
      if (n === 1) return { ...judged(n), ...failing('the event ended done', 'x'), event: { status: 'failed', error: 'class_report: the runner gave up' } }
      if (n === 2) return { ...judged(n), ...failing('the report copy exists in the reports folder', 'no file') }
      return judged(n)
    }, null)]))
    expect(text).toContain('run 1 (the event said: class_report: the runner gave up; 1 of 2 checks failed); run 2 (1 of 2 checks failed: the report copy exists in the reports folder).')
  })

  test('the numbers come only from the files: no em dash, no local path', () => {
    const text = renderReport(input([folder('2026-11-11-mixed', (n) => (n === 2 ? refused(n) : judged(n)))]))
    expect(text.includes(String.fromCharCode(0x2014))).toBe(false)
    expect(text).not.toContain('/Users/')
  })

  test('the main paragraph counts all live runs and says the cap of 45 was for the main set, only when other folders exist', () => {
    const withOthers = renderReport(input([folder('2026-11-11-gemma', refused)]))
    expect(withOthers).toContain('48 live goose runs were spent in all for this work, harness testing and the runs in other folders included (the cap of 45 was for the main set).')
    const alone = renderReport(input(undefined))
    expect(alone).toContain('48 live goose runs were spent in all for this work, harness testing included (cap 45).')
  })

  test('a result file for another task, or without its stream, is refused', () => {
    const dir = writeFolder('2026-11-11-bad', ['class-report'], (_id, n) => judged(n))
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

  test('none of the 33 main results is a refused run, so the main run shows no refusal today', async () => {
    const { refusalOf } = await import('../../../evals/lib/provider')
    const repoResults = fileURLToPath(new URL('../../../evals/results/2026-11-10-full/', import.meta.url))
    const files = readdirSync(repoResults).filter((f) => /-\d\.json$/.test(f))
    expect(files).toHaveLength(33)
    const refusedRuns = files.filter((f) => refusalOf(JSON.parse(readFileSync(join(repoResults, f), 'utf8'))) !== null)
    expect(refusedRuns).toEqual([])
  })
})

describe('writing the report twice gives the same bytes', () => {
  test('with a second folder, the second run reads the saved price and does not ask the network again', async () => {
    writeFolder('2026-11-10-full', taskIds)
    writeFolder('2026-11-11-gemma', ['class-report'], (_id, n) => (n === 3 ? judged(n) : refused(n)))
    const ledger = join(root, 'ledger.jsonl')
    writeFileSync(ledger, JSON.stringify({ at: 'x', runId: 'r', taskId: 'class-report', n: 1, attempts: 48, rehearsal: false }) + '\n')
    let asked = 0
    const counting = (async (...args: Parameters<typeof fetch>) => {
      asked++
      return okFetch()(...args)
    }) as typeof fetch
    const out = join(root, 'EVALS.md')
    const first = await writeReport({ runId: '2026-11-10-full', resultsRoot: root, outFile: out, ledgerFile: ledger, fetchFn: counting })
    const bytes1 = readFileSync(out)
    expect(first).toContain('## A second open-weights model on one task')
    expect(first).toContain('got no answer from the free endpoint')
    expect(asked).toBeGreaterThan(0)
    const before = asked
    const second = await writeReport({ runId: '2026-11-10-full', resultsRoot: root, outFile: out, ledgerFile: ledger, fetchFn: counting })
    expect(asked).toBe(before)
    expect(second).toBe(first)
    expect(readFileSync(out).equals(bytes1)).toBe(true)
  })

  test('the other folder is found without being named, and a partial folder is not mistaken for the main run', async () => {
    writeFolder('2026-11-10-full', taskIds)
    writeFolder('2026-11-11-gemma', ['class-report'], (_id, n) => judged(n))
    const folders = listRunFolders(root)
    expect(chooseMainRun(folders, taskIds)).toBe('2026-11-10-full')
    const ledger = join(root, 'ledger.jsonl')
    writeFileSync(ledger, '')
    const text = await writeReport({ runId: chooseMainRun(folders, taskIds), resultsRoot: root, outFile: join(root, 'EVALS.md'), ledgerFile: ledger, fetchFn: okFetch() })
    expect(text).toContain('| `2026-11-11-gemma` |')
    expect(text).not.toContain('| `2026-11-10-full` | `')
  })
})

describe('a run on one model is set up so that no other model can answer', () => {
  const env = { JEMMA_OPEN_MODEL: GEMMA, JEMMA_OPEN_MODEL_FALLBACKS: GEMMA }
  test('the first model and an equal fallback list make a list of exactly one model', () => {
    expect(gooseModels(env)).toEqual([GEMMA])
  })
  test('an empty fallback list also leaves one model, but an unset one brings the Nemotron defaults back', () => {
    expect(gooseModels({ JEMMA_OPEN_MODEL: GEMMA, JEMMA_OPEN_MODEL_FALLBACKS: '' })).toEqual([GEMMA])
    expect(gooseModels({ JEMMA_OPEN_MODEL: GEMMA }).some((m) => m.startsWith('nvidia/'))).toBe(true)
  })
})
