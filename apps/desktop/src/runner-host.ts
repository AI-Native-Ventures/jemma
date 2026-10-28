import type { AgentName, RunnerOptions } from '@jemma/runner'
import type { JemmaDb } from '@jemma/profiling/db'
import type { Status } from './status'

export type Settings = { agent: AgentName | null; paused: boolean; runnerId: string }

export type SessionInfo = {
  userId: string
  email: string | null
  displayName: string | null
  accessToken: string
  supabaseUrl: string
  supabaseAnonKey: string
  agentUrl: string | null
}

export type HostDeps = {
  getToken(): string | null
  /** The signed-in web session, or null when signed out or offline. */
  getSession(): Promise<SessionInfo | null>
  getSettings(): Settings
  makeDb(session: SessionInfo): JemmaDb
  startRunner(o: RunnerOptions): { stop(): void }
  /** Plain-words label of the event this runner is working on now, or null. */
  currentJob(db: JemmaDb, session: SessionInfo): Promise<string | null>
  onStatus(s: Status): void
  /** Overrides the agent's /mcp base, for tests and local runs. */
  agentUrlOverride?: string
}

/** Hosts startRunner from @jemma/runner: starts, swaps and stops it as pairing, sign-in, agent choice and pause change. */
export function createRunnerHost(deps: HostDeps) {
  let running: { agent: AgentName; stop(): void; db: JemmaDb; session: SessionInfo } | null = null
  let last: Status = { kind: 'off' }
  const emit = (s: Status) => {
    last = s
    deps.onStatus(s)
  }
  const halt = () => {
    running?.stop()
    running = null
  }

  async function refresh(): Promise<void> {
    const settings = deps.getSettings()
    const token = deps.getToken()
    const session = token && settings.agent ? await deps.getSession() : null
    const agentUrl = deps.agentUrlOverride ?? session?.agentUrl ?? null
    if (!token || !settings.agent || !session || !agentUrl) {
      halt()
      return emit({ kind: 'off' })
    }
    if (settings.paused) {
      halt()
      return emit({ kind: 'paused' })
    }
    if (running && running.agent !== settings.agent) halt()
    if (!running) {
      const db = deps.makeDb(session)
      const handle = deps.startRunner({
        supabase: db,
        runnerId: settings.runnerId,
        agent: settings.agent,
        mcp: { url: `${agentUrl.replace(/\/+$/, '')}/mcp`, token },
      })
      running = { agent: settings.agent, stop: handle.stop, db, session }
      emit({ kind: 'idle' })
    } else {
      running.session = session
    }
  }

  async function poll(): Promise<void> {
    if (!running) return
    const label = await deps.currentJob(running.db, running.session).catch(() => null)
    const next: Status = label ? { kind: 'running', label } : { kind: 'idle' }
    if (JSON.stringify(next) !== JSON.stringify(last)) emit(next)
  }

  return { refresh, poll, stop: halt, get status() { return last } }
}
