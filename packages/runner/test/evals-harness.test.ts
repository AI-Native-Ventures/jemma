import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { classReport } from '../../../evals/tasks/class-report'
import { KEEP_OUT, withScrubbedEnv } from '../../../evals/lib/env'
import { hookFinish, settledEvent } from '../../../evals/lib/hook'
import { appendLedger, liveSpent, readLedger } from '../../../evals/lib/ledger'
import { assertNoLeaks, clean } from '../../../evals/lib/redact'
import { parseResult } from '../../../evals/lib/result'
import { saveResult } from '../../../evals/lib/save'
import { answerContentTypes, streamLines } from '../../../evals/lib/stream'
import { parseTranscript, runJob, type GooseAttempt } from '../src'
import { startFakeMcp, type FakeMcp } from './fake-mcp'
import { gooseStream, outcome, result } from './evals-fixtures'
import { newLog, useFakes } from './helpers'

// Built from parts so that no source file spells out this Mac's folder names.
const COORD = ['coord', 'work'].join('-')
const CLAUDE_DIR = ['.claude', 'skills'].join('/')
const DASH = String.fromCharCode(0x2014)
const USERS = ['', 'Users'].join('/')

describe('nothing secret or local is saved', () => {
  const secrets = ['tok-0123456789abcdef', 'or-key-SECRETVALUE']
  test('the token, the key, the home folder, the temp folders, the header words and em dashes are taken out', () => {
    const dirty = [
      `Authorization: Bearer ${secrets[0]}`,
      `key ${secrets[1]} and ${homedir()}/Jemma/reports/x.md`,
      `${USERS}/someone/${CLAUDE_DIR}/thing and ${USERS}/mac/${COORD}/run.sh`,
      `${tmpdir()}/jemma-job-abc/recipe.yaml and ${tmpdir()}/jemma-evals-x/a/b/reports/class_report-k.md`,
      `a dash ${DASH} here`,
    ].join('\n')
    const { text, scrubbed } = clean(dirty, secrets, [[`${tmpdir()}/jemma-evals-x/a/b/reports`, '<reports>']])
    expect(scrubbed).toBe(true)
    for (const s of secrets) expect(text).not.toContain(s)
    expect(text).toContain('[redacted]')
    expect(text).not.toMatch(/\/Users\/|authorization|bearer/i)
    expect(text).not.toContain(CLAUDE_DIR)
    expect(text).not.toContain(COORD)
    expect(text).toContain('<reports>/class_report-k.md')
    expect(text).not.toContain(DASH)
    expect(() => assertNoLeaks(text, secrets, 'test')).not.toThrow()
  })
  test('clean text that held nothing sensitive is not marked as scrubbed, except for an em dash', () => {
    expect(clean('plain text, Q1 and Q4', secrets)).toEqual({ text: 'plain text, Q1 and Q4', scrubbed: false })
    expect(clean(`a ${DASH} b`, secrets)).toEqual({ text: 'a - b', scrubbed: false })
  })
  test('the guard refuses a text that still holds a secret, a local path, a header word or a dash', () => {
    expect(() => assertNoLeaks(`x ${secrets[0]} y`, secrets, 'file')).toThrow(/secret/)
    expect(() => assertNoLeaks(`see ${USERS}/mac/x`, secrets, 'file')).toThrow()
    expect(() => assertNoLeaks(`in ${COORD}`, secrets, 'file')).toThrow()
    expect(() => assertNoLeaks('Authorization: x', secrets, 'file')).toThrow()
    expect(() => assertNoLeaks(`a ${DASH} b`, secrets, 'file')).toThrow(/em dash/)
  })

  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'jemma-evals-save-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  test('saveResult writes a result and a stream that pass the same grep the acceptance uses', () => {
    const png = 'A'.repeat(400)
    const stdout = gooseStream(
      [
        { name: 'jemma__get_paper', input: { paperId: 'p' }, output: 'ok', content: [{ type: 'text', text: 'ok' }, { type: 'image', data: png, mimeType: 'image/png' }] },
        { name: 'files__read_text_file', input: { path: `${homedir()}/x` }, output: `Authorization: Bearer ${secrets[0]}` },
      ],
      { say: `done ${DASH} with ${secrets[1]}` },
    )
    const attempt = { model: 'm:free', seconds: 3.2, status: 'done', timedOut: false, saved: true, stdout }
    const saved = saveResult(result('class-report', 1, { facts: { reportsDir: '/private/x/a/b/reports', note: `see ${homedir()}/y` } }), [attempt], secrets, dir, [['/private/x/a/b/reports', '<reports>']])
    expect(saved.scrubbed).toBe(true)
    const files = readdirSync(dir).sort()
    expect(files).toEqual(['class-report-1.json', 'class-report-1.jsonl'])
    const json = readFileSync(join(dir, files[0]!), 'utf8')
    const stream = readFileSync(join(dir, files[1]!), 'utf8')
    for (const text of [json, stream]) {
      for (const s of secrets) expect(text).not.toContain(s)
      expect(text).not.toMatch(/\/Users\/|\.claude\/|authorization|bearer/i)
      expect(text).not.toContain(COORD)
      expect(text).not.toContain(DASH)
    }
    expect(json).toContain('<reports>')
    expect(stream).not.toContain(png)
    expect(stream).toContain('400 characters of image data')
    expect(stream.split('\n')[0]).toContain('"type":"jemma_attempt"')
    expect(stream).not.toContain('goose')
    expect(parseResult(json, 'saved').taskId).toBe('class-report')
    // the stream still parses the way the runner reads it
    const jsonl = stream.split('\n').filter((l) => l.startsWith('{') && !l.includes('jemma_attempt')).join('\n')
    expect(parseTranscript('goose', jsonl).toolCalls).toEqual(['jemma__get_paper', 'files__read_text_file'])
  })
})

describe('the stream helpers', () => {
  test('answer content types show whether an image came through', () => {
    const stdout = gooseStream([
      { name: 'jemma__get_paper', input: {}, output: 'ok', content: [{ type: 'text', text: 'ok' }, { type: 'image', data: 'B'.repeat(10), mimeType: 'image/png' }] },
      { name: 'jemma__get_memo', input: {}, output: 'ok' },
    ])
    expect(answerContentTypes(stdout)).toEqual({ jemma__get_paper: ['image', 'text'], jemma__get_memo: ['text'] })
    expect(answerContentTypes('not json\n{broken')).toEqual({})
  })
  test('the saved stream keeps one header per attempt and drops the banner', () => {
    const lines = streamLines([
      { model: 'a:free', seconds: 1.234, status: 'failed', timedOut: false, saved: false, stdout: 'banner\n{"type":"complete"}\n' },
      { model: 'b:free', seconds: 2, status: 'done', timedOut: false, saved: true, stdout: '{"type":"complete"}\n' },
    ]).trim().split('\n')
    expect(lines).toHaveLength(4)
    expect(JSON.parse(lines[0]!)).toEqual({ type: 'jemma_attempt', model: 'a:free', seconds: 1.2, status: 'failed', timedOut: false, saved: false })
    expect(JSON.parse(lines[2]!).model).toBe('b:free')
  })
})

describe('waiting for the runner to settle the event', () => {
  test('finish_event is noticed, other calls pass through untouched, and the client keeps its own `this`', async () => {
    const seen: string[] = []
    const fake = {
      marker: 7,
      rpc(fn: string, args: unknown) {
        seen.push(`${fn}:${JSON.stringify(args)}:${(this as { marker: number }).marker}`)
        return Promise.resolve({ data: null, error: null })
      },
      from(table: string) {
        return `${table}:${(this as { marker: number }).marker}`
      },
    }
    let finished = 0
    const hooked = hookFinish(fake as never, () => finished++) as unknown as typeof fake
    await hooked.rpc('claim_event', { runner: 'r' })
    expect(finished).toBe(0)
    await hooked.rpc('finish_event', { event: 'e' })
    await new Promise((r) => setTimeout(r, 0))
    expect(finished).toBe(1)
    expect(seen).toEqual(['claim_event:{"runner":"r"}:7', 'finish_event:{"event":"e"}:7'])
    expect(hooked.from('events')).toBe('events:7')
  })
})

describe('the environment goose sees', () => {
  test('secrets are out only while the work runs, and the key is in; everything is put back afterwards', async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-value'
    process.env.EVENTS_SECRET = 'events-secret-value'
    delete process.env.OPENROUTER_API_KEY
    let during: Record<string, string | undefined> = {}
    await withScrubbedEnv({ OPENROUTER_API_KEY: 'or-key' }, async () => {
      during = { service: process.env.SUPABASE_SERVICE_ROLE_KEY, events: process.env.EVENTS_SECRET, key: process.env.OPENROUTER_API_KEY }
    })
    expect(during).toEqual({ service: undefined, events: undefined, key: 'or-key' })
    expect(process.env.SUPABASE_SERVICE_ROLE_KEY).toBe('service-key-value')
    expect(process.env.EVENTS_SECRET).toBe('events-secret-value')
    expect(process.env.OPENROUTER_API_KEY).toBeUndefined()
    await expect(withScrubbedEnv({}, async () => { throw new Error('boom') })).rejects.toThrow('boom')
    expect(process.env.SUPABASE_SERVICE_ROLE_KEY).toBe('service-key-value')
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    delete process.env.EVENTS_SECRET
    expect(KEEP_OUT).toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(KEEP_OUT).not.toContain('OPENROUTER_API_KEY')
  })
})

describe('the live cap ledger', () => {
  test('counts goose attempts of live runs only, across restarts', () => {
    const dir = mkdtempSync(join(tmpdir(), 'jemma-evals-ledger-'))
    const file = join(dir, 'nested', 'ledger.jsonl')
    try {
      expect(liveSpent(file)).toBe(0)
      appendLedger({ at: 'a', runId: 'r', taskId: 'class-report', n: 1, attempts: 1, rehearsal: false }, file)
      appendLedger({ at: 'b', runId: 'r', taskId: 'model-down-recovery', n: 1, attempts: 2, rehearsal: false }, file)
      appendLedger({ at: 'c', runId: 'rehearsal-x', taskId: 'class-report', n: 1, attempts: 5, rehearsal: true }, file)
      expect(readLedger(file)).toHaveLength(3)
      expect(liveSpent(file)).toBe(3)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('a real runJob with the fake goose feeds the checks', () => {
  let restore: () => void
  let mcp: FakeMcp
  let reports: string
  beforeAll(() => {
    restore = useFakes()
  })
  afterAll(() => restore())
  beforeEach(async () => {
    newLog()
    process.env.FAKE_MODE = 'done'
    delete process.env.FAKE_GOOSE_MODES
    reports = mkdtempSync(join(tmpdir(), 'jemma-reports-'))
    process.env.OPENROUTER_API_KEY = 'or-key-xyz'
    mcp = await startFakeMcp({ withTool: true, token: 'tok-secret' })
  })
  afterEach(async () => {
    rmSync(reports, { recursive: true, force: true })
    await mcp.close()
    delete process.env.OPENROUTER_API_KEY
  })

  const prompt = ['You are running one Jemma job for event e.', 'Job: class_report', 'Ids: {"classId":"k","testId":"t"}', '', 'Use only the Jemma MCP tools.'].join('\n')

  /** What the harness does with a finished run: parse each attempt's stream into calls, attempts and an outcome. */
  async function harnessOutcome(models: string[]) {
    const raw: GooseAttempt[] = []
    const res = await runJob({ eventId: 'e', prompt }, 'goose', { url: mcp.url, token: 'tok-secret' }, { timeoutMs: 20_000, models, reportsDir: reports, onAttempt: (a) => raw.push(a) })
    const parsed = raw.map((a) => parseTranscript('goose', a.stdout))
    return {
      res,
      raw,
      out: outcome({
        run: res,
        attempts: raw.map((a, i) => ({ model: a.model, seconds: a.seconds, status: a.status, note: a.note, saved: a.saved, timedOut: a.timedOut, tokens: parsed[i]!.usage ? { input: parsed[i]!.usage!.inputTokens, output: parsed[i]!.usage!.outputTokens, costUsd: 0 } : null })),
        calls: parsed.flatMap((p) => p.calls),
        callsByAttempt: parsed.map((p) => p.calls),
      }),
    }
  }

  test('the transcript of a finished fake run has the calls the class report check looks for', async () => {
    const { res, out } = await harnessOutcome(['model-a:free'])
    expect(res.status).toBe('done')
    expect(out.calls.map((c) => `${c.server}__${c.tool}`)).toEqual(['jemma__get_job', 'jemma__class_gap_report', 'files__write_file', 'jemma__complete_job'])
    // prepared rows for a run that did what the fake goose says it did
    const content = { title: 'T', minutes: 10, audience: 'A', youNeed: 'Y', steps: [{ minutes: 10, text: 'S' }], exitQuestion: 'Q' }
    const facts = {
      reteachRows: 1,
      reteach: { topicName: 'Adding fractions', content, why: 'They add fractions the wrong way.', missingBasic: 'Equivalent fractions', explanation: 'Adding fractions needs one bottom number.' },
      classGapTopics: ['Adding fractions'],
      outOf: 10,
      reportName: 'class_report-k.md',
      report: '# Report. Questions 1 and 2.',
      reportChars: 27,
      classReportActivity: 1,
    }
    const state = { classId: 'k', testId: 't', paperId: 'p', before: null }
    const checks = classReport.checks(facts, { event: { type: 'paper.checked', payload: { paperId: 'p' } }, state }, out)
    expect(checks.filter((c) => !c.pass)).toEqual([])
  })

  test('a provider error on the first model shows as a failed first attempt and a done second one', async () => {
    process.env.FAKE_GOOSE_MODES = JSON.stringify({ 'model-a:free': 'provider_error', 'model-b:free': 'done' })
    const { out } = await harnessOutcome(['model-a:free', 'model-b:free'])
    expect(out.attempts.map((a) => [a.model, a.status, a.saved])).toEqual([['model-a:free', 'failed', false], ['model-b:free', 'done', true]])
    expect(out.attempts[0]!.note).not.toContain(DASH)
    expect(out.callsByAttempt[0]).toEqual([])
    expect(out.callsByAttempt[1]).toHaveLength(4)
  })

  test('a run whose save never came is a failed event with no save call', async () => {
    process.env.FAKE_MODE = 'read_only'
    const { out } = await harnessOutcome(['model-a:free'])
    expect(out.attempts[0]!.status).toBe('failed')
    expect(out.calls.some((c) => c.tool === 'class_gap_report')).toBe(false)
    const failed = classReport.checks(
      { reteachRows: 1, reteach: null, classGapTopics: [], outOf: 10, reportName: 'x', report: null, reportChars: 0, classReportActivity: 0 },
      { event: { type: 'paper.checked', payload: { paperId: 'p' } }, state: { classId: 'k', testId: 't', paperId: 'p', before: null } },
      { ...out, event: { status: 'failed', error: 'class_report: I looked and stopped.', runner: 'desktop', attempts: 1 } },
    )
    expect(failed.find((c) => c.name === 'the event ended done')!.pass).toBe(false)
  })
})

describe('an event that the runner could not settle at once (a slow or dropped line)', () => {
  test('a failed finish_event call is recorded with its message, and still wakes the waiter', async () => {
    const answers = [{ error: { message: 'TypeError: fetch failed' } }, { error: null }]
    const fake = { rpc: () => Promise.resolve(answers.shift()) }
    let finished = 0
    const errors: string[] = []
    const hooked = hookFinish(fake as never, () => finished++, errors) as unknown as { rpc: (fn: string) => Promise<unknown> }
    await hooked.rpc('finish_event')
    await hooked.rpc('finish_event')
    await new Promise((r) => setTimeout(r, 0))
    expect(finished).toBe(2)
    expect(errors).toEqual(['finish_event said: TypeError: fetch failed'])
  })

  test('settledEvent keeps reading until the event is done or failed, so a retry after a failed call is seen', async () => {
    const rows = [{ status: 'running' }, { status: 'running' }, { status: 'failed' }]
    let i = 0
    const waits: number[] = []
    const got = await settledEvent(async () => rows[Math.min(i++, rows.length - 1)]!, { timeoutMs: 60_000, pollMs: 1_000, sleep: async (ms) => void waits.push(ms), now: () => waits.length * 1_000 })
    expect(got).toEqual({ status: 'failed' })
    expect(waits).toEqual([1_000, 1_000])
  })

  test('an event that stays running is returned as it is after the time is up, not waited on for ever', async () => {
    let t = 0
    const got = await settledEvent(async () => ({ status: 'running' }), { timeoutMs: 5_000, pollMs: 1_000, sleep: async (ms) => void (t += ms), now: () => t })
    expect(got).toEqual({ status: 'running' })
    expect(t).toBeGreaterThanOrEqual(5_000)
    expect(t).toBeLessThan(7_000)
  })

  test('an event that is already done is returned without waiting', async () => {
    let slept = 0
    expect(await settledEvent(async () => ({ status: 'done' }), { timeoutMs: 5_000, pollMs: 1_000, sleep: async () => void slept++, now: () => 0 })).toEqual({ status: 'done' })
    expect(slept).toBe(0)
  })
})
