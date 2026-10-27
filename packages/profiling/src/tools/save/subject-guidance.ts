import { z } from 'zod'
import { GuidanceSchema } from '../../schemas/guidance'
import { assertInSchool, contextFor, defineTool, logActivity, ok } from '../context'

/** What a model may hand over: evidence can be missing, and the tool drops what it cannot back up. */
export const GuidanceDraftSchema = GuidanceSchema.extend({
  focus: z.array(
    z.object({
      title: z.string(),
      why: z.string(),
      evidence: z.array(z.object({ label: z.string(), resultIds: z.array(z.string()) })).default([]),
    }),
  ),
})

export const subjectGuidance = defineTool({
  name: 'subject_guidance',
  description:
    "Save a learner's guidance card: headline, what to focus on next with the marked answers that prove each item, and what is coming. Focus items without evidence are dropped.",
  input: z.object({ childId: z.string(), guidance: GuidanceDraftSchema }),
  output: z.object({ updated: z.literal(true) }),
  async run(ctx, { childId, guidance }) {
    await assertInSchool(ctx, 'children', [childId])
    const own = await contextFor(ctx, 'children', childId)
    const results = await ok(own.db.from('question_results').select('id').eq('child_id', childId))
    const real = new Set(results.map((r) => r.id))
    const focus = guidance.focus
      .map((f) => ({
        ...f,
        evidence: f.evidence
          .map((e) => ({ ...e, resultIds: e.resultIds.filter((id) => real.has(id)) }))
          .filter((e) => e.resultIds.length > 0),
      }))
      .filter((f) => f.evidence.length > 0)

    const content = GuidanceSchema.parse({ ...guidance, focus })
    const previous = await own.db.from('guidance_cards').select('created_at').eq('child_id', childId).maybeSingle()
    if (previous.error) throw new Error(previous.error.message)
    const now = own.now().toISOString()
    const { error } = await own.db
      .from('guidance_cards')
      .upsert({ child_id: childId, content, created_at: previous.data?.created_at ?? now, updated_at: now }, { onConflict: 'child_id' })
    if (error) throw new Error(`guidance_cards write failed: ${error.message}`)

    const child = await ok(own.db.from('children').select('first_name').eq('id', childId).single())
    const since = previous.data?.created_at ?? '1970-01-01T00:00:00Z'
    const newer = await own.db.from('observations').select('id').eq('child_id', childId).gt('created_at', since).limit(1)
    if (newer.error) throw new Error(newer.error.message)
    if (newer.data.length > 0) {
      await logActivity(own, { text: `Used your note on ${child.first_name} in her guidance card`, tool: 'subject_guidance', childId })
    }
    return { updated: true as const }
  },
})
