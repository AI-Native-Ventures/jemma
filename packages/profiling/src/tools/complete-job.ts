import { z } from 'zod'
import { assertInSchool, defineTool } from './context'

export const completeJob = defineTool({
  name: 'complete_job',
  description: 'Mark an event finished. Call it last, after the save tool, with status done, or failed and a short note.',
  input: z.object({ eventId: z.string(), status: z.enum(['done', 'failed']), note: z.string().optional() }),
  output: z.object({ ok: z.literal(true) }),
  async run(ctx, { eventId, status, note }) {
    await assertInSchool(ctx, 'events', [eventId])
    const { error } = await ctx.db
      .from('events')
      .update({ status, error: status === 'failed' ? (note ?? 'failed') : null, finished_at: ctx.now().toISOString() })
      .eq('id', eventId)
    if (error) throw new Error(error.message)
    return { ok: true as const }
  },
})
