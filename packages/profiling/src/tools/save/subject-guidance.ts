import { z } from 'zod'
import { labelsRefused, leaveOutLabels, type LabelCheck } from '../../logic/no-labels'
import { GuidanceSchema } from '../../schemas/guidance'
import { LabelDropSchema, type LabelDrop } from '../../schemas/no-labels'
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
export type GuidanceDraft = z.infer<typeof GuidanceDraftSchema>

/**
 * "A profile, never a label": the words of a guidance card pass the word check before anything is saved. No database.
 * A sentence with a label, a ranking or career talk is left out and the rest is kept, as `save_long_view` leaves out a pattern.
 * A focus item with nothing left of its title or its reason goes. A headline or a line about what comes next with nothing left refuses the card.
 * `check.people` are the learner's first name (Clever, Bright and Smart are first names) and `check.exempt` the topics of the learner's marks.
 */
export function screenGuidance(guidance: GuidanceDraft, check: LabelCheck = {}): { guidance: GuidanceDraft; dropped: LabelDrop[] } {
  const dropped: LabelDrop[] = []
  const read = (text: string, field: string) => {
    const kept = leaveOutLabels(text, field, check)
    dropped.push(...kept.dropped)
    return kept
  }
  const required = (text: string, field: string, what: string) => {
    const kept = read(text, field)
    if (text.trim() && !kept.text) throw labelsRefused(what, kept.dropped)
    return kept.text
  }
  const headline = required(guidance.headline, 'headline', 'the headline')
  const focus = guidance.focus.flatMap((item, i) => {
    const title = read(item.title, `focus item ${i + 1} title`)
    const why = read(item.why, `focus item ${i + 1} why`)
    if ((item.title.trim() && !title.text) || (item.why.trim() && !why.text)) {
      dropped.push({ field: `focus item ${i + 1}`, text: item.title.trim(), reason: 'left out whole: nothing was left of its title or its reason' })
      return []
    }
    return [{ ...item, title: title.text, why: why.text }]
  })
  const lookingAhead = required(guidance.lookingAhead, 'lookingAhead', 'the line about what comes next')
  return dropped.length ? { guidance: { ...guidance, headline, focus, lookingAhead }, dropped } : { guidance, dropped }
}

export const subjectGuidance = defineTool({
  name: 'subject_guidance',
  description:
    "Save a learner's guidance card: headline, what to focus on next with the marked answers that prove each item, and what is coming. Focus items without evidence are dropped.",
  input: z.object({ childId: z.string(), guidance: GuidanceDraftSchema }),
  output: z.object({
    updated: z.literal(true),
    /** What the word check left out (a label, a ranking or career talk). Missing when nothing was left out. */
    dropped: z.array(LabelDropSchema).optional(),
  }),
  async run(ctx, { childId, guidance: draft }) {
    await assertInSchool(ctx, 'children', [childId])
    const own = await contextFor(ctx, 'children', childId)
    const results = await ok(own.db.from('question_results').select('id, topic_name').eq('child_id', childId))
    const child = await ok(own.db.from('children').select('first_name').eq('id', childId).single())
    const { guidance, dropped } = screenGuidance(draft, { people: [child.first_name], exempt: results.map((r) => r.topic_name) })
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

    const since = previous.data?.created_at ?? '1970-01-01T00:00:00Z'
    const newer = await own.db.from('observations').select('id').eq('child_id', childId).gt('created_at', since).limit(1)
    if (newer.error) throw new Error(newer.error.message)
    if (newer.data.length > 0) {
      await logActivity(own, { text: `Used your note on ${child.first_name} in the guidance card`, tool: 'subject_guidance', childId })
    }
    return dropped.length ? { updated: true as const, dropped } : { updated: true as const }
  },
})
