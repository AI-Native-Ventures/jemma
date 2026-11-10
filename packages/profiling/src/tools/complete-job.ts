import { z } from 'zod'
import { assertInSchool, defineTool } from './context'

export const completeJob = defineTool({
  name: 'complete_job',
  description:
    'Mark an event finished. Call it last, after the save tool, with status done, or failed and a short note. When a runner on a desktop is running the event, the runner settles it itself and this call changes nothing.',
  input: z.object({ eventId: z.string(), status: z.enum(['done', 'failed']), note: z.string().optional() }),
  output: z.object({ ok: z.literal(true) }),
  async run(ctx, { eventId, status, note }) {
    await assertInSchool(ctx, 'events', [eventId])
    // A desktop runner (the Jemma Desktop app or an operator runner) reads this call from the agent's transcript and settles the
    // event itself with finish_event or finish_operator_event after the whole plan. Writing the status here would show a plan
    // with more steps as finished after its first step.
    const found = await ctx.db.from('events').select('runner').eq('id', eventId).single()
    if (found.error) throw new Error(found.error.message)
    if (found.data.runner === 'desktop') return { ok: true as const }
    const { error } = await ctx.db
      .from('events')
      .update({ status, error: status === 'failed' ? (note ?? 'failed') : null, finished_at: ctx.now().toISOString() })
      .eq('id', eventId)
    if (error) throw new Error(error.message)
    return { ok: true as const }
  },
})
