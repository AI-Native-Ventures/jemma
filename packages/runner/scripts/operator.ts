/**
 * The operator runner: this Mac does the AI work for the hosted Jemma app, with the Claude Code (or Codex) signed in here,
 * or with goose and an open-weights model on OpenRouter.
 *
 *   pnpm operator
 *
 * Reads SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and AGENT_URL from the repo root .env.local (or the environment),
 * JEMMA_RUNNER_AGENT (claude, codex or goose, default claude) and OPERATOR_CONCURRENCY (default 2). Claude was proven
 * live; goose in the operator runner is unit-tested and not yet run live.
 * OPERATOR_MAX_JOBS stops it after that many agent runs. OPERATOR_TAG (default `default`) must match the
 * agent's AI_ROUTE_TAG: only events handed over with that tag are served.  OPERATOR_TRACE=<file> also appends one JSON line per job
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
import { operatorModels, prepareOperatorEnv } from '../src/operator-env'

const file = fileURLToPath(new URL('../../../.env.local', import.meta.url))
const env = { ...(existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {}), ...process.env } as Record<string, string | undefined>
const need = (key: string) => env[key] ?? (() => { throw new Error(`set ${key} in .env.local`) })()

const supabaseUrl = need('SUPABASE_URL')
const serviceKey = need('SUPABASE_SERVICE_ROLE_KEY')
const agentUrl = need('AGENT_URL')
const agent = (env.JEMMA_RUNNER_AGENT ?? 'claude') as AgentName
if (agent !== 'claude' && agent !== 'codex' && agent !== 'goose') throw new Error(`JEMMA_RUNNER_AGENT must be claude, codex or goose, not ${agent}`)
const concurrency = Number(env.OPERATOR_CONCURRENCY ?? 2)
const maxJobs = env.OPERATOR_MAX_JOBS ? Number(env.OPERATOR_MAX_JOBS) : undefined
const traceFile = env.OPERATOR_TRACE
const tag = env.OPERATOR_TAG || 'default'

// The agent CLI starts with this process's environment. It must see none of the Supabase names or secrets here. For claude
// and codex it must also see no provider key and use the signed-in subscription: a provider key in the environment would be
// billed instead. Goose is the one engine that needs its OpenRouter key, so that key (and only that key) is kept for it.
prepareOperatorEnv(env, process.env, agent)

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
const models = operatorModels(env, agent) // goose only: the list of the merged env (file and shell), also handed to every agent run
const engine = models ? `goose (${models[0]})` : agent
out(`${new Date().toISOString().slice(0, 10)}  operator starting: ${engine}, ${concurrency} at a time, tag ${tag}, log ${logFile}`)
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
const operator = startOperator({ db, runnerId: randomUUID(), agent, agentUrl, concurrency, maxJobs, tag, models, onLog: out, onJob: trace })

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
