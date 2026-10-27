import { z } from 'zod'
import { insertActivity } from '../../records'
import { assertInSchool, contextFor, defineTool, logActivity } from '../context'
import { defaultAuthor } from './people'

export const addActivity = defineTool({
  name: 'add_activity',
  description: 'Save an activity a learner does outside lessons (sport, club, music, art), with the days and since when.',
  input: z.object({
    childId: z.string(),
    kind: z.enum(['sport', 'club', 'music', 'art', 'other']),
    name: z.string(),
    place: z.string().optional(),
    days: z.array(z.string()),
    since: z.string(),
    createdBy: z.string().optional(),
  }),
  output: z.object({ activityId: z.string() }),
  async run(ctx, { childId, createdBy, ...rest }) {
    await assertInSchool(ctx, 'children', [childId])
    const own = await contextFor(ctx, 'children', childId)
    const activityId = await insertActivity(own.db, { childId, createdBy: createdBy ?? (await defaultAuthor(own, childId, 'parent')), ...rest })
    await logActivity(own, { text: `Saved the activity ${rest.name}`, tool: 'add_activity', childId })
    return { activityId }
  },
})
