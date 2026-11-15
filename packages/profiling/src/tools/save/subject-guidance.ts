import { z } from 'zod'
import { isOwnRecord } from '../../own-class-names'
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

    // A school child's card is a draft: only the child's teachers can read it, and the family sees it after the teacher sends it (it is copied to
    // `guidance_cards`). A learner's own record (a twin, or a child whose school does not use Jemma) has no teacher: its card is written at once.
    const child = await ok(own.db.from('children').select('first_name, school_id, private_of').eq('id', childId).single())
    const school = await ok(own.db.from('schools').select('kind').eq('id', child.school_id).single())
    const target = isOwnRecord({ private_of: child.private_of, schools: { kind: school.kind } }) ? 'guidance_cards' : 'guidance_drafts'

    const [card, draft] = await Promise.all([
      own.db.from('guidance_cards').select('created_at').eq('child_id', childId).maybeSingle(),
      target === 'guidance_drafts' ? own.db.from('guidance_drafts').select('created_at').eq('child_id', childId).maybeSingle() : Promise.resolve(null),
    ])
    if (card.error) throw new Error(card.error.message)
    if (draft?.error) throw new Error(draft.error.message)
    const now = own.now().toISOString()
    // The new row keeps when its own table's row was first made. "Newer notes" count from the first card or draft there was.
    const previous = (target === 'guidance_cards' ? card.data : draft?.data)?.created_at
    const { error } = await own.db
      .from(target)
      .upsert({ child_id: childId, content, created_at: previous ?? now, updated_at: now }, { onConflict: 'child_id' })
    if (error) throw new Error(`${target} write failed: ${error.message}`)

    const since = card.data?.created_at ?? draft?.data?.created_at ?? '1970-01-01T00:00:00Z'
    const newer = await own.db.from('observations').select('id').eq('child_id', childId).gt('created_at', since).limit(1)
    if (newer.error) throw new Error(newer.error.message)
    if (newer.data.length > 0) {
      await logActivity(own, { text: `Used your note on ${child.first_name} in the guidance card`, tool: 'subject_guidance', childId })
    }
    return { updated: true as const }
  },
})
