import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { ollamaHost } from '../src'
import { LOCAL_CAP, LIVE_CAP, appendLedger, ledgerLine, liveSpent, readLedger } from '../../../evals/lib/ledger'
import { LOCAL_TIMEOUT_MINUTES, parseArgs } from '../../../evals/lib/args'
import { KEEP_OUT, LOCAL_KEEP_OUT, assertAllowedDatabase, withScrubbedEnv } from '../../../evals/lib/env'
import { checkOllamaReady, cloudCallEvidence, localFacts, scrubPlan } from '../../../evals/lib/local'
import { renderReport, writeReport, type ReportInput } from '../../../evals/lib/render'
import { baseName, parseResult } from '../../../evals/lib/result'
import { chooseMainRun, isLocalRunFolder, listLocalRunFolders, listRunFolders } from '../../../evals/lib/second'
import { TASKS } from '../../../evals/tasks'
import { result } from './evals-fixtures'

// The local-model option of the evals: arguments, the ledger, the database guard, the result file, the report section.
// Nothing here calls a model, a database or a network.

const tasks = TASKS.map((t) => ({ id: t.id, proves: t.proves }))
const taskIds = tasks.map((t) => t.id)
const PREVIEW = 'https://bpajgrjkbvyeeeyvixwf.supabase.co'
const DEV = 'https://ayxgctbemuvozwktstaa.supabase.co'
const NOW = new Date('2026-11-15T10:30:45.000Z')
const parse = (...argv: string[]) => parseArgs(argv, { runsPerTask: 3, now: NOW })

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'jemma-evals-local-'))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('the arguments', () => {
  test('the defaults are the OpenRouter run of before', () => {
    expect(parse()).toEqual({
      runs: 3,
      tasks: undefined,
      runId: '2026-11-15-10-30',
      cap: 45,
      usedOffset: 0,
      rehearse: null,
      reuseWorker: false,
      force: false,
      noLineWait: false,
      report: true,
      timeoutMinutes: undefined,
      provider: 'openrouter',
      model: undefined,
      allowPreview: false,
    })
    expect(LIVE_CAP).toBe(45)
    expect(parse('--task', 'class-report, diagnose', '--runs', '2', '--cap', '9', '--live-used', '4', '--rehearse', 'done', '--reuse-worker', '--force', '--no-line-wait', '--no-report', '--timeout-minutes', '7', '--run-id', 'mine')).toMatchObject({
      tasks: ['class-report', 'diagnose'],
      runs: 2,
      cap: 9,
      usedOffset: 4,
      rehearse: 'done',
      reuseWorker: true,
      force: true,
      noLineWait: true,
      report: false,
      timeoutMinutes: 7,
      runId: 'mine',
      provider: 'openrouter',
    })
    expect(parse('--rehearse', 'done').runId).toBe('rehearsal-2026-11-15-10-30')
  })

  test('--provider ollama: the local cap of 6, a run folder that starts with local-, and --model', () => {
    expect(LOCAL_CAP).toBe(6)
    const a = parse('--task', 'class-report', '--runs', '3', '--provider', 'ollama')
    expect(a).toMatchObject({ provider: 'ollama', cap: 6, runs: 3, tasks: ['class-report'], runId: 'local-2026-11-15-10-30', model: undefined, allowPreview: false })
    expect(parse('--provider', 'ollama', '--model', 'gemma4:12b').model).toBe('gemma4:12b')
    expect(parse('--provider', 'ollama', '--cap', '2').cap).toBe(2)
    // a local model is slow: 30 minutes a job unless told otherwise
    expect(LOCAL_TIMEOUT_MINUTES).toBe(30)
    expect(parse('--provider', 'ollama').timeoutMinutes).toBe(30)
    expect(parse('--provider', 'ollama', '--timeout-minutes', '45').timeoutMinutes).toBe(45)
    expect(parse('--provider', 'ollama', '--run-id', 'mine').runId).toBe('local-mine')
    expect(parse('--provider', 'ollama', '--run-id', 'local-mine').runId).toBe('local-mine')
    expect(parse('--provider', 'ollama', '--rehearse', 'done').runId).toBe('rehearsal-2026-11-15-10-30')
  })

  test('--allow-preview is a plain switch', () => {
    expect(parse('--provider', 'ollama', '--allow-preview').allowPreview).toBe(true)
    expect(parse('--allow-preview').allowPreview).toBe(true)
  })

  test('a wrong provider, or --model without the local provider, is refused with a plain message', () => {
    expect(() => parse('--provider', 'cloud')).toThrow(/openrouter or ollama/)
    expect(() => parse('--provider')).toThrow(/openrouter or ollama/)
    expect(() => parse('--model', 'gemma4:26b')).toThrow(/--provider ollama/)
    expect(() => parse('--provider', 'ollama', '--model')).toThrow(/--model/)
  })
})

describe('the ledger keeps local runs apart from the OpenRouter cap', () => {
  const line = (over: Partial<Parameters<typeof appendLedger>[0]> = {}) => ({ at: 'a', runId: 'r', taskId: 'class-report', n: 1, attempts: 1, rehearsal: false, ...over })

  test('a local run is written with provider ollama and counted only against the local cap', () => {
    const file = join(root, 'ledger.jsonl')
    appendLedger(line({ attempts: 3 }), file)
    appendLedger(line({ runId: 'local-x', attempts: 1, provider: 'ollama' }), file)
    appendLedger(line({ runId: 'local-x', n: 2, attempts: 1, provider: 'ollama' }), file)
    appendLedger(line({ runId: 'rehearsal-y', attempts: 5, provider: 'ollama', rehearsal: true }), file)
    expect(readLedger(file).filter((l) => l.provider === 'ollama')).toHaveLength(3)
    expect(liveSpent(file)).toBe(3)
    expect(liveSpent(file, 'goose')).toBe(3)
    expect(liveSpent(file, 'goose', undefined, 'ollama')).toBe(2)
    expect(liveSpent(file, 'goose', 'local-x', 'ollama')).toBe(2)
    expect(liveSpent(file, 'goose', 'r', 'openrouter')).toBe(3)
  })

  test('the line of a finished run: OpenRouter as it always was, a local run with provider ollama', () => {
    const run = { at: '2026-11-15T11:00:00.000Z', runId: 'r', taskId: 'class-report', n: 2, attempts: 1 }
    expect(JSON.stringify(ledgerLine({ ...run, local: false }))).toBe('{"at":"2026-11-15T11:00:00.000Z","runId":"r","taskId":"class-report","n":2,"attempts":1,"rehearsal":false}')
    expect(JSON.stringify(ledgerLine({ ...run, runId: 'local-r', local: true }))).toBe('{"at":"2026-11-15T11:00:00.000Z","runId":"local-r","taskId":"class-report","n":2,"attempts":1,"rehearsal":false,"provider":"ollama"}')
    const file = join(root, 'ledger.jsonl')
    appendLedger(ledgerLine({ ...run, local: true }), file)
    appendLedger(ledgerLine({ ...run, local: false }), file)
    expect(liveSpent(file)).toBe(1)
    expect(liveSpent(file, 'goose', undefined, 'ollama')).toBe(1)
  })

  test('a line written before the field existed still counts as OpenRouter', () => {
    const file = join(root, 'ledger.jsonl')
    writeFileSync(file, JSON.stringify({ at: 'a', runId: 'r', taskId: 'class-report', n: 1, attempts: 4, rehearsal: false }) + '\n')
    expect(liveSpent(file)).toBe(4)
    expect(liveSpent(file, 'goose', undefined, 'ollama')).toBe(0)
  })
})

describe('the database guard: the preview project stays refused unless the flag is given', () => {
  test('without the flag the preview is refused, as today', () => {
    expect(() => assertAllowedDatabase({ SUPABASE_URL: PREVIEW })).toThrow(/JEMMA_ALLOWED_SUPABASE_REF/)
    expect(() => assertAllowedDatabase({ SUPABASE_URL: PREVIEW }, { allowPreview: false })).toThrow(/JEMMA_ALLOWED_SUPABASE_REF/)
    expect(() => assertAllowedDatabase({ SUPABASE_URL: PREVIEW }, {})).toThrow()
  })

  test('with the flag the preview is accepted, and nothing else new is', () => {
    expect(() => assertAllowedDatabase({ SUPABASE_URL: PREVIEW }, { allowPreview: true })).not.toThrow()
    expect(() => assertAllowedDatabase({ SUPABASE_URL: 'https://someotherprojectref.supabase.co' }, { allowPreview: true })).toThrow(/JEMMA_ALLOWED_SUPABASE_REF/)
    expect(() => assertAllowedDatabase({}, { allowPreview: true })).toThrow(/SUPABASE_URL/)
    expect(() => assertAllowedDatabase({ SUPABASE_URL: 'https://example.org/bpajgrjkbvyeeeyvixwf' }, { allowPreview: true })).toThrow()
  })

  test('what was allowed before is still allowed, with or without the flag', () => {
    for (const options of [undefined, { allowPreview: true }]) {
      expect(() => assertAllowedDatabase({ SUPABASE_URL: 'http://127.0.0.1:54321' }, options)).not.toThrow()
      expect(() => assertAllowedDatabase({ SUPABASE_URL: DEV }, options)).not.toThrow()
      expect(() => assertAllowedDatabase({ SUPABASE_URL: 'https://mine.supabase.co', JEMMA_ALLOWED_SUPABASE_REF: 'mine' }, options)).not.toThrow()
    }
  })
})

describe('the environment of a local run', () => {
  test('OpenRouter and Ollama cloud keys are taken out while it runs, and everything is put back', async () => {
    expect(KEEP_OUT).not.toContain('OPENROUTER_API_KEY')
    for (const name of KEEP_OUT) expect(LOCAL_KEEP_OUT).toContain(name)
    for (const name of ['OPENROUTER_API_KEY', 'OLLAMA_API_KEY', 'OLLAMA_CLOUD_API_KEY']) expect(LOCAL_KEEP_OUT).toContain(name)
    process.env.OPENROUTER_API_KEY = 'or-key-value'
    process.env.OPENAI_API_KEY = 'oa-key-value'
    let during: Record<string, string | undefined> = {}
    try {
      await withScrubbedEnv({ JEMMA_GOOSE_PROVIDER: 'ollama', OLLAMA_HOST: 'http://127.0.0.1:11434' }, async () => {
        during = { or: process.env.OPENROUTER_API_KEY, oa: process.env.OPENAI_API_KEY, provider: process.env.JEMMA_GOOSE_PROVIDER, host: process.env.OLLAMA_HOST }
      }, LOCAL_KEEP_OUT)
      expect(during).toEqual({ or: undefined, oa: undefined, provider: 'ollama', host: 'http://127.0.0.1:11434' })
      expect(process.env.OPENROUTER_API_KEY).toBe('or-key-value')
      expect(process.env.OPENAI_API_KEY).toBe('oa-key-value')
      expect(process.env.JEMMA_GOOSE_PROVIDER).toBeUndefined()
    } finally {
      delete process.env.OPENROUTER_API_KEY
      delete process.env.OPENAI_API_KEY
    }
  })
})

describe('what a run puts into the environment and takes out of it', () => {
  test('a local run: the provider, the model and the address in, every cloud model key out', () => {
    const plan = scrubPlan({ model: 'gemma4:26b', host: ollamaHost({}) }, null)
    expect(plan.values).toEqual({ JEMMA_GOOSE_PROVIDER: 'ollama', JEMMA_OPEN_MODEL: 'gemma4:26b', OLLAMA_HOST: 'http://127.0.0.1:11434' })
    expect(plan.keepOut).toBe(LOCAL_KEEP_OUT)
    expect(Object.keys(plan.values)).not.toContain('OPENROUTER_API_KEY')
  })

  test('any other run: the OpenRouter key in, as before', () => {
    const plan = scrubPlan(null, 'or-key')
    expect(plan.values).toEqual({ OPENROUTER_API_KEY: 'or-key' })
    expect(plan.keepOut).toBe(KEEP_OUT)
  })
})

describe('what a local result records', () => {
  const host = ollamaHost({})
  const clean = 'goose says: done\n{"type":"message"}\n'
  const attempt = (model = 'gemma4:26b', stdout = clean, stderr = '') => ({ model, stdout, stderr })

  test('a clean run on the local tag: provider, model, host and no cloud model called', () => {
    expect(localFacts({ model: 'gemma4:26b', host, attempts: [attempt()], childEnv: { PATH: '/bin', OLLAMA_HOST: host.url, GOOSE_PROVIDER: 'ollama' } })).toEqual({
      provider: 'ollama',
      model: 'gemma4:26b',
      host: '127.0.0.1',
      port: 11434,
      noCloudModelCalled: true,
      cloudEvidence: [],
    })
  })

  test('no attempt ran: nothing was called, but it is not claimed either', () => {
    expect(localFacts({ model: 'gemma4:26b', host, attempts: [], childEnv: {} })).toMatchObject({ noCloudModelCalled: null, cloudEvidence: [] })
  })

  test('another model, a cloud name in the transcript, a cloud key in the child environment or a host that is not this computer each say so', () => {
    expect(cloudCallEvidence({ model: 'gemma4:26b', host, attempts: [attempt('google/gemma-4-31b-it:free')], childEnv: {} })).toEqual(['attempt 1 ran on google/gemma-4-31b-it:free, not on gemma4:26b'])
    expect(cloudCallEvidence({ model: 'gemma4:26b', host, attempts: [attempt(), attempt('gemma4:26b', 'x https://openrouter.ai/api/v1 y')], childEnv: {} })).toEqual(['attempt 2: the transcript names openrouter'])
    expect(cloudCallEvidence({ model: 'gemma4:26b', host, attempts: [attempt('gemma4:26b', '', 'connecting to api.openai.com')], childEnv: {} })).toEqual(['attempt 1: the transcript names api.openai.com'])
    expect(cloudCallEvidence({ model: 'gemma4:26b', host, attempts: [attempt()], childEnv: { OPENROUTER_API_KEY: 'k', ZED_API_KEY: 'z', PATH: '/bin' } })).toEqual(['the goose environment held OPENROUTER_API_KEY, ZED_API_KEY'])
    expect(cloudCallEvidence({ model: 'gemma4:26b', host: ollamaHost({ OLLAMA_HOST: 'https://ollama.com' }), attempts: [attempt()], childEnv: {} })).toEqual(['the host ollama.com is not this computer'])
    const facts = localFacts({ model: 'gemma4:26b', host, attempts: [attempt('other:tag')], childEnv: {} })
    expect(facts.noCloudModelCalled).toBe(false)
    expect(facts.cloudEvidence).toHaveLength(1)
  })

  test('the evidence never holds a secret value', () => {
    const lines = cloudCallEvidence({ model: 'm', host, attempts: [attempt()], childEnv: { OPENROUTER_API_KEY: 'or-secret-value' } })
    expect(lines.join(' ')).not.toContain('or-secret-value')
  })

  test('a result file with the local fields is read back, and wrong types are refused', () => {
    const local = result('class-report', 1, { runId: 'local-x', provider: 'ollama', model: 'gemma4:26b', host: '127.0.0.1', port: 11434, noCloudModelCalled: true, cloudEvidence: [] })
    expect(parseResult(JSON.stringify(local), 'f')).toMatchObject({ provider: 'ollama', model: 'gemma4:26b', host: '127.0.0.1', noCloudModelCalled: true })
    expect(parseResult(JSON.stringify(result('class-report', 1)), 'f').provider).toBeUndefined()
    expect(() => parseResult(JSON.stringify({ ...local, provider: 'cloud' }), 'f')).toThrow(/provider/)
    expect(() => parseResult(JSON.stringify({ ...local, noCloudModelCalled: 'yes' }), 'f')).toThrow(/noCloudModelCalled/)
    expect(() => parseResult(JSON.stringify({ ...local, cloudEvidence: 'none' }), 'f')).toThrow(/cloudEvidence/)
  })
})

describe('is Ollama ready, before the first run', () => {
  const host = ollamaHost({})
  const answer = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as typeof fetch

  test('ready: the server answers and has the tag', async () => {
    const seen: string[] = []
    const fetchFn = (async (url: string | URL | Request) => {
      seen.push(String(url))
      return new Response(JSON.stringify({ models: [{ name: 'gemma4:26b', model: 'gemma4:26b' }, { name: 'qwen3:latest', model: 'qwen3:latest' }] }))
    }) as typeof fetch
    expect(await checkOllamaReady({ host, model: 'gemma4:26b', fetchFn })).toBeNull()
    expect(seen).toEqual(['http://127.0.0.1:11434/api/tags'])
    // a tag with no version means :latest
    expect(await checkOllamaReady({ host, model: 'qwen3', fetchFn })).toBeNull()
  })

  test('not ready: nothing answers, the model is not pulled, or the answer is wrong', async () => {
    const down = (async () => {
      throw new Error('connect ECONNREFUSED 127.0.0.1:11434')
    }) as typeof fetch
    expect(await checkOllamaReady({ host, model: 'gemma4:26b', fetchFn: down })).toMatch(/does not answer at http:\/\/127\.0\.0\.1:11434.*ollama serve/)
    expect(await checkOllamaReady({ host, model: 'gemma4:26b', fetchFn: answer({ models: [{ name: 'qwen3:latest', model: 'qwen3:latest' }] }) })).toMatch(/no model called gemma4:26b.*ollama pull gemma4:26b/)
    expect(await checkOllamaReady({ host, model: 'gemma4:26b', fetchFn: answer({ models: [] }) })).toMatch(/no model called/)
    expect(await checkOllamaReady({ host, model: 'gemma4:26b', fetchFn: answer({}, 500) })).toMatch(/answered 500/)
    expect(await checkOllamaReady({ host, model: 'gemma4:26b', fetchFn: answer('not a list') })).toMatch(/did not answer with a list of models/)
  })
})

/** A local result of a task, the way the harness saves it. */
const localResult = (taskId: string, n: number, over: Partial<ReturnType<typeof result>> = {}) =>
  result(taskId, n, {
    runId: 'local-2026-11-15-11-00',
    startedAt: `2026-11-15T11:0${n}:00.000Z`,
    seconds: 300 + n * 30,
    provider: 'ollama',
    model: 'gemma4:26b',
    host: '127.0.0.1',
    port: 11434,
    noCloudModelCalled: true,
    cloudEvidence: [],
    finalModel: 'gemma4:26b',
    attempts: [{ model: 'gemma4:26b', seconds: 300 + n * 30, status: 'done', note: 'All finished.', saved: true, timedOut: false, tokens: { input: 60_000, output: 3_000, costUsd: 0 } }],
    tokens: { input: 60_000, output: 3_000, costUsd: 0 },
    ...over,
  })

function writeFolder(name: string, taskList: string[], make: (taskId: string, n: number) => ReturnType<typeof result>, runs = 3): string {
  const dir = join(root, name)
  mkdirSync(dir, { recursive: true })
  for (const id of taskList) {
    for (let n = 1; n <= runs; n++) {
      writeFileSync(join(dir, `${baseName(id, n)}.json`), JSON.stringify(make(id, n), null, 2))
      writeFileSync(join(dir, `${baseName(id, n)}.jsonl`), '{"type":"jemma_attempt"}\n')
    }
  }
  return dir
}

describe('local run folders are not the main run and not a second model', () => {
  test('a folder that starts with local- is recognised, listed apart and never offered as the main run', () => {
    expect(isLocalRunFolder('local-2026-11-15-11-00')).toBe(true)
    expect(isLocalRunFolder('2026-11-10-full')).toBe(false)
    expect(isLocalRunFolder('rehearsal-local-x')).toBe(false)
    writeFolder('2026-11-10-full', ['class-report'], (id, n) => result(id, n))
    writeFolder('local-2026-11-15-11-00', ['class-report'], (id, n) => localResult(id, n))
    expect(listRunFolders(root).map((f) => f.name)).toEqual(['2026-11-10-full'])
    expect(listLocalRunFolders(root)).toEqual(['local-2026-11-15-11-00'])
    // even a local folder that covers every task, and is newer, is never the main run
    expect(chooseMainRun([{ name: '2026-11-10-full', taskIds }, { name: 'local-2026-11-15-11-00', taskIds }], taskIds)).toBe('2026-11-10-full')
  })

  test('the report refuses a local folder as its main run', async () => {
    writeFolder('local-2026-11-15-11-00', taskIds, (id, n) => localResult(id, n))
    await expect(writeReport({ runId: 'local-2026-11-15-11-00', resultsRoot: root, outFile: join(root, 'EVALS.md'), ledgerFile: join(root, 'ledger.jsonl') })).rejects.toThrow(/local run/)
  })
})

describe('the report section "On this machine"', () => {
  const mainResults = tasks.flatMap((t) => [1, 2, 3].map((n) => result(t.id, n)))
  const base: ReportInput = { runId: '2026-11-10-full', results: mainResults, tasks, runs: 3, pricing: null, analysis: null, packetLiveRuns: null }
  const sectionOf = (text: string) => /^## On this machine\n[\s\S]*?(?=^## |(?![\s\S]))/m.exec(text)?.[0] ?? ''

  test('no local result, no section, and the report is the same as before', () => {
    const plain = renderReport(base)
    expect(plain).not.toContain('On this machine')
    expect(renderReport({ ...base, local: [] })).toBe(plain)
  })

  test('with local results the section lists each run (task, model, pass or fail, minutes) and nothing else in the report changes', () => {
    const plain = renderReport(base)
    const local = [
      {
        runId: 'local-2026-11-15-11-00',
        results: [localResult('class-report', 1), localResult('class-report', 2, { pass: false, checks: [{ name: 'the event ended done', pass: false, detail: 'status=failed' }], noCloudModelCalled: false, cloudEvidence: ['attempt 1: the transcript names openrouter'] }), localResult('class-report', 3, { seconds: 600 })],
      },
    ]
    const text = renderReport({ ...base, local })
    const section = sectionOf(text)
    expect(section).toContain('## On this machine')
    expect(section).toContain('| Run id | Task | Model | Run | Result | Minutes | No cloud model called |')
    expect(section).toContain('| `local-2026-11-15-11-00` | `class-report` | `gemma4:26b` | 1 | pass | 5.5 | yes |')
    expect(section).toContain('| `local-2026-11-15-11-00` | `class-report` | `gemma4:26b` | 2 | fail | 6 | no |')
    expect(section).toContain('| `local-2026-11-15-11-00` | `class-report` | `gemma4:26b` | 3 | pass | 10 | yes |')
    expect(section).toContain('127.0.0.1')
    expect(section).toContain('attempt 1: the transcript names openrouter')
    expect(section).not.toContain(String.fromCharCode(0x2014))
    // the rest of the file is the file of before
    expect(text.replace(section, '')).toBe(plain)
    expect(text.indexOf('## On this machine')).toBeGreaterThan(text.indexOf('### What the system caught'))
    expect(text.indexOf('## On this machine')).toBeLessThan(text.indexOf('## Cost'))
  })

  test('a run that was not marked either way says so', () => {
    const text = renderReport({ ...base, local: [{ runId: 'local-x', results: [localResult('class-report', 1, { noCloudModelCalled: null, attempts: [], finalModel: null, tokens: null })] }] })
    expect(sectionOf(text)).toContain('| `local-x` | `class-report` | `gemma4:26b` | 1 | pass | 5.5 | not known |')
  })
})

describe('writing the report with a local folder on disk', () => {
  const askedFor: string[] = []
  const counting = (async (url: string | URL | Request) => {
    askedFor.push(String(url))
    return new Response(JSON.stringify({ data: [] }))
  }) as typeof fetch
  // the price of the one model the main folder used, already saved, so the main report needs no network either
  const pricing = JSON.stringify({
    fetchedAt: '2026-11-10',
    source: 'https://openrouter.ai/api/v1/models',
    models: { 'nvidia/nemotron-3.5-super-vl:free': { paidId: 'nvidia/nemotron-3.5-super-vl', promptPerM: 0.1, completionPerM: 0.4, freeListed: true } },
  })

  test('the section appears, the price is never asked for a local model, and the OpenRouter count leaves the local lines out', async () => {
    const main = writeFolder('2026-11-10-full', taskIds, (id, n) => result(id, n))
    writeFileSync(join(main, 'pricing.json'), pricing)
    writeFolder('local-2026-11-15-11-00', ['class-report'], (id, n) => localResult(id, n))
    const ledger = join(root, 'ledger.jsonl')
    appendLedger({ at: 'a', runId: '2026-11-10-full', taskId: 'class-report', n: 1, attempts: 48, rehearsal: false }, ledger)
    appendLedger({ at: 'b', runId: 'local-2026-11-15-11-00', taskId: 'class-report', n: 1, attempts: 5, rehearsal: false, provider: 'ollama' }, ledger)
    const withLocal = await writeReport({ runId: '2026-11-10-full', resultsRoot: root, outFile: join(root, 'EVALS.md'), ledgerFile: ledger, fetchFn: counting })
    expect(askedFor).toEqual([])
    expect(withLocal).toContain('## On this machine')
    expect(withLocal).toContain('| `local-2026-11-15-11-00` | `class-report` | `gemma4:26b` | 1 | pass |')
    expect(withLocal).toContain('48 live goose runs were spent in all')
    expect(withLocal).not.toContain('A second open-weights model on one task')
    expect(readFileSync(join(root, 'EVALS.md'), 'utf8')).toBe(withLocal)

    rmSync(join(root, 'local-2026-11-15-11-00'), { recursive: true })
    const without = await writeReport({ runId: '2026-11-10-full', resultsRoot: root, outFile: join(root, 'EVALS.md'), ledgerFile: ledger, fetchFn: counting })
    expect(without).not.toContain('On this machine')
    expect(withLocal.replace(/^## On this machine\n[\s\S]*?(?=^## )/m, '')).toBe(without)
  })

  test('a folder named local- that holds a result from another provider is refused', async () => {
    const main = writeFolder('2026-11-10-full', taskIds, (id, n) => result(id, n))
    writeFileSync(join(main, 'pricing.json'), pricing)
    writeFolder('local-oops', ['class-report'], (id, n) => result(id, n))
    await expect(writeReport({ runId: '2026-11-10-full', resultsRoot: root, outFile: join(root, 'EVALS.md'), ledgerFile: join(root, 'ledger.jsonl'), fetchFn: counting })).rejects.toThrow(/local-oops.*not a local run/)
  })
})
