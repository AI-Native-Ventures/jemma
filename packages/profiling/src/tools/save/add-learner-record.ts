import { z } from 'zod'
import { loadClassFacts } from '../../imports'
import { validateOneResult } from '../../logic'
import { assertInSchool, defineTool, logActivity, maybe, ok } from '../context'

export const AddLearnerRecordOutputSchema = z.object({ recordId: z.string(), childId: z.string() })

/**
 * One past result typed by the teacher on the "One result" form. It is a save like the others, logged like the others, and it uses no model.
 * It is not one of the MCP server's tools: the form calls it in the web app's server action, under the signed-in teacher.
 */
export const addLearnerRecord = defineTool({
  name: 'add_learner_record',
  description:
    "Save one past result or note a teacher typed for a learner: a quiz, an assignment, a project or a note. It keeps who added it, but no file. The teacher must teach the class and the learner must be in it.",
  input: z.object({
    childId: z.string(),
    classId: z.string(),
    /** The signed-in teacher: the one who adds the record. Must be the teacher of the class. */
    addedBy: z.string(),
    kind: z.enum(['quiz', 'assignment', 'project', 'note']),
    subject: z.string().optional(),
    grade: z.number(),
    year: z.number(),
    term: z.number(),
    title: z.string().optional(),
    family: z.string().optional(),
    marks: z.number().optional(),
    outOf: z.number().optional(),
    text: z.string().optional(),
    /** The teacher's name at the time of the piece. */
    teacherName: z.string(),
  }),
  output: AddLearnerRecordOutputSchema,
  async run(ctx, input) {
    await assertInSchool(ctx, 'children', [input.childId])
    await assertInSchool(ctx, 'classes', [input.classId])
    const facts = await loadClassFacts(ctx.db, input.classId)
    if (facts.teacherId !== input.addedBy) throw new Error('Only the teacher of this class can add a record.')
    if (!facts.learners.some((l) => l.id === input.childId)) throw new Error('That learner is not in this class.')
    const checked = validateOneResult(input, { subject: facts.subject, year: facts.year, families: facts.families })
    if (!checked.ok) throw new Error(checked.error)
    const profile = await maybe(ctx.db.from('profiles').select('display_name').eq('user_id', input.addedBy).maybeSingle())
    const row = await ok(
      ctx.db
        .from('learner_records')
        .insert({
          ...checked.value,
          school_id: facts.schoolId,
          child_id: input.childId,
          quality: 'clear',
          logged_at: ctx.now().toISOString(),
          added_by: input.addedBy,
          added_by_name: profile?.display_name?.trim() || 'Someone',
        })
        .select('id')
        .single(),
    )
    await logActivity({ ...ctx, schoolId: facts.schoolId }, { text: 'Added one past result to the records', tool: 'add_learner_record', classId: input.classId })
    return { recordId: row.id, childId: input.childId }
  },
})
