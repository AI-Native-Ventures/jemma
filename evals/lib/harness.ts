import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { JemmaDb } from '../../packages/profiling/src/db'
import { jobPlan } from '../../packages/profiling/src/plans'
import { EventSchema } from '../../packages/profiling/src/schemas/events'
import {
  ensureReportsDir,
  gooseModels,
  parseTranscript,
  runJob,
  startRunner,
  type AgentName,
  type GooseAttempt,
  type RunOptions,
  type RunResult,
} from '../../packages/runner/src/index'
import { createSandbox, deleteSandbox, type Sandbox } from '../../supabase/seed/demo'
import { sendEvent } from '../../apps/web/lib/agent'
import { appendLedger } from './ledger'
import { hookFinish, settledEvent } from './hook'
import { measureRoundTrip, readOneSchool } from './line'
import { providerErrorOf } from './provider'
import { baseName, RESULT_VERSION, type ResultFile } from './result'
import { saveResult } from './save'
import { answerContentTypes } from './stream'
import { required, withScrubbedEnv, withTemporaryEnv, type Env } from './env'
import type { AttemptRecord, Outcome, Task, Tokens, TranscriptCall } from './types'
import { callNames } from './checks'

const runnerRequire = createRequire(new URL('../../packages/runner/package.json', import.meta.url))
const { createClient } = runnerRequire('@supabase/supabase-js') as {
  createClient: (url: string, key: string, options: unknown) => unknown
}

export const JOB_TIMEOUT_MS = 10 * 60_000
const NONE = { installed: false, version: null, signedIn: false as const }

export type Shared = {
  admin: JemmaDb
  env: Env
  agentUrl: string
  runId: string
  outDir: string
  /** A fake goose is on PATH: nothing live is called and nothing is counted against the cap. */
  rehearsal: boolean
  liveLeft(): number
  spend(attempts: number): void
  timeoutMs?: number
  /** The database round trip in milliseconds (median of three reads). Default: three small reads through `admin`. */
  measureRoundTrip?: () => Promise<number>
}

type Logins = { teacher: { userId: string; email: string; password: string }; parent: { userId: string } }

const tokensOf = (u: { inputTokens: number; outputTokens: number; costUsd: number } | null): Tokens | null =>
  u ? { input: u.inputTokens, output: u.outputTokens, costUsd: u.costUsd } : null

const sumTokens = (list: (Tokens | null)[]): Tokens | null =>
  list.reduce<Tokens | null>((acc, t) => (t ? { input: (acc?.input ?? 0) + t.input, output: (acc?.output ?? 0) + t.output, costUsd: (acc?.costUsd ?? 0) + t.costUsd } : acc), null)

const round1 = (n: number) => Number(n.toFixed(1))

async function withTimeout<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([work, new Promise<never>((_r, reject) => (timer = setTimeout(() => reject(new Error(`timed out waiting for ${what}`)), ms)))])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function until<T>(read: () => Promise<T | null>, timeoutMs: number, what: string): Promise<T> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const got = await read()
    if (got !== null) return got
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`timed out waiting for ${what}`)
}

/**
 * One run of one task, end to end, on the real path: a fresh sandbox, the real event through the agent worker, the
 * runner's own loop, `runJob` with goose, then the checks. Never throws: a harness failure is saved as a failed run
 * with the error text. Cleans up its sandboxes, token and temp folder even when it fails.
 */
export async function runOnce(task: Task, n: number, shared: Shared): Promise<ResultFile> {
  const { admin, env } = shared
  const wallStart = Date.now()
  const startedAt = new Date().toISOString()
  const key = env.OPENROUTER_API_KEY ?? (shared.rehearsal ? 'rehearsal-key' : required(env, 'OPENROUTER_API_KEY'))
  const secrets = [key]
  const sandboxes: Sandbox[] = []
  const cleanup: string[] = []
  const attemptsRaw: GooseAttempt[] = []
  let tokenHash: string | null = null
  let runner: ReturnType<typeof startRunner> | null = null
  let evalRoot: string | null = null
  let reportsDir = ''
  let error: string | null = null
  let outcome: Outcome | null = null
  let facts: unknown = null
  let state: unknown = null
  let checks: ResultFile['checks'] = []
  let extras: ResultFile['extras'] = {}
  let jobSeconds = 0
  const finishErrors: string[] = []
  let dbRoundTripMs: number | null = null

  try {
    // The line to the database, right before the run: a slow line shows in the results instead of hiding in the times.
    dbRoundTripMs = await (shared.measureRoundTrip ?? (() => measureRoundTrip(() => readOneSchool(admin))))().catch(() => null)
    const sandbox = await createSandbox(admin, { stage: task.stage })
    sandboxes.push(sandbox)
    const school = await admin.from('schools').update({ ai_runner: 'desktop' }).eq('id', sandbox.schoolId).select('ai_runner').single()
    if (school.error || school.data.ai_runner !== 'desktop') throw new Error('the sandbox school did not switch to the desktop runner')

    const loginRow = await admin.from('demo_sandboxes').select('logins').eq('id', sandbox.sandboxId).single()
    if (loginRow.error) throw new Error(`could not read the synthetic logins: ${loginRow.error.message}`)
    const logins = loginRow.data.logins as unknown as Logins
    const people = { teacher: { userId: logins.teacher.userId, email: logins.teacher.email }, parent: { userId: logins.parent.userId } }
    const user = createClient(required(env, 'SUPABASE_URL'), required(env, 'SUPABASE_ANON_KEY'), { auth: { persistSession: false, autoRefreshToken: false } }) as JemmaDb
    const signedIn = await user.auth.signInWithPassword({ email: logins.teacher.email, password: logins.teacher.password })
    if (signedIn.error) throw new Error(`the synthetic teacher could not sign in: ${signedIn.error.message}`)

    evalRoot = realpathSync(mkdtempSync(join(tmpdir(), 'jemma-evals-')))
    reportsDir = ensureReportsDir({ JEMMA_REPORTS_DIR: join(evalRoot, 'a', 'b', 'reports') })

    const token = randomBytes(32).toString('hex')
    secrets.push(token)
    tokenHash = createHash('sha256').update(token).digest('hex')
    const minted = await admin.from('mcp_tokens').insert({ token_hash: tokenHash, user_id: people.teacher.userId, label: 'p53a-evals' })
    if (minted.error) throw new Error(`could not add the synthetic teacher token: ${minted.error.message}`)

    const prepared = await task.prepare({
      admin,
      sandbox,
      people,
      teacherDb: user,
      openSandbox: async (stage) => {
        const other = await createSandbox(admin, { stage })
        sandboxes.push(other)
        return other
      },
    })
    state = prepared.state

    const eventStartedAt = new Date().toISOString()
    const eventId = await withTemporaryEnv(
      { SUPABASE_URL: required(env, 'SUPABASE_URL'), SUPABASE_SERVICE_ROLE_KEY: required(env, 'SUPABASE_SERVICE_ROLE_KEY'), EVENTS_SECRET: required(env, 'EVENTS_SECRET'), AGENT_URL: shared.agentUrl },
      () => sendEvent(prepared.event.type, prepared.event.payload as never),
    )
    await until(async () => {
      const read = await admin.from('events').select('status, runner').eq('id', eventId).single()
      if (read.error) throw new Error(`event read failed: ${read.error.message}`)
      return read.data.status === 'queued' && read.data.runner === 'desktop' ? read.data : null
    }, 180_000, 'the event to route to the desktop runner')

    // The job of this task, from the real plan for the real event.
    const plan = await jobPlan(EventSchema.parse({ ...prepared.event.payload, type: prepared.event.type }), user)
    const found = plan.find((s) => s.job === task.job)
    if (!found) throw new Error(`the plan for ${prepared.event.type} has no ${task.job} step (it has: ${plan.map((s) => s.job).join(', ') || 'nothing'})`)
    const step = prepared.ids ? { ...found, ids: prepared.ids } : found
    const jobText = readFileSync(new URL(`../../packages/profiling/src/jobs/${task.job}.md`, import.meta.url), 'utf8')
    const text = prepared.promptSuffix ? `${jobText}\n\n${prepared.promptSuffix}` : jobText
    const models = prepared.models ?? gooseModels(process.env)

    let runResult: RunResult | null = null
    let reported: boolean | null = null
    let finish: () => void = () => {}
    const finished = new Promise<void>((resolve) => {
      finish = resolve
    })
    const timeoutMs = shared.timeoutMs ?? JOB_TIMEOUT_MS
    const runnerStart = Date.now()
    runner = startRunner({
      supabase: hookFinish(user, finish, finishErrors),
      runnerId: randomUUID(),
      agent: 'goose',
      mcp: { url: `${shared.agentUrl}/mcp`, token },
      heartbeatMs: 10_000,
      pollMs: 200,
      timeoutMs,
      detect: async () => ({ claude: NONE, codex: NONE }),
      plan: async () => [step],
      loadPrompt: async () => text,
      run: async (job, agent: AgentName, target, options?: RunOptions) => {
        const list = shared.rehearsal ? models : models.slice(0, Math.max(0, shared.liveLeft()))
        const result = await withScrubbedEnv({ OPENROUTER_API_KEY: key }, () =>
          runJob(job, agent, target, {
            ...options,
            models: list,
            reportsDir,
            onAttempt: (a) => {
              attemptsRaw.push(a)
              shared.spend(1)
            },
            onReport: (logged) => {
              reported = logged
            },
          }),
        )
        runResult = result
        return result
      },
      onError: () => {},
    })

    await withTimeout(finished, timeoutMs + 120_000, 'the runner to settle the event')
    jobSeconds = round1((Date.now() - runnerStart) / 1000)
    // The runner settles the event with finish_event after the plan. When that call fails on a slow line, the runner
    // tries once more with `failed`, so read until the event is settled (or the time is up) instead of once.
    const settled = await settledEvent(async () => {
      const row = await admin.from('events').select('status, error, runner, attempts').eq('id', eventId).single()
      if (row.error) throw new Error(`event read failed: ${row.error.message}`)
      return row.data
    })
    const eventRow = {
      data: settled.status === 'done' || settled.status === 'failed' || finishErrors.length === 0 ? settled : { ...settled, error: settled.error ?? finishErrors.join('; ').slice(0, 300) },
    }

    const parsed = attemptsRaw.map((a) => parseTranscript('goose', a.stdout))
    const attempts: AttemptRecord[] = attemptsRaw.map((a, i) => ({
      model: a.model,
      seconds: round1(a.seconds),
      status: a.status,
      note: a.note.slice(0, 300),
      providerError: a.status === 'failed' ? providerErrorOf(a.note) : null,
      saved: a.saved,
      timedOut: a.timedOut,
      tokens: tokensOf(parsed[i]!.usage),
    }))
    const callsByAttempt: TranscriptCall[][] = parsed.map((p) => p.calls)
    const contentTypes: Record<string, string[]> = {}
    for (const a of attemptsRaw) {
      for (const [name, types] of Object.entries(answerContentTypes(a.stdout))) contentTypes[name] = [...new Set([...(contentTypes[name] ?? []), ...types])].sort()
    }
    outcome = {
      event: { status: eventRow.data.status, error: eventRow.data.error, runner: eventRow.data.runner, attempts: eventRow.data.attempts },
      run: runResult,
      attempts,
      calls: callsByAttempt.flat(),
      callsByAttempt,
      finalModel: attemptsRaw.at(-1)?.model ?? null,
      seconds: jobSeconds,
      reported,
      contentTypes,
    }

    facts = await task.collect({ admin, sandbox, people, reportsDir, evalRoot, startedAt: eventStartedAt }, prepared, outcome)
    checks = task.checks(facts, prepared, outcome)
    extras = task.extras?.(facts, prepared, outcome) ?? {}
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
  } finally {
    runner?.stop()
    if (tokenHash) {
      const gone = await admin.from('mcp_tokens').delete().eq('token_hash', tokenHash)
      if (gone.error) cleanup.push(`token: ${gone.error.message}`)
    }
    for (const sb of sandboxes) {
      try {
        await deleteSandbox(admin, sb.sandboxId)
      } catch (err) {
        cleanup.push(`sandbox ${sb.sandboxId}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    if (evalRoot) rmSync(evalRoot, { recursive: true, force: true })
  }

  const wallSeconds = round1((Date.now() - wallStart) / 1000)
  if (error) checks = [{ name: 'the run reached its checks', pass: false, detail: error.slice(0, 400) }, ...checks]
  const attemptList = outcome?.attempts ?? attemptsRaw.map((a) => ({ model: a.model, seconds: round1(a.seconds), status: a.status, note: a.note.slice(0, 300), providerError: a.status === 'failed' ? providerErrorOf(a.note) : null, saved: a.saved, timedOut: a.timedOut, tokens: tokensOf(parseTranscript('goose', a.stdout).usage) }))
  const result: ResultFile = {
    version: RESULT_VERSION,
    runId: shared.runId,
    taskId: task.id,
    n,
    startedAt,
    rehearsal: shared.rehearsal,
    seconds: jobSeconds,
    wallSeconds,
    dbRoundTripMs,
    pass: !error && checks.length > 0 && checks.every((c) => c.pass),
    error,
    checks,
    event: outcome?.event ? { status: outcome.event.status, error: outcome.event.error } : null,
    run: outcome?.run ?? null,
    attempts: attemptList,
    finalModel: outcome?.finalModel ?? attemptsRaw.at(-1)?.model ?? null,
    tokens: sumTokens(attemptList.map((a) => a.tokens)),
    toolCalls: outcome ? callNames(outcome.calls) : attemptsRaw.flatMap((a) => callNames(parseTranscript('goose', a.stdout).calls)),
    reported: outcome?.reported ?? null,
    facts,
    state,
    extras,
    liveAttempts: shared.rehearsal ? 0 : attemptsRaw.length,
    sandboxIds: sandboxes.map((s) => s.sandboxId),
    stream: `${baseName(task.id, n)}.jsonl`,
    scrubbed: false,
    cleanup,
  }
  // A rehearsal (fake goose) is not a live run: it is not counted, and it leaves nothing in the committed ledger.
  if (!shared.rehearsal) appendLedger({ at: new Date().toISOString(), runId: shared.runId, taskId: task.id, n, attempts: attemptsRaw.length, rehearsal: false })
  return saveResult(result, attemptsRaw, secrets, shared.outDir, [[reportsDir, '<reports>'], [evalRoot ?? '', '<run>']])
}
