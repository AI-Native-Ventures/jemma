import { z } from 'zod'
import { contextFor, defineTool, trimForLog } from '../context'

const MAX_CALLS = 50

const ExternalCallSchema = z.object({
  server: z.string(),
  tool: z.string(),
  input: z.unknown(),
  output: z.unknown(),
  ok: z.boolean(),
  /** When the call started, as an ISO time. */
  at: z.string(),
})

export const logExternalCalls = defineTool({
  name: 'log_external_calls',
  description: 'Save the tool calls an agent made to servers other than Jemma during one run, with the engine, model and usage, so the teacher can read them.',
  input: z.object({
    eventId: z.string(),
    engine: z.enum(['claude', 'codex', 'goose']),
    model: z.string().nullable(),
    usage: z.object({ inputTokens: z.number(), outputTokens: z.number(), costUsd: z.number() }).nullable(),
    calls: z.array(ExternalCallSchema).max(MAX_CALLS),
  }),
  output: z.object({ logged: z.number().int() }),
  async run(ctx, { eventId, engine, model, usage, calls }) {
    if (calls.length > MAX_CALLS) throw new Error(`log_external_calls takes at most ${MAX_CALLS} calls`)
    if (calls.some((c) => c.server.trim().toLowerCase() === 'jemma')) {
      throw new Error('log_external_calls is for other servers: calls to jemma are logged by the server itself')
    }
    const times = calls.map((c) => new Date(c.at))
    if (times.some((t) => Number.isNaN(t.getTime()))) throw new Error('log_external_calls: every call needs a time in `at`')
    // The event must belong to a school this context covers; the rows go to that school.
    const own = await contextFor(ctx, 'events', eventId)
    const base = { school_id: own.schoolId, event_id: eventId, via: 'runner', engine, model, error: null, duration_ms: 0 }
    const rows = calls.map((c, i) => ({
      ...base,
      server: c.server,
      tool: c.tool,
      input: trimForLog(c.input) ?? {},
      output: trimForLog(c.output),
      ok: c.ok,
      started_at: times[i]!.toISOString(),
    }))
    if (usage) {
      rows.push({ ...base, server: 'runner', tool: 'agent_run', input: {}, output: trimForLog(usage), ok: true, started_at: ctx.now().toISOString() })
    }
    if (rows.length) {
      const { error } = await ctx.db.from('tool_calls').insert(rows)
      if (error) throw new Error(`tool_calls write failed: ${error.message}`)
    }
    return { logged: calls.length }
  },
})
