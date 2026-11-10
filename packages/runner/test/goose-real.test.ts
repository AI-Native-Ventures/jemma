import { spawn } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { gooseArgs, runJob, writeGooseRecipe } from '../src'
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
/** For each request the stand-in got: did the text of the request hold the canary from a goose hints file? */
const sawCanary: boolean[] = []
const CANARY = 'CANARY-HINT-12345'
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
    sawCanary.push(body.includes(CANARY))
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
  // what the runner reported for this real goose run matches the log_external_calls contract exactly
  const sent = mcpServer.inputs[0] as { calls: Record<string, unknown>[]; usage: Record<string, unknown> } & Record<string, unknown>
  expect(Object.keys(sent).sort()).toEqual(['calls', 'engine', 'eventId', 'model', 'usage'])
  expect(sent).toMatchObject({ eventId: 'e-1', engine: 'goose', model: 'stand-in/model:free', usage: { inputTokens: 30, outputTokens: 6, costUsd: 0 } })
  expect(Object.keys(sent.usage).sort()).toEqual(['costUsd', 'inputTokens', 'outputTokens'])
  expect(sent.calls.map((c) => `${c.server}.${c.tool}`)).toEqual(['files.list_allowed_directories', 'files.write_file'])
  for (const c of sent.calls) {
    expect(Object.keys(c).sort()).toEqual(['at', 'input', 'ok', 'output', 'server', 'tool'])
    expect(c.ok).toBe(true)
    expect(Number.isNaN(Date.parse(c.at as string))).toBe(false)
  }
  rmSync(reports, { recursive: true, force: true })
}, 180_000)

/** Every file and folder under `dir`, relative, with its size and mtime. */
function listing(dir: string, base = dir): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    const stat = statSync(path)
    return [`${path.slice(base.length)} ${stat.size} ${stat.mtimeMs}`, ...(entry.isDirectory() ? listing(path, base) : [])]
  })
}

/** Runs goose without blocking this process (the stand-in servers live in it). */
function runAsync(bin: string, args: string[], options: { cwd: string; env: NodeJS.ProcessEnv }): Promise<number | null> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { ...options, stdio: ['ignore', 'ignore', 'ignore'] })
    const timer = setTimeout(() => child.kill('SIGKILL'), 90_000)
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve(code)
    })
  })
}

test.skipIf(!enabled)('real goose: with the runner, nothing is read from or written to the user\'s own goose folders', async () => {
  // A stand-in home folder whose goose config folder holds a hints file with a canary. Goose puts a hints file into
  // the model's prompt, so a read of the folder shows up as the canary in the request.
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'jemma-real-home-')))
  const config = join(home, '.config', 'goose')
  mkdirSync(config, { recursive: true })
  writeFileSync(join(config, '.goosehints'), `${CANARY}: always answer in French.\n`)
  const configBefore = listing(config)
  const reports = realpathSync(mkdtempSync(join(tmpdir(), 'jemma-real-reports-')))
  script = () => null
  const saved = { host: process.env.OPENROUTER_HOST, key: process.env.OPENROUTER_API_KEY, home: process.env.HOME }
  process.env.OPENROUTER_HOST = host
  process.env.OPENROUTER_API_KEY = 'stand-in-key'
  process.env.HOME = home
  try {
    // positive control first: the same recipe run without GOOSE_PATH_ROOT reads the folder and writes under HOME
    const dir = mkdtempSync(join(tmpdir(), 'jemma-real-control-'))
    const recipe = writeGooseRecipe(dir, { prompt: 'Say hi.', mcp: { url: mcpServer.url, token: 'tok-real' }, reportsDir: reports, model: 'stand-in/model:free' })
    const env: NodeJS.ProcessEnv = { ...process.env, GOOSE_DISABLE_KEYRING: '1' }
    delete env.GOOSE_PATH_ROOT
    const controlFrom = sawCanary.length
    expect(await runAsync(goose!, gooseArgs(recipe), { cwd: dir, env })).toBe(0)
    rmSync(dir, { recursive: true, force: true })
    expect(sawCanary.slice(controlFrom).some(Boolean)).toBe(true)
    expect(existsSync(join(home, '.local', 'share', 'goose')) || existsSync(join(home, '.local', 'state', 'goose'))).toBe(true)
    rmSync(join(home, '.local'), { recursive: true, force: true })

    // the runner: the canary never reaches the model, and HOME gets nothing from goose
    const runnerFrom = sawCanary.length
    const prompt = 'You are running one Jemma job for event e-2.\nJob: write_lesson\nIds: {"childId":"c"}\n'
    await runJob({ eventId: 'e-2', prompt }, 'goose', { url: mcpServer.url, token: 'tok-real' }, { timeoutMs: 120_000, models: ['stand-in/model:free'], reportsDir: reports, extraDirs: [dirname(goose!)] })
    const during = sawCanary.slice(runnerFrom)
    expect(during.length).toBeGreaterThan(0)
    expect(during.some(Boolean)).toBe(false)
    expect(listing(config)).toEqual(configBefore)
    expect(existsSync(join(home, '.local'))).toBe(false)
    // all that appeared under HOME is the config folder made above and npm's own cache for npx
    expect(readdirSync(home).sort().filter((name) => name !== '.npm')).toEqual(['.config'])
  } finally {
    for (const [name, value] of [['OPENROUTER_HOST', saved.host], ['OPENROUTER_API_KEY', saved.key], ['HOME', saved.home]] as const) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
    for (const dir of [home, reports]) rmSync(dir, { recursive: true, force: true })
  }
}, 240_000)
