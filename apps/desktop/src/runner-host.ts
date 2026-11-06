import type { AgentName, RunnerOptions } from '@jemma/runner'
import type { JemmaDb } from '@jemma/profiling/db'
import type { Status } from './status'

export type Settings = { agent: AgentName | null; paused: boolean; runnerId: string }

export type HostConnection = { db: JemmaDb; userId: string; agentUrl: string | null }

export type HostDeps = {
  /** The per-user MCP token, or null when not paired. */
  getToken(): string | null
  /** The signed-in connection, or null when signed out or offline. */
  getConnection(): Promise<HostConnection | null>
  getSettings(): Settings
  startRunner(o: RunnerOptions): { stop(): void }
  /** The job being worked on, or a reason it cannot run, or null when there is neither. */
  currentStatus(conn: HostConnection): Promise<Status | null>
  onStatus(s: Status): void
  /** Overrides the agent's /mcp base, for tests and local runs. */
  agentUrlOverride?: string
}

/** Hosts startRunner from @jemma/runner: starts, swaps and stops it as pairing, sign-in, agent choice and pause change. */
export function createRunnerHost(deps: HostDeps) {
  let running: { agent: AgentName; stop(): void; conn: HostConnection } | null = null
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
    const conn = token && settings.agent ? await deps.getConnection() : null
    const agentUrl = deps.agentUrlOverride ?? conn?.agentUrl ?? null
    if (!token || !settings.agent || !conn || !agentUrl) {
      halt()
      return emit({ kind: 'off' })
    }
    if (settings.paused) {
      halt()
      return emit({ kind: 'paused' })
    }
    if (running && running.agent !== settings.agent) halt()
    if (!running) {
      const handle = deps.startRunner({
        supabase: conn.db,
        runnerId: settings.runnerId,
        agent: settings.agent,
        mcp: { url: `${agentUrl.replace(/\/+$/, '')}/mcp`, token },
      })
      running = { agent: settings.agent, stop: handle.stop, conn }
      emit({ kind: 'ready' })
    } else {
      running.conn = conn
    }
  }

  async function poll(): Promise<void> {
    if (!running) return
    const found = await deps.currentStatus(running.conn).catch(() => null)
    const next: Status = found ?? { kind: 'ready' }
    if (JSON.stringify(next) !== JSON.stringify(last)) emit(next)
  }

  return {
    refresh,
    poll,
    stop: halt,
    get status() {
      return last
    },
  }
}
