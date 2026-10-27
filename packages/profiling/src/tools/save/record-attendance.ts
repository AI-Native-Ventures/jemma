import { z } from 'zod'
import { saveAttendance } from '../../records'
import { assertInSchool, contextFor, defineTool, logActivity } from '../context'

export const recordAttendance = defineTool({
  name: 'record_attendance',
  description: "Save one day's register for a class: here, late or away for each learner.",
  input: z.object({
    classId: z.string(),
    day: z.string(),
    entries: z.array(z.object({ childId: z.string(), status: z.enum(['here', 'late', 'away']) })),
  }),
  output: z.object({ saved: z.number().int() }),
  async run(ctx, input) {
    await assertInSchool(ctx, 'classes', [input.classId])
    const own = await contextFor(ctx, 'classes', input.classId)
    const saved = await saveAttendance(own.db, input)
    await logActivity(own, { text: `Saved the register for ${input.day}`, tool: 'record_attendance', classId: input.classId })
    return { saved }
  },
})
