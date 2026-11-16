import type { JemmaDb } from '@jemma/profiling/db'
import { isCapsDraft, type MapSource } from '@/lib/map-source'

/**
 * Where the map of the learner's class came from, and the class's grade (P115), for the line "From the CAPS curriculum for Grade 9." and the term
 * headings of "My maths". It reads the classes the learner is in the way `loadLearnerMap` does (with `classId`, that one class only), and says CAPS
 * only when the class has an approved map and every approved map of the classes shown came from the official curriculum. A learner in no class, a
 * class with no approved map, or a read that fails says "not CAPS" and no grade: the screen then keeps its flat list and shows no line.
 */
export async function mapSourceOf(db: JemmaDb, childId: string, classId?: string): Promise<MapSource> {
  const none: MapSource = { caps: false, grade: null }
  const enrolments = await db.from('enrolments').select('class_id').eq('child_id', childId)
  if (enrolments.error) return none
  const classIds = [...new Set((enrolments.data ?? []).map((e) => e.class_id))].filter((id) => !classId || id === classId)
  if (classIds.length === 0) return none
  const [classes, maps] = await Promise.all([
    db.from('classes').select('id, grade').in('id', classIds),
    db.from('curriculum_maps').select('draft').eq('status', 'approved').in('class_id', classIds),
  ])
  if (classes.error || maps.error) return none
  const drafts = maps.data ?? []
  return { caps: drafts.length > 0 && drafts.every((m) => isCapsDraft(m.draft)), grade: classes.data?.[0]?.grade ?? null }
}
