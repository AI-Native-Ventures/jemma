import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AgentName } from './agents'
import { defaultExtraDirs, findBin, killTree, spawn } from './exec'
import { ensureReportsDir, gooseArgs, gooseEnv, gooseJobPrompt, gooseModels, writeGooseRecipe } from './goose'
import { externalCalls, reportCalls } from './report-calls'
import { parseTranscript, savedSomething, type Transcript, type TranscriptCall, type TranscriptUsage } from './transcript'

export type RunnerJob = { eventId: string; prompt: string }
export type McpTarget = { url: string; token: string }
/** One Goose run on one model: what happened, and the raw stream for the record. */
export type GooseAttempt = {
  model: string
  seconds: number
  status: 'done' | 'failed'
  note: string
  timedOut: boolean
  /** A Jemma save tool succeeded (or may have), so no other model may run the job again. */
  saved: boolean
  stdout: string
  stderr: string
}
export type RunOptions = {
  timeoutMs?: number
  extraDirs?: string[]
  onStdout?: (chunk: string) => void
  onStderr?: (chunk: string) => void
  /** Goose only: the models to try, in order. Default: `JEMMA_OPEN_MODEL` then `JEMMA_OPEN_MODEL_FALLBACKS`. */
  models?: string[]
  /** Goose only: the one folder the borrowed file server may use. Default: `JEMMA_REPORTS_DIR` or `<home>/Jemma/reports`. */
  reportsDir?: string
  /** Goose only: called after each model has run. */
  onAttempt?: (attempt: GooseAttempt) => void
}
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

type Spawned = { code: number | null; stdout: string; stderr: string; timedOut: boolean }

/** Starts one agent process in its own process group, collects its output, and kills the whole tree on timeout. */
async function spawnAgent(
  bin: string,
  args: string[],
  o: { cwd: string; env: NodeJS.ProcessEnv; stdin: string | null; timeoutMs: number; onStdout?: (c: string) => void; onStderr?: (c: string) => void },
): Promise<Spawned> {
  const child = spawn(bin, args, { cwd: o.cwd, detached: true, stdio: ['pipe', 'pipe', 'pipe'], env: o.env })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (d) => {
    const chunk = String(d)
    stdout += chunk
    o.onStdout?.(chunk)
  })
  child.stderr.on('data', (d) => {
    const chunk = String(d)
    stderr = (stderr + chunk).slice(-4000)
    o.onStderr?.(chunk)
  })
  child.stdin.on('error', () => {})
  if (o.stdin === null) child.stdin.end()
  else child.stdin.end(o.stdin)

  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    killTree(child)
  }, o.timeoutMs)

  const code = await new Promise<number | null>((resolve) => {
    child.on('error', (err) => {
      stderr += String(err)
      resolve(null)
    })
    child.on('close', (c) => resolve(c))
  })
  clearTimeout(timer)
  killTree(child) // anything the agent left running
  return { code, stdout, stderr, timedOut }
}

/** Why a run that did not finish did not finish, in the agent's own words where it has any. */
function failureNote(agent: AgentName, seen: Transcript, stderr: string, code: number | null): string {
  return (
    seen.lastMessage ||
    (seen.completeNote ?? '') ||
    stderr.trim().split('\n').slice(-3).join(' ') ||
    `${agent} exited with code ${code} without calling complete_job`
  )
}

/** One line, no em dash: a note ends up on the event and on screen. */
const plain = (text: string) => text.replace(/\u2014/g, '-').replace(/\s+/g, ' ').trim()

const sumUsage = (a: TranscriptUsage | null, b: TranscriptUsage | null): TranscriptUsage | null =>
  !a ? b : !b ? a : { inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens, costUsd: a.costUsd + b.costUsd }

/**
 * After a run, tell the Jemma server which borrowed tools it used and what it cost (`log_external_calls`). Skipped
 * when there is nothing to say. Never throws: the result of the job does not depend on it.
 */
async function reportRun(job: RunnerJob, engine: AgentName, mcp: McpTarget, model: string | null, calls: TranscriptCall[], usage: TranscriptUsage | null): Promise<void> {
  const external = externalCalls(calls)
  if (external.length === 0 && !usage) return
  await reportCalls(mcp, { eventId: job.eventId, engine, model, usage, calls: external }).catch(() => false)
}

/**
 * Goose on OpenRouter, one model at a time. The first model that finishes the job wins. A run that fails before any
 * Jemma save tool succeeded (a provider error, a model that only read, no `complete_job`) moves on to the next model,
 * once through the list. A run after which a save tool had succeeded is never repeated, so nothing is written twice.
 * The timeout is for the whole job and ends it.
 */
async function runGoose(job: RunnerJob, bin: string, mcp: McpTarget, dir: string, timeoutMs: number, opts: RunOptions): Promise<RunResult> {
  let reportsDir: string
  try {
    reportsDir = ensureReportsDir(opts.reportsDir ? { JEMMA_REPORTS_DIR: opts.reportsDir } : process.env)
  } catch (err) {
    return { status: 'failed', note: plain(`goose could not open the reports folder: ${err instanceof Error ? err.message : String(err)}`) }
  }
  const models = opts.models?.length ? opts.models : gooseModels()
  const prompt = gooseJobPrompt(job.prompt, reportsDir)
  const deadline = Date.now() + timeoutMs
  const calls: TranscriptCall[] = []
  const failures: string[] = []
  let usage: TranscriptUsage | null = null
  let model: string | null = null
  let result: RunResult | null = null

  for (const next of models) {
    const left = deadline - Date.now()
    if (left <= 0) {
      result = { status: 'failed', note: `goose timed out after ${Math.round(timeoutMs / 1000)} seconds` }
      break
    }
    model = next
    const started = Date.now()
    const file = writeGooseRecipe(dir, { prompt, mcp, reportsDir, model })
    const ran = await spawnAgent(bin, gooseArgs(file), {
      cwd: dir,
      env: gooseEnv(process.env, mcp.token),
      stdin: null,
      timeoutMs: left,
      onStdout: opts.onStdout,
      onStderr: opts.onStderr,
    })
    rmSync(file, { force: true })

    const seen = parseTranscript('goose', ran.stdout)
    calls.push(...seen.calls)
    usage = sumUsage(usage, seen.usage)
    const done = !ran.timedOut && seen.completed === 'done'
    const saved = savedSomething(seen.calls)
    const note = plain(done ? seen.lastMessage : failureNote('goose', seen, ran.stderr, ran.code))
    opts.onAttempt?.({
      model,
      seconds: (Date.now() - started) / 1000,
      status: done ? 'done' : 'failed',
      note,
      timedOut: ran.timedOut,
      saved,
      stdout: ran.stdout,
      stderr: ran.stderr,
    })

    if (ran.timedOut) {
      result = { status: 'failed', note: `goose timed out after ${Math.round(timeoutMs / 1000)} seconds` }
      break
    }
    if (done) {
      result = { status: 'done', note }
      break
    }
    if (saved) {
      result = { status: 'failed', note: `${note} (a save already went through on ${model}, so it was not run again)` }
      break
    }
    failures.push(`${model}: ${note.slice(0, 100)}`)
  }

  result ??= {
    status: 'failed',
    note: failures.length > 1 ? `no model finished the job. ${failures.join('. ')}` : (failures[0]?.replace(/^[^:]*: /, '') ?? 'goose had no model to run'),
  }
  await reportRun(job, 'goose', mcp, model, calls, usage)
  return result
}

/**
 * Runs one job on the user's own Claude Code, Codex or Goose. Done only if the agent called `complete_job` with
 * `done` (and the call did not error); otherwise failed with the agent's last message as the note. Kills the whole
 * process tree on timeout.
 */
export async function runJob(job: RunnerJob, agent: AgentName, mcp: McpTarget, opts: RunOptions = {}): Promise<RunResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const bin = findBin(agent, opts.extraDirs ?? defaultExtraDirs())
  if (!bin) return { status: 'failed', note: `${agent} is not installed` }

  const dir = mkdtempSync(join(tmpdir(), 'jemma-job-'))
  try {
    if (agent === 'goose') return await runGoose(job, bin, mcp, dir, timeoutMs, opts)

    let args: string[]
    if (agent === 'claude') {
      const file = join(dir, 'mcp.json')
      const config = { mcpServers: { jemma: { type: 'http', url: mcp.url, headers: { Authorization: `Bearer ${mcp.token}` } } } }
      writeFileSync(file, JSON.stringify(config), { mode: 0o600 })
      args = claudeArgs(file)
    } else {
      args = codexArgs(mcp, dir)
    }

    const ran = await spawnAgent(bin, args, {
      cwd: dir,
      env: { ...process.env, [TOKEN_ENV]: mcp.token },
      stdin: job.prompt,
      timeoutMs,
      onStdout: opts.onStdout,
      onStderr: opts.onStderr,
    })
    if (ran.timedOut) return { status: 'failed', note: `${agent} timed out after ${Math.round(timeoutMs / 1000)} seconds` }

    const seen = parseTranscript(agent, ran.stdout)
    await reportRun(job, agent, mcp, null, seen.calls, seen.usage)
    if (seen.completed === 'done') return { status: 'done', note: seen.lastMessage }
    return { status: 'failed', note: failureNote(agent, seen, ran.stderr, ran.code) }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
