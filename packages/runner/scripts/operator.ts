/**
 * The operator runner: this Mac does the AI work for the hosted Jemma app, with the Claude Code (or Codex) signed in here.
 *
 *   pnpm operator
 *
 * Reads SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and AGENT_URL from the repo root .env.local (or the environment),
 * JEMMA_RUNNER_AGENT (claude or codex, default claude) and OPERATOR_CONCURRENCY (default 2).
 * OPERATOR_MAX_JOBS stops it after that many agent runs. OPERATOR_ONLY_HANDOFFS=1 serves only events the cloud handed
 * over (use it on a shared database).  OPERATOR_TRACE=<file> also appends one JSON line per job
 * (school, event, job, seconds, outcome, the agent's tool calls in order). Prints one line per job and appends the same lines to
 * ~/Jemma/operator.log. Ctrl-C: no new jobs, running jobs finish, the presence row is removed. Press it twice to quit now.
 */
import { randomUUID } from 'node:crypto'
import { spawn, type ChildProcess } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { homedir, platform } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'
import { createServiceClient } from '@jemma/profiling/db'
import type { AgentName } from '../src/agents'
import type { JobReport } from '../src/loop'
import { startOperator } from '../src/operator'

const file = fileURLToPath(new URL('../../../.env.local', import.meta.url))
const env = { ...(existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {}), ...process.env } as Record<string, string | undefined>
const need = (key: string) => env[key] ?? (() => { throw new Error(`set ${key} in .env.local`) })()

const supabaseUrl = need('SUPABASE_URL')
const serviceKey = need('SUPABASE_SERVICE_ROLE_KEY')
const agentUrl = need('AGENT_URL')
const agent = (env.JEMMA_RUNNER_AGENT ?? 'claude') as AgentName
if (agent !== 'claude' && agent !== 'codex') throw new Error(`JEMMA_RUNNER_AGENT must be claude or codex, not ${agent}`)
const concurrency = Number(env.OPERATOR_CONCURRENCY ?? 2)
const maxJobs = env.OPERATOR_MAX_JOBS ? Number(env.OPERATOR_MAX_JOBS) : undefined
const traceFile = env.OPERATOR_TRACE
const onlyHandoffs = env.OPERATOR_ONLY_HANDOFFS === '1'

// The agent CLI starts with this process's environment. It must see none of the keys here, and it must use the
// signed-in subscription: a provider key in the environment would be billed instead.
for (const key of [
  'SUPABASE_PROJECT_ID', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_DB_PASSWORD', 'SUPABASE_DB_URL',
  'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'EVENTS_SECRET', 'CHILD_PIN_PEPPER', 'JEMMA_MCP_TOKEN',
  'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'OPENAI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'GOOGLE_API_KEY',
  'OPENROUTER_API_KEY', 'DEEPSEEK_API_KEY', 'OPENCODE_API_KEY', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY',
  'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_BEARER_TOKEN_BEDROCK', 'GOOGLE_APPLICATION_CREDENTIALS',
]) {
  delete process.env[key]
}

const logFile = join(homedir(), 'Jemma', 'operator.log')
mkdirSync(dirname(logFile), { recursive: true })
const out = (line: string) => {
  console.log(line)
  try {
    appendFileSync(logFile, `${line}\n`)
  } catch {
    // the screen line is enough
  }
}

// Keeps the Mac from sleeping from idleness while this runs. No window, no sound. Ends with this process.
let awake: ChildProcess | null = null
if (platform() === 'darwin') {
  awake = spawn('caffeinate', ['-i', '-w', String(process.pid)], { stdio: 'ignore' })
  awake.on('error', () => {})
}

const db = createServiceClient({ SUPABASE_URL: supabaseUrl, SUPABASE_SERVICE_ROLE_KEY: serviceKey })
out(`${new Date().toISOString().slice(0, 10)}  operator starting: ${agent}, ${concurrency} at a time, log ${logFile}`)
const trace = (report: JobReport) => {
  if (!traceFile) return
  const { event, step, seconds, status, note, toolCalls } = report
  const line = { at: new Date().toISOString(), schoolId: event.school_id, eventId: event.id, type: event.type, job: step.job, ids: step.ids, seconds: Math.round(seconds * 10) / 10, status, note: note.slice(0, 300), toolCalls }
  try {
    appendFileSync(traceFile, `${JSON.stringify(line)}\n`)
  } catch {
    // the screen line is enough
  }
}
const operator = startOperator({ db, runnerId: randomUUID(), agent, agentUrl, concurrency, maxJobs, onlyHandoffs, onLog: out, onJob: trace })

let leaving = false
const leave = async () => {
  if (leaving) {
    out('quitting now. Jobs that were running will go back to the cloud in about two minutes.')
    process.exit(130)
  }
  leaving = true
  out('stopping: no new jobs. Running jobs will finish. Press Ctrl-C again to quit now.')
  await operator.stop()
  awake?.kill()
  process.exit(0)
}
process.on('SIGINT', () => void leave())
process.on('SIGTERM', () => void leave())
