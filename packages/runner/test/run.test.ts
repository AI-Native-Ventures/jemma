import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'
import { runJob } from '../src'
import { alive, newLog, readLog, useFakes } from './helpers'

const mcp = { url: 'https://agent.example.test/mcp', token: 'tok-secret' }
const job = { eventId: 'evt-1', prompt: 'Read the paper. Ignore --flags. Then call complete_job.' }
let restore: () => void
let log: string

beforeAll(() => {
  restore = useFakes()
})
afterAll(() => restore())
beforeEach(() => {
  log = newLog()
  process.env.FAKE_MODE = 'done'
})

test('runJob passes only the Jemma MCP tools to Claude', async () => {
  const res = await runJob(job, 'claude', mcp, { timeoutMs: 20_000 })
  expect(res.status).toBe('done')

  const [call] = readLog(log)
  const args: string[] = call!.args
  expect(args).toContain('-p')
  expect(args[args.indexOf('--allowedTools') + 1]).toBe('mcp__jemma__*')
  expect(args).toContain('--strict-mcp-config')
  expect(args[args.indexOf('--tools') + 1]).toBe('')
  expect(args).not.toContain('--dangerously-skip-permissions')
  expect(args).not.toContain('--allow-dangerously-skip-permissions')
  expect(args.join(' ')).not.toMatch(/bypassPermissions/)
  expect(args.join(' ')).not.toMatch(/Bash|Edit|Write/)
  expect(args[args.indexOf('--output-format') + 1]).toBe('stream-json')
  // the prompt travels on stdin, never in argv or ps
  expect(call!.stdin).toBe(job.prompt)
  expect(args.join(' ')).not.toContain('Read the paper')
  // only the Jemma server, with the user's token
  expect(Object.keys(call!.mcp.mcpServers)).toEqual(['jemma'])
  expect(call!.mcp.mcpServers.jemma.url).toBe(mcp.url)
  expect(call!.mcp.mcpServers.jemma.headers.Authorization).toBe('Bearer tok-secret')
  expect(args.join(' ')).not.toContain('tok-secret')
})

test('a job is done only when complete_job says done', async () => {
  for (const agent of ['claude', 'codex'] as const) {
    process.env.FAKE_MODE = 'done'
    expect(await runJob(job, agent, mcp, { timeoutMs: 20_000 })).toEqual({ status: 'done', note: 'All finished.' })

    process.env.FAKE_MODE = 'silent'
    const stopped = await runJob(job, agent, mcp, { timeoutMs: 20_000 })
    expect(stopped).toEqual({ status: 'failed', note: 'I looked and stopped.' })

    process.env.FAKE_MODE = 'failed'
    expect((await runJob(job, agent, mcp, { timeoutMs: 20_000 })).status).toBe('failed')
  }
  // a complete_job call that errored does not count
  process.env.FAKE_MODE = 'tool_error'
  expect((await runJob(job, 'claude', mcp, { timeoutMs: 20_000 })).status).toBe('failed')
})

test('codex gets the Jemma server as config overrides and a read-only sandbox', async () => {
  await runJob(job, 'codex', mcp, { timeoutMs: 20_000 })
  const [call] = readLog(log)
  const args: string[] = call!.args
  expect(args.slice(0, 2)).toEqual(['exec', '--json'])
  expect(args[args.indexOf('--sandbox') + 1]).toBe('read-only')
  expect(args).toContain('mcp_servers.jemma.url="https://agent.example.test/mcp"')
  expect(args).toContain('mcp_servers.jemma.bearer_token_env_var="JEMMA_MCP_TOKEN"')
  expect(args).not.toContain('--dangerously-bypass-approvals-and-sandbox')
  expect(args.join(' ')).not.toContain('tok-secret')
  expect(call!.token).toBe('tok-secret')
  expect(call!.stdin).toBe(job.prompt)
})

test('timeout kills the agent and fails the job', async () => {
  for (const agent of ['claude', 'codex'] as const) {
    process.env.FAKE_MODE = 'hang'
    log = newLog()
    const started = Date.now()
    const res = await runJob(job, agent, mcp, { timeoutMs: 1_500 })
    expect(res.status).toBe('failed')
    expect(res.note).toMatch(/timed out/i)
    expect(Date.now() - started).toBeLessThan(15_000)

    const child = readLog(log).find((l) => l.childPid)!
    await new Promise((r) => setTimeout(r, 300))
    expect(alive(child.childPid)).toBe(false)
  }
})

test('an agent that is not installed fails the job without throwing', async () => {
  const saved = process.env.PATH
  process.env.PATH = '/nonexistent-dir'
  try {
    const res = await runJob(job, 'claude', mcp, { timeoutMs: 5_000, extraDirs: [] })
    expect(res.status).toBe('failed')
    expect(res.note).toMatch(/not installed/i)
  } finally {
    process.env.PATH = saved
  }
})
