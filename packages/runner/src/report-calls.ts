import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { AgentName } from './agents'
import type { McpTarget } from './run'
import type { TranscriptCall, TranscriptUsage } from './transcript'

/** A call to a server Jemma did not write (for example the filesystem server). Jemma's own calls are logged server-side. */
export type ExternalCall = { server: string; tool: string; input: unknown; output: unknown; ok: boolean; at: string }

/** The input of the Jemma MCP tool `log_external_calls`. */
export type ExternalCallsReport = {
  eventId: string
  engine: AgentName
  model: string | null
  usage: TranscriptUsage | null
  calls: ExternalCall[]
}

export const MAX_REPORTED_CALLS = 50
const REPORT_TIMEOUT_MS = 10_000

/** The calls worth reporting: not Jemma's own, in order, at most 50. */
export function externalCalls(calls: ExternalCall[] | TranscriptCall[]): ExternalCall[] {
  return calls
    .filter((c) => c.server !== 'jemma')
    .slice(0, MAX_REPORTED_CALLS)
    .map(({ server, tool, input, output, ok, at }) => ({ server, tool, input, output, ok, at }))
}

/**
 * Tells the Jemma server which borrowed tools a run used and what it cost, through its MCP tool
 * `log_external_calls`, with the same URL and bearer token the run used. Never throws and never fails a job: when
 * the tool does not exist yet, the server is down, or it answers with an error, this returns false.
 */
export async function reportCalls(mcp: McpTarget, report: ExternalCallsReport, timeoutMs = REPORT_TIMEOUT_MS): Promise<boolean> {
  const input: ExternalCallsReport = { ...report, calls: externalCalls(report.calls) }
  const client = new Client({ name: 'jemma-runner', version: '0.0.0' })
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const transport = new StreamableHTTPClientTransport(new URL(mcp.url), {
      requestInit: { headers: { Authorization: `Bearer ${mcp.token}` } },
    })
    const work = (async () => {
      await client.connect(transport)
      const result = await client.callTool({ name: 'log_external_calls', arguments: input as unknown as Record<string, unknown> })
      return result.isError !== true
    })()
    work.catch(() => {}) // a late failure after the timeout is not an unhandled rejection
    const timeout = new Promise<false>((resolve) => {
      timer = setTimeout(() => resolve(false), timeoutMs)
    })
    return await Promise.race([work, timeout])
  } catch {
    return false
  } finally {
    if (timer) clearTimeout(timer)
    await client.close().catch(() => {})
  }
}
