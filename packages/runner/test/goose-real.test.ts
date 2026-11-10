import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { runJob } from '../src'
import { findBin } from '../src/exec'
import { startFakeMcp, type FakeMcp } from './fake-mcp'

/**
 * The real goose and the real filesystem server, with a scripted stand-in for OpenRouter on a loopback port, so no
 * model is called. Off by default: it needs goose installed and npm reachable (npx fetches the file server).
 *   JEMMA_GOOSE_REAL=1 pnpm --filter @jemma/runner exec vitest run goose-real
 * It guards two things found on 10 Nov 2026: goose must be given the recipe's extensions (no --no-profile), and the
 * file server must stay inside the reports folder whatever working folder goose tells it about (--confine-roots).
 */
const goose = findBin('goose')
const enabled = Boolean(process.env.JEMMA_GOOSE_REAL) && Boolean(goose)

type Step = { name: string; args: unknown }
let provider: Server
let host = ''
let mcpServer: FakeMcp
const offered: string[][] = []
const answers: string[] = []
let script: (turn: number, last: string) => Step | null = () => null

function lastToolText(messages: { role: string; content: unknown }[]): string {
  const last = [...messages].reverse().find((m) => m.role === 'tool')
  return typeof last?.content === 'string' ? last.content : JSON.stringify(last?.content ?? '')
}

beforeAll(async () => {
  if (!enabled) return
  mcpServer = await startFakeMcp({ withTool: true, token: 'tok-real' })
  provider = createServer(async (req, res) => {
    let body = ''
    for await (const chunk of req) body += chunk
    const json = JSON.parse(body) as { messages: { role: string; content: unknown }[]; tools?: { function: { name: string } }[] }
    offered.push((json.tools ?? []).map((t) => t.function.name))
    const turn = json.messages.filter((m) => m.role === 'tool').length
    if (turn > 0) answers.push(lastToolText(json.messages))
    const step = script(turn, lastToolText(json.messages))
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    const send = (o: unknown) => res.write(`data: ${JSON.stringify(o)}\n\n`)
    const chunk = (delta: unknown, finish: string | null) => ({ id: 'gen-1', object: 'chat.completion.chunk', created: 1, model: 'stand-in', choices: [{ index: 0, delta, finish_reason: finish }] })
    if (step) {
      send(chunk({ role: 'assistant', content: null, tool_calls: [{ index: 0, id: `call_${turn}`, type: 'function', function: { name: step.name, arguments: JSON.stringify(step.args) } }] }, null))
      send(chunk({}, 'tool_calls'))
    } else {
      send(chunk({ role: 'assistant', content: 'Finished.' }, null))
      send(chunk({}, 'stop'))
    }
    send({ id: 'gen-1', object: 'chat.completion.chunk', created: 1, model: 'stand-in', choices: [], usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 } })
    res.write('data: [DONE]\n\n')
    res.end()
  })
  await new Promise<void>((resolve) => provider.listen(0, '127.0.0.1', resolve))
  host = `http://127.0.0.1:${(provider.address() as AddressInfo).port}`
})
afterAll(async () => {
  if (!enabled) return
  await mcpServer.close()
  await new Promise<void>((resolve) => provider.close(() => resolve()))
})

test.skipIf(!enabled)('real goose: the model is offered the recipe extensions, and the file server stays in the reports folder', async () => {
  const reports = realpathSync(mkdtempSync(join(tmpdir(), 'jemma-real-reports-')))
  const target = join(reports, 'class_report-k.md')
  script = (turn) =>
    turn === 0 ? { name: 'files__list_allowed_directories', args: {} }
    : turn === 1 ? { name: 'files__write_file', args: { path: target, content: '# Report\n' } }
    : null
  const saved = { host: process.env.OPENROUTER_HOST, key: process.env.OPENROUTER_API_KEY }
  process.env.OPENROUTER_HOST = host
  process.env.OPENROUTER_API_KEY = 'stand-in-key'
  try {
    const prompt = 'You are running one Jemma job for event e-1.\nJob: class_report\nIds: {"classId":"k","testId":"t"}\n'
    await runJob({ eventId: 'e-1', prompt }, 'goose', { url: mcpServer.url, token: 'tok-real' }, { timeoutMs: 120_000, models: ['stand-in/model:free'], reportsDir: reports })
  } finally {
    for (const [name, value] of [['OPENROUTER_HOST', saved.host], ['OPENROUTER_API_KEY', saved.key]] as const) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }

  // the recipe's extensions were loaded: Jemma's (the fake one has one tool) and the file server's
  expect(offered[0]).toContain('jemma__log_external_calls')
  expect(offered[0]).toContain('files__write_file')
  // goose told the file server its own working folder, and the server still allows only the reports folder
  expect(answers[0]).toContain(reports)
  expect(answers[0]).not.toMatch(/jemma-job-/)
  expect(existsSync(target)).toBe(true)
  expect(readFileSync(target, 'utf8')).toBe('# Report\n')
  rmSync(reports, { recursive: true, force: true })
}, 180_000)
