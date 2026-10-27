import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AgentName } from './agents'
import { defaultExtraDirs, findBin, killTree, spawn } from './exec'
import { parseTranscript } from './transcript'

export type RunnerJob = { eventId: string; prompt: string }
export type McpTarget = { url: string; token: string }
export type RunOptions = { timeoutMs?: number; extraDirs?: string[] }
export type RunResult = { status: 'done' | 'failed'; note: string }

export const DEFAULT_TIMEOUT_MS = 10 * 60_000
const TOKEN_ENV = 'JEMMA_MCP_TOKEN'

const toml = (s: string) => JSON.stringify(s)

/**
 * Claude Code, print mode. No built-in tools (`--tools ""`), only the Jemma MCP server (`--strict-mcp-config`),
 * and `dontAsk` so anything not allowed is denied instead of prompting. The prompt goes in on stdin.
 */
export function claudeArgs(mcpConfigFile: string): string[] {
  return [
    '-p',
    '--output-format', 'stream-json',
    '--verbose',
    '--mcp-config', mcpConfigFile,
    '--strict-mcp-config',
    '--tools', '',
    '--allowedTools', 'mcp__jemma__*',
    '--permission-mode', 'dontAsk',
    '--no-session-persistence',
    '--disable-slash-commands',
  ]
}

/**
 * Codex exec with JSONL events. The Jemma HTTP MCP server comes in as `-c` overrides (the token is read from an
 * environment variable, never put in argv). Read-only sandbox, no approvals, no user config, prompt on stdin.
 */
export function codexArgs(mcp: McpTarget, cwd: string): string[] {
  return [
    'exec',
    '--json',
    '--sandbox', 'read-only',
    '--skip-git-repo-check',
    '--ephemeral',
    '--ignore-user-config',
    '--ignore-rules',
    '-C', cwd,
    '-c', 'approval_policy="never"',
    '-c', `mcp_servers.jemma.url=${toml(mcp.url)}`,
    '-c', `mcp_servers.jemma.bearer_token_env_var=${toml(TOKEN_ENV)}`,
    '-',
  ]
}

/**
 * Runs one job on the user's own Claude Code or Codex. Done only if the agent called `complete_job` with `done`
 * (and the call did not error); otherwise failed with the agent's last message as the note. Kills the whole
 * process tree on timeout.
 */
export async function runJob(job: RunnerJob, agent: AgentName, mcp: McpTarget, opts: RunOptions = {}): Promise<RunResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const bin = findBin(agent, opts.extraDirs ?? defaultExtraDirs())
  if (!bin) return { status: 'failed', note: `${agent} is not installed` }

  const dir = mkdtempSync(join(tmpdir(), 'jemma-job-'))
  try {
    let args: string[]
    if (agent === 'claude') {
      const file = join(dir, 'mcp.json')
      const config = { mcpServers: { jemma: { type: 'http', url: mcp.url, headers: { Authorization: `Bearer ${mcp.token}` } } } }
      writeFileSync(file, JSON.stringify(config), { mode: 0o600 })
      args = claudeArgs(file)
    } else {
      args = codexArgs(mcp, dir)
    }

    const child = spawn(bin, args, {
      cwd: dir,
      detached: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, [TOKEN_ENV]: mcp.token },
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => (stdout += d))
    child.stderr.on('data', (d) => (stderr = (stderr + d).slice(-4000)))
    child.stdin.on('error', () => {})
    child.stdin.end(job.prompt)

    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      killTree(child)
    }, timeoutMs)

    const code = await new Promise<number | null>((resolve) => {
      child.on('error', (err) => {
        stderr += String(err)
        resolve(null)
      })
      child.on('close', (c) => resolve(c))
    })
    clearTimeout(timer)
    killTree(child) // anything the agent left running

    if (timedOut) return { status: 'failed', note: `${agent} timed out after ${Math.round(timeoutMs / 1000)} seconds` }

    const seen = parseTranscript(agent, stdout)
    if (seen.completed === 'done') return { status: 'done', note: seen.lastMessage }
    const note =
      seen.lastMessage ||
      (seen.completeNote ?? '') ||
      stderr.trim().split('\n').slice(-3).join(' ') ||
      `${agent} exited with code ${code} without calling complete_job`
    return { status: 'failed', note }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
