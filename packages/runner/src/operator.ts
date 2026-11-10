import { createHash, randomBytes } from 'node:crypto'
import { SupabaseReplayStore } from '@jemma/profiling/ai'
import type { JemmaDb } from '@jemma/profiling/db'
import { codeJobs } from '@jemma/profiling/orchestrator'
import type { ToolContext } from '@jemma/profiling/tools'
import { detectAgents, type AgentName, type AgentStatus } from './agents'
import { claimOperatorEvent, finishOperatorEvent, sendOperatorHeartbeat, type ClaimedEvent } from './claim'
import { processEvent, type JobReport, type RunnerOptions, type StepInput, type StepResult } from './loop'
import { DEFAULT_TIMEOUT_MS, runJob } from './run'
import { parseTranscript } from './transcript'

const HEARTBEAT_MS = 30_000
const POLL_MS = 3_000
/** Operator tokens older than this are left over from a runner that died (a job times out after 10 minutes). */
const STALE_TOKEN_MS = 60 * 60_000
const TOKEN_LABEL = 'operator'

export type OperatorOptions = {
  /** Service-role client. The operator reads the job plan, claims events and settles them through it. */
  db: JemmaDb
  runnerId: string
  agent: AgentName
  /** Base URL of the agent worker. The agent CLI talks to `<agentUrl>/mcp`. */
  agentUrl: string
  /** Independent claim loops, so two jobs run at once. Default 2. */
  concurrency?: number
  timeoutMs?: number
  /** One plain line per job, and a few lines for start, stop and problems. */
  onLog?: (line: string) => void
  /** The same job with its detail (school, agent tool calls in order). For traces and proofs. */
  onJob?: (report: JobReport) => void
  /** Routing tag (OPERATOR_TAG): only events the cloud handed off with the same tag (AI_ROUTE_TAG) are served. Default `default`. */
  tag?: string
  /** Stop after this many agent runs (a cap for paid or limited live runs). The step that hits it fails without running. */
  maxJobs?: number
  heartbeatMs?: number
  pollMs?: number
  // Seams for tests.
  run?: typeof runJob
  claim?: typeof claimOperatorEvent
  detect?: () => Promise<{ claude: AgentStatus; codex: AgentStatus }>
  loadPrompt?: RunnerOptions['loadPrompt']
  plan?: RunnerOptions['plan']
}

export type Operator = {
  /** No new claims, the presence row is deleted at once, running jobs finish. Resolves when they have. */
  stop(): Promise<void>
  /** How many agent runs were started so far. */
  jobsStarted(): number
}

const text = (err: unknown) => (err instanceof Error ? err.message : String(err))
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

/** `14:03:22  paper.snapped  read_paper  41s  done`, and for a failure the start of its note. */
export function formatJobLine(report: Pick<JobReport, 'event' | 'step' | 'seconds' | 'status' | 'note'>, at: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const time = `${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`
  const line = `${time}  ${report.event.type}  ${report.step.job}  ${Math.round(report.seconds)}s  ${report.status}`
  const note = report.note.replace(/\s+/g, ' ').trim().slice(0, 160)
  return report.status === 'failed' && note ? `${line}  (${note})` : line
}

/**
 * The owner's laptop as the AI worker of the hosted app. Beats every 30 seconds so the cloud knows it is there, and runs
 * `concurrency` claim loops. Each claimed event gets a one-time MCP token for its school (deleted when the event ends);
 * the plain-code steps run in this process, every other step is one agent run. Settles events with `finish_operator_event`.
 */
export function startOperator(o: OperatorOptions): Operator {
  const concurrency = Math.max(1, o.concurrency ?? 2)
  const mcpUrl = `${o.agentUrl.replace(/\/+$/, '')}/mcp`
  const run = o.run ?? runJob
  const timeoutMs = o.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const log = (line: string) => o.onLog?.(line)
  let stopping = false
  let started = 0
  let version: string | null = null
  let lastProblem = ''
  const wakers = new Set<() => void>()

  const problem = (err: unknown) => {
    const message = text(err)
    if (message === lastProblem) return
    lastProblem = message
    log(`problem: ${message}`)
  }

  const beat = async () => {
    if (stopping) return
    try {
      await sendOperatorHeartbeat(o.db, o.runnerId, o.agent, version, o.tag ?? 'default')
      lastProblem = ''
    } catch (err) {
      problem(err)
    }
  }
  const dropPresence = async () => {
    const { error } = await o.db.from('operator_presence').delete().eq('runner_id', o.runnerId)
    if (error) problem(new Error(`could not remove the presence row: ${error.message}`))
  }

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      const wake = () => {
        clearTimeout(timer)
        wakers.delete(wake)
        resolve()
      }
      const timer = setTimeout(wake, ms)
      wakers.add(wake)
    })

  /** The in-process steps (plan_next_session, update_learner_profile) need no agent and no quota. */
  const serviceContext = (event: ClaimedEvent): ToolContext => ({
    db: o.db,
    schoolId: event.school_id,
    eventId: event.id,
    now: () => new Date(),
    env: { replayStore: new SupabaseReplayStore(o.db) },
  })

  const stop = (() => {
    let done: Promise<void> | null = null
    return () => (done ??= (async () => {
      stopping = true
      clearInterval(ticker)
      for (const wake of wakers) wake()
      await dropPresence() // the cloud stops handing events to a runner that is leaving
      await Promise.all(loops)
      await dropPresence() // a heartbeat that was in flight may have written the row again
      log('operator stopped')
    })())
  })()

  const stepRunner = (mcp: { url: string; token: string }) => async ({ event, step, prompt }: StepInput): Promise<StepResult> => {
    const code = codeJobs[step.job]
    if (code) {
      try {
        await code(serviceContext(event), event.id, step.ids)
        return { status: 'done', note: '' }
      } catch (err) {
        return { status: 'failed', note: text(err) }
      }
    }
    if (o.maxJobs !== undefined && started >= o.maxJobs) {
      void stop()
      return { status: 'failed', note: `the limit of ${o.maxJobs} agent runs was reached, nothing was run` }
    }
    started++
    // The agent's complete_job call marks the event done after every step, while more steps may follow. The cloud keeps an
    // event running until its whole plan is over, and "one event per school at a time" counts running events, so the event
    // is put back to running within half a second. finish_operator_event settles it for good at the end.
    const keepRunning = () => void o.db.from('events').update({ status: 'running', finished_at: null }).eq('id', event.id).eq('status', 'done').then(() => {}, () => {})
    const hold = setInterval(keepRunning, 500)
    // Only the lines that name tool calls are kept: a vision job's stream is large.
    const kept: string[] = []
    let partial = ''
    const onStdout = (chunk: string) => {
      const lines = (partial + chunk).split('\n')
      partial = lines.pop() ?? ''
      for (const line of lines) if (line.slice(0, 80).includes('"assistant"') || line.slice(0, 80).includes('item.completed')) kept.push(line)
    }
    try {
      const res = await run({ eventId: event.id, prompt }, o.agent, mcp, { timeoutMs, onStdout })
      return { ...res, toolCalls: parseTranscript(o.agent, kept.join('\n')).toolCalls }
    } finally {
      clearInterval(hold)
      await o.db.from('events').update({ status: 'running', finished_at: null }).eq('id', event.id).eq('status', 'done')
    }
  }

  const runClaimed = async (event: ClaimedEvent) => {
    const token = randomBytes(32).toString('hex')
    const hash = sha256(token)
    const label = `${TOKEN_LABEL} ${o.runnerId.slice(0, 8)} ${event.type} ${event.id.slice(0, 8)}`
    const minted = await o.db.from('mcp_tokens').insert({ token_hash: hash, school_id: event.school_id, label })
    if (minted.error) {
      await finishOperatorEvent(o.db, event.id, 'failed', `could not start: ${minted.error.message}`).catch(() => {})
      return
    }
    try {
      await processEvent(
        {
          supabase: o.db,
          runnerId: o.runnerId,
          agent: o.agent,
          mcp: { url: mcpUrl, token },
          timeoutMs,
          asService: true,
          finish: finishOperatorEvent,
          runStep: stepRunner({ url: mcpUrl, token }),
          onJob: (report) => {
            log(formatJobLine(report))
            o.onJob?.(report)
          },
          plan: o.plan,
          loadPrompt: o.loadPrompt,
        },
        event,
      )
    } finally {
      const gone = await o.db.from('mcp_tokens').delete().eq('token_hash', hash)
      if (gone.error) problem(new Error(`could not delete a one-time token: ${gone.error.message}`))
    }
  }

  const claim = () => (o.claim ?? claimOperatorEvent)(o.db, o.runnerId, o.tag ?? 'default')

  const ticker = setInterval(() => void beat(), o.heartbeatMs ?? HEARTBEAT_MS)

  const first = (async () => {
    try {
      version = (await (o.detect ?? detectAgents)())[o.agent]?.version ?? null
    } catch (err) {
      problem(err)
    }
    // Tokens a dead runner left behind (its jobs are long over by now).
    const cutoff = new Date(Date.now() - STALE_TOKEN_MS).toISOString()
    await o.db.from('mcp_tokens').delete().like('label', `${TOKEN_LABEL} %`).lt('created_at', cutoff)
    await beat() // claim_operator_event needs the presence row
    log(`operator online: ${o.agent}${version ? ` ${version}` : ''}, ${concurrency} at a time${o.tag && o.tag !== 'default' ? `, tag ${o.tag}` : ''}`)
  })()

  const loops = Array.from({ length: concurrency }, async () => {
    await first
    while (!stopping) {
      let event: ClaimedEvent | null = null
      try {
        event = await claim()
      } catch (err) {
        problem(err)
      }
      if (event) {
        try {
          await runClaimed(event)
        } catch (err) {
          problem(err)
          await finishOperatorEvent(o.db, event.id, 'failed', text(err).slice(0, 500)).catch(() => {})
        }
      } else if (!stopping) await sleep(o.pollMs ?? POLL_MS)
    }
  })

  return { stop, jobsStarted: () => started }
}
