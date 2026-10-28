import { describe, expect, it, vi } from 'vitest'
import { createRunnerHost, type HostDeps } from '../src/runner-host'
import type { Status } from '../src/status'

const session = { userId: 'u1', email: 'a@b.test', displayName: 'Ms Banda', accessToken: 'at', supabaseUrl: 'https://x.supabase.test', supabaseAnonKey: 'anon', agentUrl: 'https://agent.test' }

function setup(over: Partial<HostDeps> = {}) {
  const stops: string[] = []
  const started: { agent: string; url: string; token: string }[] = []
  const statuses: Status[] = []
  const deps: HostDeps = {
    getToken: () => 'jmt_t',
    getSession: async () => session,
    getSettings: () => ({ agent: 'claude', paused: false, runnerId: 'r1' }),
    makeDb: () => ({}) as never,
    startRunner: (o) => {
      started.push({ agent: o.agent, url: o.mcp.url, token: o.mcp.token })
      return { stop: () => void stops.push(o.agent) }
    },
    currentJob: async () => null,
    onStatus: (s) => void statuses.push(s),
    ...over,
  }
  return { host: createRunnerHost(deps), started, stops, statuses }
}

describe('runner host', () => {
  it('starts the runner with the chosen agent and the agent /mcp url', async () => {
    const { host, started, statuses } = setup()
    await host.refresh()
    expect(started).toEqual([{ agent: 'claude', url: 'https://agent.test/mcp', token: 'jmt_t' }])
    expect(statuses.at(-1)).toEqual({ kind: 'idle' })
  })

  it('is off until paired, signed in and an agent is chosen', async () => {
    for (const over of [
      { getToken: () => null },
      { getSession: async () => null },
      { getSettings: () => ({ agent: null, paused: false, runnerId: 'r1' }) },
    ] as Partial<HostDeps>[]) {
      const { host, started, statuses } = setup(over)
      await host.refresh()
      expect(started).toEqual([])
      expect(statuses.at(-1)).toEqual({ kind: 'off' })
    }
  })

  it('pause stops the runner and says Paused', async () => {
    let paused = false
    const { host, stops, started, statuses } = setup({ getSettings: () => ({ agent: 'codex', paused, runnerId: 'r1' }) })
    await host.refresh()
    paused = true
    await host.refresh()
    expect(stops).toEqual(['codex'])
    expect(statuses.at(-1)).toEqual({ kind: 'paused' })
    paused = false
    await host.refresh()
    expect(started).toHaveLength(2)
  })

  it('does not start a second runner on repeat refreshes, but swaps when the agent changes', async () => {
    let agent: 'claude' | 'codex' = 'claude'
    const { host, started, stops } = setup({ getSettings: () => ({ agent, paused: false, runnerId: 'r1' }) })
    await host.refresh()
    await host.refresh()
    expect(started).toHaveLength(1)
    agent = 'codex'
    await host.refresh()
    expect(stops).toEqual(['claude'])
    expect(started.map((s) => s.agent)).toEqual(['claude', 'codex'])
  })

  it('shows the running job in words and goes back to idle', async () => {
    let job: string | null = 'Reading 3 of 5 papers'
    const { host, statuses } = setup({ currentJob: async () => job })
    await host.refresh()
    await host.poll()
    expect(statuses.at(-1)).toEqual({ kind: 'running', label: 'Reading 3 of 5 papers' })
    job = null
    await host.poll()
    expect(statuses.at(-1)).toEqual({ kind: 'idle' })
  })

  it('stop() stops the runner', async () => {
    const { host, stops } = setup()
    await host.refresh()
    host.stop()
    expect(stops).toEqual(['claude'])
  })
})
