import { z } from 'zod'
import { EventSchema } from '../../schemas/events'
import { AI_JOBS, JobNameSchema, jobPlan } from '../../plans'
import { assertInSchool, defineTool } from '../context'

export const getJob = defineTool({
  name: 'get_job',
  description: 'Read the next AI job of an event: the job name, the event type, the ids to work on and the prompt file name.',
  input: z.object({ eventId: z.string() }),
  output: z.object({
    job: JobNameSchema.nullable(),
    eventType: z.string(),
    ids: z.record(z.string(), z.string()),
    promptName: z.string().nullable(),
  }),
  async run(ctx, { eventId }) {
    await assertInSchool(ctx, 'events', [eventId])
    const row = await ctx.db.from('events').select('type, payload').eq('id', eventId).single()
    if (row.error) throw new Error(row.error.message)
    const event = EventSchema.parse({ ...(row.data.payload as object), type: row.data.type })
    const next = (await jobPlan(event, ctx.db)).find((s) => (AI_JOBS as readonly string[]).includes(s.job))
    return { job: next?.job ?? null, eventType: row.data.type, ids: next?.ids ?? {}, promptName: next?.job ?? null }
  },
})
