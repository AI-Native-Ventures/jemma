import type { JemmaDb } from '@jemma/profiling/db'
import { GuidanceSchema } from '@jemma/profiling/schemas'
import type { GuidanceNeed } from '@/components/blocks/GuidanceNeed'
import { createSupabaseServer } from '../supabase/server'

// The guidance cards Jemma wrote that wait for the teacher of the class: one Needs you item for each learner. Read with the teacher's own session,
// so row level security decides what they see (`guidance_drafts` is readable by the child's teachers only).

/**
 * The drafts of the learners of a class, as Needs you items, by first name. A draft that is not a well formed card is left out: it could not be
 * sent either. A database that does not have the table yet answers nothing, and the class home shows no item.
 */
export async function getGuidanceNeeds(classId: string, client?: JemmaDb): Promise<GuidanceNeed[]> {
  const supabase = client ?? ((await createSupabaseServer()) as unknown as JemmaDb)
  const { data: enrolled } = await supabase.from('enrolments').select('child_id').eq('class_id', classId)
  const ids = (enrolled ?? []).map((e) => e.child_id)
  if (ids.length === 0) return []
  const [drafts, kids] = await Promise.all([
    supabase.from('guidance_drafts').select('child_id, content').in('child_id', ids),
    supabase.from('children').select('id, first_name').in('id', ids),
  ])
  const names = new Map((kids.data ?? []).map((k) => [k.id, k.first_name]))
  return (drafts.data ?? [])
    .flatMap((d) => {
      const card = GuidanceSchema.safeParse(d.content)
      const firstName = names.get(d.child_id)
      if (!card.success || !firstName) return []
      const need: GuidanceNeed = {
        classId,
        childId: d.child_id,
        firstName,
        headline: card.data.headline,
        focus: card.data.focus.map(({ title, why }) => ({ title, why })),
        lookingAhead: card.data.lookingAhead,
      }
      return [need]
    })
    .sort((a, b) => a.firstName.localeCompare(b.firstName) || a.childId.localeCompare(b.childId))
}
