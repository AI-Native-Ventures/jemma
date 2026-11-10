import { afterEach, expect, test } from 'vitest'
import { MAX_REPORTED_CALLS, externalCalls, reportCalls, type ExternalCallsReport } from '../src'
import { startFakeMcp, type FakeMcp } from './fake-mcp'

let server: FakeMcp | null = null
afterEach(async () => {
  await server?.close()
  server = null
})

const call = (server: string, tool: string, i = 0) => ({ server, tool, input: { i }, output: `out ${i}`, ok: true, at: '2026-11-10T08:00:00.000Z' })
const report = (calls: ExternalCallsReport['calls']): ExternalCallsReport => ({
  eventId: 'evt-1',
  engine: 'goose',
  model: 'nvidia/nemotron-3.5-super-vl:free',
  usage: { inputTokens: 1200, outputTokens: 80, costUsd: 0 },
  calls,
})

test('happy path: the tool is called with the exact contract, over HTTP, with the bearer token', async () => {
  server = await startFakeMcp({ withTool: true, token: 'tok-1' })
  const sent = report([call('files', 'write_file', 1), call('jemma', 'get_job', 2), call('files', 'read_text_file', 3)])
  expect(await reportCalls({ url: server.url, token: 'tok-1' }, sent)).toBe(true)

  expect(server.inputs).toEqual([
    {
      eventId: 'evt-1',
      engine: 'goose',
      model: 'nvidia/nemotron-3.5-super-vl:free',
      usage: { inputTokens: 1200, outputTokens: 80, costUsd: 0 },
      // Jemma's own calls are logged by the server, so only the borrowed ones go
      calls: [call('files', 'write_file', 1), call('files', 'read_text_file', 3)],
    },
  ])
  expect(server.auth.every((a) => a === 'Bearer tok-1')).toBe(true)
})

test('the payload has exactly the contract keys and nothing else', async () => {
  server = await startFakeMcp({ withTool: true })
  // an extra field on a call (here `answered`, which the transcript keeps) must not leak into what is sent
  const withExtra = [{ ...call('files', 'write_file', 1), answered: true }, call('jemma', 'complete_job', 2)]
  expect(await reportCalls({ url: server.url, token: 't' }, report(withExtra as ExternalCallsReport['calls']))).toBe(true)
  const sent = server.inputs[0] as Record<string, unknown>
  expect(Object.keys(sent).sort()).toEqual(['calls', 'engine', 'eventId', 'model', 'usage'])
  expect(Object.keys(sent.usage as object).sort()).toEqual(['costUsd', 'inputTokens', 'outputTokens'])
  const calls = sent.calls as Record<string, unknown>[]
  expect(calls).toHaveLength(1)
  expect(Object.keys(calls[0]!).sort()).toEqual(['at', 'input', 'ok', 'output', 'server', 'tool'])
  expect(typeof calls[0]!.at).toBe('string')
  expect(Number.isNaN(Date.parse(calls[0]!.at as string))).toBe(false)
  expect(typeof calls[0]!.ok).toBe('boolean')
})

test('no model and no usage are sent as null', async () => {
  server = await startFakeMcp({ withTool: true })
  expect(await reportCalls({ url: server.url, token: 't' }, { ...report([call('files', 'write_file')]), model: null, usage: null, engine: 'codex' })).toBe(true)
  expect(server.inputs[0]).toMatchObject({ engine: 'codex', model: null, usage: null })
})

test('at most 50 calls are sent', async () => {
  server = await startFakeMcp({ withTool: true })
  const many = Array.from({ length: 80 }, (_, i) => call('files', 'read_text_file', i))
  expect(await reportCalls({ url: server.url, token: 't' }, report(many))).toBe(true)
  expect((server.inputs[0] as { calls: unknown[] }).calls).toHaveLength(MAX_REPORTED_CALLS)
  expect(MAX_REPORTED_CALLS).toBe(50)
  expect(externalCalls(many)).toHaveLength(50)
})

test('tool missing (the server as it is today): false, and nothing is thrown', async () => {
  server = await startFakeMcp({ withTool: false })
  await expect(reportCalls({ url: server.url, token: 't' }, report([call('files', 'write_file')]))).resolves.toBe(false)
  expect(server.inputs).toEqual([])
})

test('a tool that answers with an error: false', async () => {
  server = await startFakeMcp({ withTool: true, isError: true })
  expect(await reportCalls({ url: server.url, token: 't' }, report([call('files', 'write_file')]))).toBe(false)
})

test('a wrong token (401): false', async () => {
  server = await startFakeMcp({ withTool: true, token: 'right' })
  expect(await reportCalls({ url: server.url, token: 'wrong' }, report([call('files', 'write_file')]))).toBe(false)
  expect(server.inputs).toEqual([])
})

test('a server that is down: false', async () => {
  const dead = await startFakeMcp({ withTool: true })
  const url = dead.url
  await dead.close()
  expect(await reportCalls({ url, token: 't' }, report([call('files', 'write_file')]), 3_000)).toBe(false)
})

test('a server that never answers: false after the timeout', async () => {
  const { createServer } = await import('node:http')
  const hang = createServer(() => {})
  await new Promise<void>((r) => hang.listen(0, '127.0.0.1', r))
  const port = (hang.address() as { port: number }).port
  const started = Date.now()
  try {
    expect(await reportCalls({ url: `http://127.0.0.1:${port}/mcp`, token: 't' }, report([call('files', 'write_file')]), 700)).toBe(false)
    expect(Date.now() - started).toBeLessThan(5_000)
  } finally {
    hang.closeAllConnections()
    hang.close()
  }
})
