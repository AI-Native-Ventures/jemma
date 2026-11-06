import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'
import type { JemmaDb } from '../../packages/profiling/src/db/client'
import { jobPlan } from '../../packages/profiling/src/plans'
import { detectAgents, parseTranscript, runJob, startRunner, type AgentName, type RunOptions } from '../../packages/runner/src/index'
import { createSandbox, type Sandbox } from '../../supabase/seed/demo'
import { sendEvent } from '../../apps/web/lib/agent'

const DEFAULT_MCP_URL = 'http://127.0.0.1:8748/mcp'
const REAL_JOB_TIMEOUT_MS = 10 * 60_000
const PROOF_DIR = fileURLToPath(new URL('.', import.meta.url))
const ROOT_ENV_FILE = new URL('../../.env.local', import.meta.url)
const runnerRequire = createRequire(new URL('../../packages/runner/package.json', import.meta.url))
const { createClient } = runnerRequire('@supabase/supabase-js') as {
  createClient: (url: string, key: string, options: unknown) => unknown
}
const { createServiceClient } = runnerRequire('@jemma/profiling/db') as {
  createServiceClient: (env: { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string }) => JemmaDb
}
const { ReteachSchema } = runnerRequire('@jemma/profiling/schemas') as { ReteachSchema: typeof import('../../packages/profiling/src/schemas/diagnosis').ReteachSchema }

type Env = Record<string, string | undefined>
type LoginRow = { teacher: { userId: string; email: string; password: string } }
type ProofResult = { status: 'done' | 'failed'; note: string }

function loadEnv(): Env {
  const fromFile = parseEnv(readFileSync(ROOT_ENV_FILE, 'utf8'))
  return { ...fromFile, ...process.env }
}

function required(env: Env, key: string): string {
  const value = env[key]
  if (!value) throw new Error(`required environment value is missing: ${key}`)
  return value
}

function assertDevProject(env: Env): void {
  const url = new URL(required(env, 'SUPABASE_URL'))
  const ref = url.hostname.split('.')[0]
  if (ref !== 'ayxgctbemuvozwktstaa') throw new Error('configured Supabase project is not jemma-dev')
}

function configureProcess(): void {
  process.env.ANTHROPIC_MODEL = 'claude-sonnet-5-5'

  // Claude must use its signed-in subscription, never an API key or a routed provider.
  for (const key of [
    'SUPABASE_PROJECT_ID',
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_DB_PASSWORD',
    'SUPABASE_DB_URL',
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'EVENTS_SECRET',
    'AGENT_URL',
    'JEMMA_MCP_TOKEN',
    'CHILD_PIN_PEPPER',
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_AUTH_TOKEN',
    'ANTHROPIC_BASE_URL',
    'OPENAI_API_KEY',
    'GOOGLE_GENERATIVE_AI_API_KEY',
    'GOOGLE_API_KEY',
    'OPENROUTER_API_KEY',
    'DEEPSEEK_API_KEY',
    'OPENCODE_API_KEY',
    'CLAUDE_CODE_USE_BEDROCK',
    'CLAUDE_CODE_USE_VERTEX',
    'CLAUDE_CODE_USE_FOUNDRY',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_BEARER_TOKEN_BEDROCK',
    'GOOGLE_APPLICATION_CREDENTIALS',
    'ANTHROPIC_VERTEX_PROJECT_ID',
  ]) {
    delete process.env[key]
  }
}

async function withTemporaryEnv<T>(values: Record<string, string>, work: () => Promise<T>): Promise<T> {
  const previous = new Map<string, string | undefined>()
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key])
    process.env[key] = value
  }
  try {
    return await work()
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

function assertAgentEnvironmentSafe(): void {
  const forbidden = [
    'SUPABASE_PROJECT_ID',
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_DB_PASSWORD',
    'SUPABASE_DB_URL',
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'EVENTS_SECRET',
    'AGENT_URL',
    'JEMMA_MCP_TOKEN',
    'CHILD_PIN_PEPPER',
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_AUTH_TOKEN',
    'ANTHROPIC_BASE_URL',
    'OPENAI_API_KEY',
    'GOOGLE_GENERATIVE_AI_API_KEY',
    'GOOGLE_API_KEY',
    'OPENROUTER_API_KEY',
    'DEEPSEEK_API_KEY',
    'OPENCODE_API_KEY',
    'CLAUDE_CODE_USE_BEDROCK',
    'CLAUDE_CODE_USE_VERTEX',
    'CLAUDE_CODE_USE_FOUNDRY',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_BEARER_TOKEN_BEDROCK',
    'GOOGLE_APPLICATION_CREDENTIALS',
    'ANTHROPIC_VERTEX_PROJECT_ID',
  ].filter((key) => process.env[key])
  if (forbidden.length) throw new Error('sensitive environment values remain before runJob')
}

function serviceDb(env: Env): JemmaDb {
  return createServiceClient({
    SUPABASE_URL: required(env, 'SUPABASE_URL'),
    SUPABASE_SERVICE_ROLE_KEY: required(env, 'SUPABASE_SERVICE_ROLE_KEY'),
  })
}

async function until<T>(read: () => Promise<T | null>, timeoutMs: number, description: string): Promise<T> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const result = await read()
    if (result !== null) return result
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`timed out waiting for ${description}`)
}

async function runNoModelMcpCheck(url: string, token: string, expected: 'unauthorized' | 'unavailable'): Promise<ProofResult> {
  const dir = join(PROOF_DIR, `.scratch-${randomUUID()}`)
  const fakeBin = join(dir, 'bin')
  mkdirSync(fakeBin, { recursive: true, mode: 0o700 })
  const fakeClaude = join(fakeBin, 'claude')
  const source = `#!${process.execPath}
import { readFileSync } from 'node:fs'
const args = process.argv.slice(2)
const configPath = args[args.indexOf('--mcp-config') + 1]
const config = JSON.parse(readFileSync(configPath, 'utf8'))
const server = config.mcpServers.jemma
const requestBody = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'p48-no-model-check', version: '1.0.0' } } })
let result
try {
  const response = await fetch(server.url, { method: 'POST', headers: { authorization: server.headers.Authorization, 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: requestBody })
  result = response.status === 401 ? 'MCP request rejected with HTTP 401 Unauthorized.' : 'MCP request returned HTTP ' + response.status + ' before any model call.'
} catch {
  result = 'MCP endpoint unavailable before any model call.'
}
process.stdout.write(JSON.stringify({ type: 'result', result }) + '\\n')
`
  writeFileSync(fakeClaude, source, { mode: 0o700 })
  chmodSync(fakeClaude, 0o700)

  const oldPath = process.env.PATH
  process.env.PATH = fakeBin
  try {
    const stderr: string[] = []
    const result = await runJob(
      { eventId: 'p48-negative-check', prompt: 'Do not make a model request. Check only the MCP connection.' },
      'claude',
      { url, token },
      { timeoutMs: 8_000, extraDirs: [], onStderr: (chunk) => stderr.push(chunk) },
    )
    const matches = expected === 'unauthorized' ? /HTTP 401 Unauthorized/.test(result.note) : /unavailable/.test(result.note)
    if (result.status !== 'failed' || !matches) throw new Error(`negative ${expected} check did not fail plainly: ${result.status}; ${result.note}; ${stderr.join('').slice(-1000)}`)
    return result
  } finally {
    process.env.PATH = oldPath
    rmSync(dir, { recursive: true, force: true })
  }
}

async function stoppedWorkerCheck(): Promise<void> {
  const result = await runNoModelMcpCheck(DEFAULT_MCP_URL, randomBytes(24).toString('hex'), 'unavailable')
  console.log(`negative_stopped_worker=${result.status}; note=${result.note}`)
}

async function main(): Promise<void> {
  if (process.argv.includes('--negative-stopped')) return stoppedWorkerCheck()
  if (process.argv.includes('--negative-wrong-token')) {
    const result = await runNoModelMcpCheck(DEFAULT_MCP_URL, randomBytes(24).toString('hex'), 'unauthorized')
    console.log(`negative_wrong_token=${result.status}; note=${result.note}`)
    return
  }

  const env = loadEnv()
  assertDevProject(env)
  configureProcess()
  const mcpUrl = DEFAULT_MCP_URL
  const agents = await detectAgents()
  console.log(`claude_version=${agents.claude.version ?? 'unknown'}; claude_signed_in=${agents.claude.signedIn}`)
  if (!agents.claude.installed || agents.claude.signedIn !== true) {
    throw new Error('Claude Code is not confirmed signed in; no job was started')
  }

  const admin = serviceDb(env)
  const sandbox: Sandbox = await createSandbox(admin, { stage: 'marked' })
  let tokenHash: string | null = null
  let runner: ReturnType<typeof startRunner> | null = null
  let realDurationMs = 0
  let transcriptTools: string[] = []
  let stderrBytes = 0
  let runResult: ProofResult | null = null
  let planCalls = 0
  const startedAt = new Date().toISOString()
  const runnerId = randomUUID()

  try {
    const schoolUpdate = await admin.from('schools').update({ ai_runner: 'desktop' }).eq('id', sandbox.schoolId).select('ai_runner').single()
    if (schoolUpdate.error || schoolUpdate.data.ai_runner !== 'desktop') throw new Error('sandbox school did not enter desktop runner mode')

    const loginQuery = await admin.from('demo_sandboxes').select('logins').eq('id', sandbox.sandboxId).single()
    if (loginQuery.error) throw new Error(`could not read synthetic teacher login: ${loginQuery.error.message}`)
    const login = (loginQuery.data.logins as unknown as LoginRow).teacher
    const user = createClient(required(env, 'SUPABASE_URL'), required(env, 'SUPABASE_ANON_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    }) as JemmaDb
    const signedIn = await user.auth.signInWithPassword({ email: login.email, password: login.password })
    if (signedIn.error) throw new Error(`synthetic teacher sign-in failed: ${signedIn.error.message}`)

    const testQuery = await admin.from('tests').select('id').eq('class_id', sandbox.classId).single()
    if (testQuery.error) throw new Error(`marked-stage test was not found: ${testQuery.error.message}`)
    const paperQuery = await admin.from('papers').select('id').eq('test_id', testQuery.data.id).eq('status', 'marked').limit(1).single()
    if (paperQuery.error) throw new Error(`marked-stage paper was not found: ${paperQuery.error.message}`)

    const token = randomBytes(32).toString('hex')
    tokenHash = createHash('sha256').update(token).digest('hex')
    const tokenInsert = await admin.from('mcp_tokens').insert({ token_hash: tokenHash, user_id: login.userId, label: 'p48-real-runner-proof' })
    if (tokenInsert.error) throw new Error(`could not add synthetic teacher MCP token: ${tokenInsert.error.message}`)

    const wrongTokenCheck = await runNoModelMcpCheck(mcpUrl, randomBytes(24).toString('hex'), 'unauthorized')

    const productionSteps = await jobPlan({ type: 'paper.checked', paperId: paperQuery.data.id }, user)
    const classReport = productionSteps.find((step) => step.job === 'class_report')
    if (!classReport) throw new Error('the marked-stage paper.checked plan did not contain class_report')
    const eventId = await withTemporaryEnv(
      {
        SUPABASE_URL: required(env, 'SUPABASE_URL'),
        SUPABASE_SERVICE_ROLE_KEY: required(env, 'SUPABASE_SERVICE_ROLE_KEY'),
        EVENTS_SECRET: required(env, 'EVENTS_SECRET'),
        AGENT_URL: 'http://127.0.0.1:8748',
      },
      () => sendEvent('paper.checked', { paperId: paperQuery.data.id }),
    )
    await until(async () => {
      const read = await admin.from('events').select('status, runner').eq('id', eventId).single()
      if (read.error) throw new Error(`event route read failed: ${read.error.message}`)
      return read.data.status === 'queued' && read.data.runner === 'desktop' ? read.data : null
    }, 30_000, 'event to route to the desktop runner')
    assertAgentEnvironmentSafe()

    runner = startRunner({
      supabase: user,
      runnerId,
      agent: 'claude',
      mcp: { url: mcpUrl, token },
      heartbeatMs: 10_000,
      pollMs: 200,
      timeoutMs: REAL_JOB_TIMEOUT_MS,
      detect: async () => agents,
      plan: async () => {
        planCalls += 1
        return [classReport]
      },
      run: async (job, agent: AgentName, target, options?: RunOptions) => {
        if (agent !== 'claude') throw new Error('P48 is restricted to Claude Code')
        const output: string[] = []
        const jobStart = Date.now()
        const result = await runJob(job, agent, target, {
          ...options,
          onStdout: (chunk) => output.push(chunk),
          onStderr: (chunk) => { stderrBytes += Buffer.byteLength(chunk) },
        })
        realDurationMs = Date.now() - jobStart
        transcriptTools = parseTranscript(agent, output.join('')).toolCalls
        runResult = result
        return result
      },
      loadPrompt: async (job) =>
        job === 'class_report' ? readFileSync(new URL('../../packages/profiling/src/jobs/class_report.md', import.meta.url), 'utf8') : null,
      onError: () => {},
    })

    const heartbeat = await until(async () => {
      const read = await admin.from('runner_presence').select('user_id, chosen, agents, last_seen').eq('runner_id', runnerId).maybeSingle()
      if (read.error) throw new Error(`heartbeat read failed: ${read.error.message}`)
      return read.data
    }, 30_000, 'runner heartbeat')
    if (heartbeat.user_id !== login.userId || heartbeat.chosen !== 'claude') throw new Error('runner heartbeat was not scoped to the synthetic teacher')

    const event = await until(async () => {
      const read = await admin.from('events').select('id, status, runner, error, claimed_by, attempts, finished_at').eq('id', eventId).single()
      if (read.error) throw new Error(`event read failed: ${read.error.message}`)
      if (read.data.status === 'done' || read.data.status === 'failed') return read.data
      return null
    }, REAL_JOB_TIMEOUT_MS + 30_000, 'runner event settlement')

    // complete_job marks the event done inside MCP. The second plan call confirms startRunner consumed its plan.
    await until(async () => (planCalls >= 2 ? planCalls : null), 30_000, 'runner plan completion')
    await new Promise((resolve) => setTimeout(resolve, 400))

    const finalEvent = await admin.from('events').select('status, runner, error, claimed_by, attempts, finished_at').eq('id', eventId).single()
    if (finalEvent.error) throw new Error(`final event read failed: ${finalEvent.error.message}`)
    if (event.status !== 'done' || finalEvent.data.status !== 'done' || event.runner !== 'desktop' || event.claimed_by !== login.userId) {
      throw new Error(`real Claude job did not settle through the desktop runner: ${event.status}`)
    }
    const completedRun = await until(async () => runResult, 1_000, 'runJob result capture')
    if (completedRun.status !== 'done') throw new Error(`runJob did not report done: ${completedRun.note}`)

    const [reteachQuery, classQuery, testAgain, mapsQuery, logsQuery, heartbeatAgain] = await Promise.all([
      admin.from('reteach_plans').select('id, class_id, test_id, topic_id, topic_name, content, why, missing_basic, explanation').eq('test_id', testQuery.data.id).single(),
      admin.from('classes').select('school_id').eq('id', sandbox.classId).single(),
      admin.from('tests').select('class_id').eq('id', testQuery.data.id).single(),
      admin.from('curriculum_maps').select('id').eq('class_id', sandbox.classId),
      admin.from('activity_log').select('school_id, class_id, tool, text, at').eq('class_id', sandbox.classId).eq('tool', 'class_gap_report').gte('at', startedAt).order('at'),
      admin.from('runner_presence').select('user_id, chosen, last_seen').eq('runner_id', runnerId).single(),
    ])
    if (reteachQuery.error) throw new Error(`reteach row read failed: ${reteachQuery.error.message}`)
    if (classQuery.error || testAgain.error || mapsQuery.error || logsQuery.error || heartbeatAgain.error) throw new Error('post-run evidence query failed')
    const reteach = reteachQuery.data
    const reteachSchema = ReteachSchema.safeParse(reteach.content)
    if (!reteachSchema.success || !reteach.why || !reteach.missing_basic || !reteach.explanation) throw new Error('saved class report did not pass the cloud output schema checks')
    if (reteach.class_id !== sandbox.classId || reteach.test_id !== testQuery.data.id || classQuery.data.school_id !== sandbox.schoolId || testAgain.data.class_id !== sandbox.classId) {
      throw new Error('saved reteach row failed school and class scoping checks')
    }
    if (reteach.topic_id) {
      const topic = await admin.from('topics').select('map_id').eq('id', reteach.topic_id).single()
      if (topic.error || !mapsQuery.data.some((map) => map.id === topic.data.map_id)) throw new Error('saved topic was outside the sandbox class curriculum')
    }
    if (logsQuery.data.length < 2 || logsQuery.data.some((row) => row.school_id !== sandbox.schoolId || row.class_id !== sandbox.classId)) {
      throw new Error('class report activity rows were missing or outside the sandbox school')
    }
    if (heartbeatAgain.data.user_id !== login.userId || heartbeatAgain.data.chosen !== 'claude') throw new Error('heartbeat row was missing after the job')
    if (!transcriptTools.includes('mcp__jemma__class_gap_report') || !transcriptTools.includes('mcp__jemma__complete_job')) {
      throw new Error('Claude transcript did not include the class report save and completion tools')
    }

    console.log(`event_status=${finalEvent.data.status}; event_runner=${finalEvent.data.runner}; attempts=${finalEvent.data.attempts}`)
    console.log(`job=class_report; seconds=${(realDurationMs / 1000).toFixed(1)}; claude_model=${process.env.ANTHROPIC_MODEL}`)
    console.log(`tool_calls=${transcriptTools.join(' -> ')}`)
    console.log(`saved_rows=reteach_plans:1 updated; activity_log:${logsQuery.data.length}; schema=valid; school_scope=valid`)
    console.log(`heartbeat=present; stderr_bytes=${stderrBytes}; wrong_token=${wrongTokenCheck.status} HTTP 401; sandbox_id=${sandbox.sandboxId}`)
    console.log('full_plan_scope=class_report only, selected from production paper.checked jobPlan to enforce the one-job limit')
    console.log('agent_environment=Supabase credentials, event secret, MCP token, and provider API keys absent before runJob')
  } finally {
    runner?.stop()
    if (tokenHash) await admin.from('mcp_tokens').delete().eq('token_hash', tokenHash)
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'P48 proof failed')
  process.exitCode = 1
})
