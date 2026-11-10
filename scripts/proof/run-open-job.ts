/**
 * P49 proof: one full `class_report` job on Goose with a free open-weights model, through the desktop runner path.
 *
 * Needs the local agent worker on port 8749 (see docs/proof/open-runner-2026-11-10.md), Goose installed, and
 * OPENROUTER_API_KEY in .env.local. Synthetic data only, jemma-dev only. Live AI exception: free OpenRouter
 * open-weights models only, at most 12 live goose runs in total (`--live-used N` says how many are already spent).
 *
 *   pnpm --filter @jemma/runner open-job --runs 3 --live-used 0
 *   (--start N numbers the saved files from run-N, for a later batch)
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'
import type { JemmaDb } from '../../packages/profiling/src/db/client'
import { jobPlan } from '../../packages/profiling/src/plans'
import {
  detectAgents,
  detectGoose,
  ensureReportsDir,
  gooseModels,
  parseTranscript,
  runJob,
  startRunner,
  type AgentName,
  type GooseAttempt,
  type RunOptions,
  type RunResult,
  type TranscriptCall,
} from '../../packages/runner/src/index'
import { createSandbox, type Sandbox } from '../../supabase/seed/demo'
import { sendEvent } from '../../apps/web/lib/agent'

const AGENT_URL = 'http://127.0.0.1:8749'
const MCP_URL = `${AGENT_URL}/mcp`
const LIVE_CAP = 12
const JOB_TIMEOUT_MS = 10 * 60_000
const DEFAULT_OUT_DIR = fileURLToPath(new URL('../../docs/proof/open-runner/', import.meta.url))
const ROOT_ENV_FILE = new URL('../../.env.local', import.meta.url)
const runnerRequire = createRequire(new URL('../../packages/runner/package.json', import.meta.url))
const { createClient } = runnerRequire('@supabase/supabase-js') as {
  createClient: (url: string, key: string, options: unknown) => unknown
}
const { createServiceClient } = runnerRequire('@jemma/profiling/db') as {
  createServiceClient: (env: { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string }) => JemmaDb
}
type McpClient = { connect(transport: unknown): Promise<void>; listTools(): Promise<{ tools: { name: string }[] }>; close(): Promise<void> }
const { Client } = runnerRequire('@modelcontextprotocol/sdk/client/index.js') as { Client: new (info: { name: string; version: string }) => McpClient }
const { StreamableHTTPClientTransport } = runnerRequire('@modelcontextprotocol/sdk/client/streamableHttp.js') as {
  StreamableHTTPClientTransport: new (url: URL, options: unknown) => unknown
}
const { ReteachSchema } = runnerRequire('@jemma/profiling/schemas') as { ReteachSchema: typeof import('../../packages/profiling/src/schemas/diagnosis').ReteachSchema }

type Env = Record<string, string | undefined>
type LoginRow = { teacher: { userId: string; email: string; password: string } }
type AttemptRecord = { model: string; seconds: number; status: 'done' | 'failed'; note: string; saved: boolean; tokens: { input: number; output: number; costUsd: number } | null }
type Check = { name: string; pass: boolean; detail: string }
type RunRecord = {
  n: number
  sandboxId: string | null
  eventId: string | null
  finalModel: string | null
  status: string
  note: string
  seconds: number
  attempts: AttemptRecord[]
  toolCalls: string[]
  tokens: { input: number; output: number; costUsd: number } | null
  reported: boolean | null
  /** Does the worker offer log_external_calls? */
  workerHasLogTool: boolean | null
  /** What the tool log (`tool_calls`) holds for this run's school, counted. */
  toolLog: { runnerRows: number; agentRunRows: number; mcpRows: Record<string, number> } | null
  checks: Check[]
  reportFile: string | null
  error: string | null
}

// Everything the goose child must not see. OPENROUTER_API_KEY is the one secret it needs, so it is not in this list.
const KEEP_OUT = [
  'SUPABASE_PROJECT_ID', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_DB_PASSWORD', 'SUPABASE_DB_URL',
  'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'EVENTS_SECRET', 'AGENT_URL', 'JEMMA_MCP_TOKEN', 'CHILD_PIN_PEPPER',
  'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'OPENAI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'GOOGLE_API_KEY',
  'DEEPSEEK_API_KEY', 'OPENCODE_API_KEY', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY',
  'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_BEARER_TOKEN_BEDROCK', 'GOOGLE_APPLICATION_CREDENTIALS', 'ANTHROPIC_VERTEX_PROJECT_ID',
]

function loadEnv(): Env {
  return { ...parseEnv(readFileSync(ROOT_ENV_FILE, 'utf8')), ...process.env }
}

function required(env: Env, key: string): string {
  const value = env[key]
  if (!value) throw new Error(`required environment value is missing: ${key}`)
  return value
}

function assertDevProject(env: Env): void {
  const ref = new URL(required(env, 'SUPABASE_URL')).hostname.split('.')[0]
  if (ref !== 'ayxgctbemuvozwktstaa') throw new Error('configured Supabase project is not jemma-dev')
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

async function until<T>(read: () => Promise<T | null>, timeoutMs: number, description: string): Promise<T> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const result = await read()
    if (result !== null) return result
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`timed out waiting for ${description}`)
}

function args(): { runs: number; start: number; usedLive: number; outDir: string } {
  const argv = process.argv.slice(2)
  const value = (flag: string, fallback: string) => argv[argv.indexOf(flag) + 1] ?? fallback
  return {
    runs: argv.includes('--runs') ? Number(value('--runs', '3')) : 3,
    start: argv.includes('--start') ? Number(value('--start', '1')) : 1,
    usedLive: argv.includes('--live-used') ? Number(value('--live-used', '0')) : 0,
    outDir: argv.includes('--out') ? value('--out', DEFAULT_OUT_DIR) : DEFAULT_OUT_DIR,
  }
}

const dash = String.fromCharCode(0x2014)

/** What may be saved in the repo: the user's token and the OpenRouter key never, and no em dash. */
function clean(text: string, secrets: string[]): string {
  let out = text
  for (const secret of secrets) if (secret) out = out.split(secret).join('[redacted]')
  return out.split(dash).join('-')
}

const tokensOf = (u: { inputTokens: number; outputTokens: number; costUsd: number } | null) =>
  u ? { input: u.inputTokens, output: u.outputTokens, costUsd: u.costUsd } : null

const sumTokens = (list: (AttemptRecord['tokens'])[]) =>
  list.reduce<AttemptRecord['tokens']>(
    (acc, t) => (t ? { input: (acc?.input ?? 0) + t.input, output: (acc?.output ?? 0) + t.output, costUsd: (acc?.costUsd ?? 0) + t.costUsd } : acc),
    null,
  )

type Shared = { admin: JemmaDb; env: Env; reportsDir: string; liveLeft: () => number; spend: (n: number) => void; outDir: string }

async function oneRun(n: number, shared: Shared): Promise<RunRecord> {
  const { admin, env, reportsDir } = shared
  const record: RunRecord = {
    n, sandboxId: null, eventId: null, finalModel: null, status: 'not started', note: '', seconds: 0, attempts: [], toolCalls: [], tokens: null,
    reported: null, workerHasLogTool: null, toolLog: null, checks: [], reportFile: null, error: null,
  }
  const check = (name: string, pass: boolean, detail: string) => record.checks.push({ name, pass, detail })
  const secrets: string[] = [required(env, 'OPENROUTER_API_KEY')]
  const attemptStreams: { attempt: GooseAttempt }[] = []
  let tokenHash: string | null = null
  let runner: ReturnType<typeof startRunner> | null = null
  let runResult: RunResult | null = null
  let planCalls = 0
  const runnerId = randomUUID()
  const startedAt = new Date().toISOString()

  try {
    const sandbox: Sandbox = await createSandbox(admin, { stage: 'marked' })
    record.sandboxId = sandbox.sandboxId
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
    secrets.push(token)
    tokenHash = createHash('sha256').update(token).digest('hex')
    const tokenInsert = await admin.from('mcp_tokens').insert({ token_hash: tokenHash, user_id: login.userId, label: 'p49-open-runner-proof' })
    if (tokenInsert.error) throw new Error(`could not add synthetic teacher MCP token: ${tokenInsert.error.message}`)

    const before = await admin.from('reteach_plans').select('id, why, explanation, content').eq('test_id', testQuery.data.id).maybeSingle()
    const steps = await jobPlan({ type: 'paper.checked', paperId: paperQuery.data.id }, user)
    const classReport = steps.find((step) => step.job === 'class_report')
    if (!classReport) throw new Error('the marked-stage paper.checked plan did not contain class_report')

    const eventId = await withTemporaryEnv(
      {
        SUPABASE_URL: required(env, 'SUPABASE_URL'),
        SUPABASE_SERVICE_ROLE_KEY: required(env, 'SUPABASE_SERVICE_ROLE_KEY'),
        EVENTS_SECRET: required(env, 'EVENTS_SECRET'),
        AGENT_URL,
      },
      () => sendEvent('paper.checked', { paperId: paperQuery.data.id }),
    )
    record.eventId = eventId
    await until(async () => {
      const read = await admin.from('events').select('status, runner').eq('id', eventId).single()
      if (read.error) throw new Error(`event route read failed: ${read.error.message}`)
      return read.data.status === 'queued' && read.data.runner === 'desktop' ? read.data : null
    }, 30_000, 'event to route to the desktop runner')

    const stillThere = KEEP_OUT.filter((key) => process.env[key])
    if (stillThere.length) throw new Error(`sensitive environment values remain before runJob: ${stillThere.join(', ')}`)
    if (!process.env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY is missing before runJob')

    const jobStart = Date.now()
    runner = startRunner({
      supabase: user,
      runnerId,
      agent: 'goose',
      mcp: { url: MCP_URL, token },
      heartbeatMs: 10_000,
      pollMs: 200,
      timeoutMs: JOB_TIMEOUT_MS,
      detect: async () => detectAgents(),
      plan: async () => {
        planCalls += 1
        return [classReport]
      },
      run: async (job, agent: AgentName, target, options?: RunOptions) => {
        // never start more models than the live cap leaves
        const models = gooseModels(process.env).slice(0, shared.liveLeft())
        const result = await runJob(job, agent, target, {
          ...options,
          models,
          reportsDir,
          onAttempt: (a) => {
            shared.spend(1)
            attemptStreams.push({ attempt: a })
            const u = parseTranscript('goose', a.stdout).usage
            record.attempts.push({ model: a.model, seconds: Number(a.seconds.toFixed(1)), status: a.status, note: a.note.slice(0, 300), saved: a.saved, tokens: tokensOf(u) })
          },
          onReport: (logged) => {
            record.reported = logged
          },
        })
        runResult = result
        return result
      },
      loadPrompt: async (job) =>
        job === 'class_report' ? readFileSync(new URL('../../packages/profiling/src/jobs/class_report.md', import.meta.url), 'utf8') : null,
      onError: () => {},
    })

    const heartbeat = await until(async () => {
      const read = await admin.from('runner_presence').select('user_id, chosen, last_seen').eq('runner_id', runnerId).maybeSingle()
      if (read.error) throw new Error(`heartbeat read failed: ${read.error.message}`)
      return read.data
    }, 30_000, 'runner heartbeat')
    check('heartbeat scoped to the teacher with chosen = goose', heartbeat.user_id === login.userId && heartbeat.chosen === 'goose', `chosen=${heartbeat.chosen}`)

    const finished = await until(async () => runResult, JOB_TIMEOUT_MS + 60_000, 'goose run to finish')
    record.seconds = Number(((Date.now() - jobStart) / 1000).toFixed(1))
    record.status = finished.status
    record.note = finished.note.slice(0, 500)
    const settled = await until(async () => {
      const read = await admin.from('events').select('status, runner, error, claimed_by, attempts').eq('id', eventId).single()
      if (read.error) throw new Error(`event read failed: ${read.error.message}`)
      return read.data.status === 'done' || read.data.status === 'failed' ? read.data : null
    }, 60_000, 'event settlement')
    check('event settled done on the desktop runner for the teacher', settled.status === 'done' && settled.runner === 'desktop' && settled.claimed_by === login.userId, `status=${settled.status}; runner=${settled.runner}; attempts=${settled.attempts}; error=${settled.error ?? 'null'}`)

    // does the worker have the tool the runner reports borrowed calls to? (P50a builds it; informational)
    const lister = new Client({ name: 'p49-proof', version: '0.0.0' })
    try {
      await lister.connect(new StreamableHTTPClientTransport(new URL(MCP_URL), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }))
      const names = (await lister.listTools()).tools.map((t) => t.name)
      record.workerHasLogTool = names.includes('log_external_calls')
    } catch {
      record.workerHasLogTool = null
    } finally {
      await lister.close().catch(() => {})
    }

    // the stream of the model that finally ran (or the last one that ran)
    const last = attemptStreams.at(-1)?.attempt
    record.finalModel = last?.model ?? null
    const seen = last ? parseTranscript('goose', last.stdout) : null
    const calls: TranscriptCall[] = seen?.calls ?? []
    record.toolCalls = calls.map((c) => `${c.server}__${c.tool}${c.ok ? '' : ' (error)'}`)
    record.tokens = sumTokens(record.attempts.map((a) => a.tokens))
    // The model chooses its own calls. get_job is not required: the prompt already carries the job and its ids.
    for (const need of ['jemma__get_class_results', 'jemma__class_gap_report', 'jemma__complete_job', 'files__write_file']) {
      const hit = calls.some((c) => `${c.server}__${c.tool}` === need && c.ok)
      check(`tool call ${need} answered ok`, hit, hit ? 'yes' : 'missing or errored')
    }
    const order = ['jemma__get_class_results', 'jemma__class_gap_report', 'files__write_file', 'jemma__complete_job']
    const names = calls.map((c) => `${c.server}__${c.tool}`)
    const positions = order.map((o) => names.indexOf(o))
    check('reads, then the save, then the file copy, then complete_job', positions.every((p) => p >= 0) && positions.every((p, i) => i === 0 || p > positions[i - 1]!), positions.join(','))

    // rows: same checks as the P48 proof
    const [reteachQuery, classQuery, testAgain, mapsQuery, logsQuery] = await Promise.all([
      admin.from('reteach_plans').select('id, class_id, test_id, topic_id, topic_name, content, why, missing_basic, explanation').eq('test_id', testQuery.data.id).maybeSingle(),
      admin.from('classes').select('school_id').eq('id', sandbox.classId).single(),
      admin.from('tests').select('class_id').eq('id', testQuery.data.id).single(),
      admin.from('curriculum_maps').select('id').eq('class_id', sandbox.classId),
      admin.from('activity_log').select('school_id, class_id, tool').eq('class_id', sandbox.classId).eq('tool', 'class_gap_report').gte('at', startedAt),
    ])
    const reteach = reteachQuery.data
    if (!reteach) {
      check('reteach row exists', false, 'no reteach_plans row for the test')
    } else {
      const schema = ReteachSchema.safeParse(reteach.content)
      check('reteach content passes ReteachSchema and why, missing_basic, explanation are set', schema.success && !!reteach.why && !!reteach.missing_basic && !!reteach.explanation, schema.success ? 'schema valid' : schema.error.issues.map((i) => i.message).join('; ').slice(0, 200))
      check('reteach row is scoped to the sandbox class, test and school', reteach.class_id === sandbox.classId && reteach.test_id === testQuery.data.id && classQuery.data?.school_id === sandbox.schoolId && testAgain.data?.class_id === sandbox.classId, `class=${reteach.class_id === sandbox.classId}; test=${reteach.test_id === testQuery.data.id}; school=${classQuery.data?.school_id === sandbox.schoolId}`)
      if (reteach.topic_id) {
        const topic = await admin.from('topics').select('map_id').eq('id', reteach.topic_id).single()
        check('saved topic belongs to the class curriculum', !topic.error && !!mapsQuery.data?.some((m) => m.id === topic.data.map_id), topic.error?.message ?? 'ok')
      }
      const changed = !before.data || before.data.why !== reteach.why || before.data.explanation !== reteach.explanation || JSON.stringify(before.data.content) !== JSON.stringify(reteach.content)
      check('the reteach row was written by this run', changed, before.data ? 'differs from the seeded row' : 'new row')
    }
    const logs = logsQuery.data ?? []
    check('class report activity rows are in the sandbox school', logs.length >= 1 && logs.every((r) => r.school_id === sandbox.schoolId && r.class_id === sandbox.classId), `rows=${logs.length}`)

    // The tool log: did the borrowed calls and the usage get logged, and did the server log Jemma's own calls?
    if (record.workerHasLogTool) {
      const logQuery = await admin
        .from('tool_calls')
        .select('server, tool, via, engine, model, input, output, ok, event_id, started_at')
        .eq('school_id', sandbox.schoolId)
        .gte('started_at', new Date(Date.parse(startedAt) - 5_000).toISOString())
      const rows = logQuery.data ?? []
      const runnerRows = rows.filter((r) => r.via === 'runner' && r.tool !== 'agent_run')
      const usageRows = rows.filter((r) => r.via === 'runner' && r.server === 'runner' && r.tool === 'agent_run')
      const borrowed = calls.filter((c) => c.server !== 'jemma')
      check('log_external_calls answered true', record.reported === true, `reported=${record.reported}${logQuery.error ? `; read error: ${logQuery.error.message}` : ''}`)
      check(
        'one runner row per borrowed call: via runner, engine goose, the model id, server and tool, input and output present, ok matches',
        runnerRows.length === borrowed.length &&
          borrowed.every((c) => runnerRows.some((r) => r.server === c.server && r.tool === c.tool && r.engine === 'goose' && r.model === record.finalModel && r.event_id === eventId && r.ok === c.ok && r.input !== null && typeof r.input === 'object' && Object.keys(r.input as object).length > 0 && r.output !== null)),
        `rows=${runnerRows.length} (${runnerRows.map((r) => `${r.server}.${r.tool}`).join(', ')}); borrowed calls=${borrowed.length}`,
      )
      const u = usageRows[0]?.output as { inputTokens?: unknown; outputTokens?: unknown; costUsd?: unknown } | null | undefined
      check('one agent_run usage row with tokens and cost, model id and engine', usageRows.length === 1 && usageRows[0]!.engine === 'goose' && usageRows[0]!.model === record.finalModel && typeof u?.inputTokens === 'number' && typeof u?.outputTokens === 'number' && typeof u?.costUsd === 'number', `rows=${usageRows.length}; output=${JSON.stringify(u ?? null)}`)
      const loggedText = JSON.stringify([...runnerRows, ...usageRows])
      const leaked = secrets.filter((secret) => secret && loggedText.includes(secret))
      check('no token or key in the runner rows', leaked.length === 0 && !/bearer/i.test(loggedText), `${loggedText.length} characters searched`)
      const mcpRows = rows.filter((r) => r.via === 'mcp' && r.server === 'jemma')
      const wanted = new Map<string, number>()
      for (const c of calls) if (c.server === 'jemma') wanted.set(c.tool, (wanted.get(c.tool) ?? 0) + 1)
      const have: Record<string, number> = {}
      for (const r of mcpRows) have[r.tool] = (have[r.tool] ?? 0) + 1
      check('server-side row (via mcp) for each Jemma tool call the model made', [...wanted].every(([tool, n]) => (have[tool] ?? 0) >= n), `model called ${[...wanted].map(([t, n]) => `${t} x${n}`).join(', ')}; server logged ${Object.entries(have).map(([t, n]) => `${t} x${n}`).join(', ')}`)
      record.toolLog = { runnerRows: runnerRows.length, agentRunRows: usageRows.length, mcpRows: have }
    }

    // the borrowed server's copy of the report
    const reportName = `class_report-${sandbox.classId}.md`
    const reportPath = join(reportsDir, reportName)
    if (existsSync(reportPath)) {
      const text = readFileSync(reportPath, 'utf8')
      const cites = /\bq(uestion)?s?\.?\s*#?\d+/i.test(text)
      check('report file exists and is not empty', text.trim().length > 0, `${text.length} characters`)
      check('report file cites question numbers', cites, cites ? 'found a question number' : 'no question number found')
      mkdirSync(shared.outDir, { recursive: true })
      record.reportFile = `report-${n}.md`
      writeFileSync(join(shared.outDir, record.reportFile), clean(text, secrets))
    } else {
      check('report file exists and is not empty', false, `no file at ${reportName}`)
    }

    // the stream-json, one attempt after another, with the secrets and em dashes taken out
    mkdirSync(shared.outDir, { recursive: true })
    const lines: string[] = []
    for (const { attempt } of attemptStreams) {
      lines.push(JSON.stringify({ type: 'jemma_attempt', model: attempt.model, seconds: Number(attempt.seconds.toFixed(1)), status: attempt.status, timedOut: attempt.timedOut, saved: attempt.saved }))
      for (const line of attempt.stdout.split('\n')) if (line.trim().startsWith('{')) lines.push(line)
    }
    const stream = clean(lines.join('\n') + '\n', secrets)
    if (/authorization/i.test(stream)) throw new Error('refusing to save a transcript that mentions Authorization')
    writeFileSync(join(shared.outDir, `run-${n}.jsonl`), stream)
  } catch (err) {
    record.error = clean(err instanceof Error ? err.message : String(err), secrets)
    if (record.status === 'not started') record.status = 'error'
  } finally {
    runner?.stop()
    if (tokenHash) await admin.from('mcp_tokens').delete().eq('token_hash', tokenHash)
  }
  return record
}

async function main(): Promise<void> {
  const { runs, start, usedLive, outDir } = args()
  const env = loadEnv()
  assertDevProject(env)
  const openrouterKey = required(env, 'OPENROUTER_API_KEY')
  const admin = createServiceClient({ SUPABASE_URL: required(env, 'SUPABASE_URL'), SUPABASE_SERVICE_ROLE_KEY: required(env, 'SUPABASE_SERVICE_ROLE_KEY') })

  // The goose child gets only the OpenRouter key. The event helper gets the Supabase values while it posts, no longer.
  for (const key of KEEP_OUT) delete process.env[key]
  process.env.OPENROUTER_API_KEY = openrouterKey

  const health = await fetch(`${AGENT_URL}/health`).then((r) => r.text()).catch(() => 'unreachable')
  if (!/"ok":\s*true/.test(health)) throw new Error(`the agent worker on ${AGENT_URL} did not answer /health: ${health.slice(0, 80)}`)

  const goose = await detectGoose()
  console.log(`goose_installed=${goose.installed}; goose_version=${goose.version}; signed_in=${goose.signedIn}; models=${gooseModels(process.env).join(',')}`)
  if (!goose.installed || goose.signedIn !== true) throw new Error('goose is not installed or OPENROUTER_API_KEY is missing')

  const reportsDir = ensureReportsDir({ JEMMA_REPORTS_DIR: mkdtempSync(join(tmpdir(), 'jemma-open-reports-')) })
  let spent = usedLive
  const shared: Shared = { admin, env, reportsDir, liveLeft: () => LIVE_CAP - spent, spend: (k) => (spent += k), outDir }
  const results: RunRecord[] = []
  try {
    for (let n = start; n < start + runs; n++) {
      if (shared.liveLeft() <= 0) {
        console.log(`live cap of ${LIVE_CAP} reached, stopping before run ${n}`)
        break
      }
      const record = await oneRun(n, shared)
      results.push(record)
      console.log(`RUN_RESULT ${JSON.stringify(record)}`)
    }
  } finally {
    rmSync(reportsDir, { recursive: true, force: true })
  }
  console.log(`live_runs_used=${spent} of ${LIVE_CAP}`)
  const failedChecks = results.flatMap((r) => r.checks.filter((c) => !c.pass).map((c) => `run ${r.n}: ${c.name}`))
  console.log(`runs_done=${results.filter((r) => r.status === 'done').length} of ${results.length}; failed_checks=${failedChecks.length}`)
  for (const f of failedChecks) console.log(`FAILED_CHECK ${f}`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'P49 proof failed')
  process.exitCode = 1
})
