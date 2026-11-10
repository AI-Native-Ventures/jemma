import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'vitest'
import { runJob, type GooseAttempt } from '../src'
import { startFakeMcp, type FakeMcp } from './fake-mcp'
import { alive, newLog, readLog, useFakes } from './helpers'

const prompt = [
  'You are running one Jemma job for event evt-1.',
  'Job: class_report',
  'Ids: {"classId":"class-1","testId":"test-1"}',
  '',
  'Use only the Jemma MCP tools.',
].join('\n')
const job = { eventId: 'evt-1', prompt }
const MODELS = ['model-a:free', 'model-b:free', 'model-c:free']

let restore: () => void
let log: string
let mcpServer: FakeMcp
let reports: string
const savedKey = process.env.OPENROUTER_API_KEY

beforeAll(() => {
  restore = useFakes()
})
afterAll(() => restore())
beforeEach(async () => {
  log = newLog()
  delete process.env.FAKE_GOOSE_MODES
  process.env.FAKE_MODE = 'done'
  reports = mkdtempSync(join(tmpdir(), 'jemma-reports-'))
  process.env.OPENROUTER_API_KEY = 'or-key-xyz'
  mcpServer = await startFakeMcp({ withTool: true, token: 'tok-secret' })
})
afterEach(async () => {
  await mcpServer.close()
  if (savedKey === undefined) delete process.env.OPENROUTER_API_KEY
  else process.env.OPENROUTER_API_KEY = savedKey
})

const target = () => ({ url: mcpServer.url, token: 'tok-secret' })
const opts = (extra: Record<string, unknown> = {}) => ({ timeoutMs: 20_000, models: MODELS, reportsDir: reports, ...extra })
const runs = () => readLog(log).filter((l) => l.bin === 'goose')

test('goose gets the recipe, never the token in argv, the key and the keychain switch in its environment, and no stdin', async () => {
  process.env.FAKE_MODE = 'done'
  const res = await runJob(job, 'goose', target(), opts())
  expect(res).toEqual({ status: 'done', note: 'All finished.' })

  const [call] = runs()
  const args: string[] = call!.args
  expect(args.slice(0, 2)).toEqual(['run', '--recipe'])
  for (const flag of ['--no-session', '--no-profile']) expect(args).toContain(flag)
  expect(args[args.indexOf('--max-turns') + 1]).toBe('20')
  expect(args[args.indexOf('--output-format') + 1]).toBe('stream-json')
  expect(args.join(' ')).not.toContain('tok-secret')
  expect(args.join(' ')).not.toContain('Read the paper')
  expect(call!.recipeMode).toBe(0o600)
  expect(call!.stdin).toBe('')
  expect(call!.key).toBe('or-key-xyz')
  expect(call!.keyring).toBe('1')
  expect(call!.token).toBe('tok-secret')
  // the recipe holds the token and the prompt, and the model that ran
  expect(call!.recipe).toContain('Authorization: "Bearer tok-secret"')
  expect(call!.recipe).toContain(`uri: "${mcpServer.url}"`)
  expect(call!.recipe).toContain('goose_model: "model-a:free"')
  expect(call!.recipe).toContain('Job: class_report')
  // class_report also asks for the Markdown copy, written to the reports folder
  expect(call!.recipe).toMatch(/class_report-class-1\.md/)
  expect(call!.recipe).toContain('files write_file tool')
})

test('the borrowed calls and the cost are reported once, to the same server and token, with the model that ran', async () => {
  process.env.FAKE_MODE = 'done'
  await runJob(job, 'goose', target(), opts())
  expect(mcpServer.inputs).toHaveLength(1)
  const sent = mcpServer.inputs[0] as { eventId: string; engine: string; model: string; usage: unknown; calls: { server: string; tool: string; ok: boolean; at: string }[] }
  expect(sent).toMatchObject({ eventId: 'evt-1', engine: 'goose', model: 'model-a:free', usage: { inputTokens: 100, outputTokens: 10, costUsd: 0 } })
  expect(sent.calls.map((c) => `${c.server}.${c.tool}`)).toEqual(['files.write_file'])
  expect(sent.calls[0]).toMatchObject({ ok: true, input: { path: '/reports/class_report-k.md' } })
  expect(sent.calls[0]!.at).toMatch(/^2026-|^20\d\d-/)
  expect(mcpServer.auth.every((a) => a === 'Bearer tok-secret')).toBe(true)
})

test('a server without log_external_calls does not fail the job', async () => {
  await mcpServer.close()
  mcpServer = await startFakeMcp({ withTool: false, token: 'tok-secret' })
  process.env.FAKE_MODE = 'done'
  expect(await runJob(job, 'goose', target(), opts())).toEqual({ status: 'done', note: 'All finished.' })
  expect(mcpServer.inputs).toEqual([])
})

test('a provider error before any save moves to the next model, once through the list', async () => {
  process.env.FAKE_GOOSE_MODES = JSON.stringify({ 'model-a:free': 'provider_error', 'model-b:free': 'provider_error', 'model-c:free': 'done' })
  const attempts: GooseAttempt[] = []
  const res = await runJob(job, 'goose', target(), opts({ onAttempt: (a: GooseAttempt) => attempts.push(a) }))
  expect(res.status).toBe('done')
  expect(runs().map((r) => r.model)).toEqual(['model-a:free', 'model-b:free', 'model-c:free'])
  expect(attempts.map((a) => [a.model, a.status, a.saved])).toEqual([
    ['model-a:free', 'failed', false],
    ['model-b:free', 'failed', false],
    ['model-c:free', 'done', true],
  ])
  expect(attempts[0]!.note).toContain('server error')
  // the report names the model that finally did it
  expect(mcpServer.inputs).toHaveLength(1)
  expect(mcpServer.inputs[0]).toMatchObject({ model: 'model-c:free' })
})

test('a model that only read and stopped also moves on', async () => {
  process.env.FAKE_GOOSE_MODES = JSON.stringify({ 'model-a:free': 'read_only', 'model-b:free': 'done' })
  expect((await runJob(job, 'goose', target(), opts())).status).toBe('done')
  expect(runs().map((r) => r.model)).toEqual(['model-a:free', 'model-b:free'])
})

test('after a save went through the job is never run again', async () => {
  process.env.FAKE_GOOSE_MODES = JSON.stringify({ 'model-a:free': 'saved_then_fail', 'model-b:free': 'done' })
  const res = await runJob(job, 'goose', target(), opts())
  expect(res.status).toBe('failed')
  expect(res.note).toContain('Provider error after the save.')
  expect(res.note).toContain('not run again')
  expect(runs().map((r) => r.model)).toEqual(['model-a:free'])
})

test('a complete_job that errored after a save is not rerun either', async () => {
  process.env.FAKE_GOOSE_MODES = JSON.stringify({ 'model-a:free': 'tool_error', 'model-b:free': 'done' })
  const res = await runJob(job, 'goose', target(), opts())
  expect(res.status).toBe('failed')
  expect(runs()).toHaveLength(1)
})

test('when every model fails, each was tried once and the note says why', async () => {
  process.env.FAKE_MODE = 'provider_error'
  const res = await runJob(job, 'goose', target(), opts())
  expect(res.status).toBe('failed')
  expect(runs().map((r) => r.model)).toEqual(MODELS)
  expect(res.note).toContain('no model finished the job')
  expect(res.note).toContain('model-a:free')
  expect(res.note).not.toMatch(/—/)
})

test('a timeout kills the whole process tree, fails the job and does not start another model', async () => {
  process.env.FAKE_MODE = 'hang'
  const started = Date.now()
  const res = await runJob(job, 'goose', target(), opts({ timeoutMs: 1_500 }))
  expect(res.status).toBe('failed')
  expect(res.note).toMatch(/timed out/i)
  expect(Date.now() - started).toBeLessThan(15_000)
  expect(runs()).toHaveLength(1)
  const child = readLog(log).find((l) => l.childPid)!
  await new Promise((r) => setTimeout(r, 300))
  expect(alive(child.childPid)).toBe(false)
})

test('only class_report and guidance get the Markdown copy step', async () => {
  process.env.FAKE_MODE = 'done'
  await runJob({ eventId: 'evt-2', prompt: prompt.replace('class_report', 'write_lesson') }, 'goose', target(), opts())
  expect(runs()[0]!.recipe).not.toContain('write_file tool')
})

test('without goose installed the job fails plainly', async () => {
  const savedPath = process.env.PATH
  process.env.PATH = '/nonexistent-dir'
  try {
    const res = await runJob(job, 'goose', target(), { timeoutMs: 5_000, extraDirs: [] })
    expect(res).toEqual({ status: 'failed', note: 'goose is not installed' })
  } finally {
    process.env.PATH = savedPath
  }
})
