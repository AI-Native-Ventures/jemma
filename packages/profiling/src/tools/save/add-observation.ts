import { z } from 'zod'
import { insertObservation } from '../../records'
import { assertInSchool, contextFor, defineTool, logActivity } from '../context'
import { defaultAuthor } from './people'

export const addObservation = defineTool({
  name: 'add_observation',
  description: "Save a teacher's note about a learner: participation, confidence, effort or behaviour.",
  input: z.object({
    childId: z.string(),
    kind: z.enum(['participation', 'confidence', 'effort', 'behaviour']),
    text: z.string(),
    authorId: z.string().optional(),
  }),
  output: z.object({ observationId: z.string() }),
  async run(ctx, { childId, kind, text, authorId }) {
    await assertInSchool(ctx, 'children', [childId])
    const own = await contextFor(ctx, 'children', childId)
    const observationId = await insertObservation(own.db, { childId, authorId: authorId ?? (await defaultAuthor(own, childId, 'teacher')), kind, text })
    await logActivity(own, { text: 'Saved a note', tool: 'add_observation', childId })
    return { observationId }
  },
})
