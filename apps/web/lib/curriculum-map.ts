import type { JemmaDb } from '@jemma/profiling/db'
import { plural, readDraft, topicCount } from '@/app/t/[classId]/curriculum/format'
import { sendEvent } from './agent'
import { recordApproval } from './approvals'

// The parts of a class's topic map that the teacher's curriculum screens and a learner's own curriculum (My own, P97) both use: the draft map a
// document upload writes into, the event that has the agent read it, and the approval that turns the draft into the class's topics. They are
// plain functions that take the service client, so neither the teacher's actions nor the learner's repeat them. Who may call them is checked by
// the caller (the teacher's `ownMap`, the learner's twin check), exactly as before.

/** The class's draft map (a fresh empty one when there is none), ready for new documents. */
export async function draftMapFor(admin: JemmaDb, classId: string): Promise<string> {
  const found = await admin.from('curriculum_maps').select('id').eq('class_id', classId).eq('status', 'draft').order('created_at', { ascending: false }).limit(1)
  const existing = found.data?.[0]
  if (existing) {
    await admin.from('curriculum_maps').update({ draft: {} }).eq('id', existing.id)
    return existing.id
  }
  const made = await admin.from('curriculum_maps').insert({ class_id: classId, status: 'draft' }).select('id').single()
  if (made.error) throw new Error(made.error.message)
  return made.data.id
}

/** The event row is saved before it is posted, so an agent that is not reachable leaves it queued and the page keeps its working state. */
export async function fireCurriculumUploaded(mapId: string): Promise<void> {
  try {
    await sendEvent('curriculum.uploaded', { mapId })
  } catch (e) {
    if (!/AGENT_URL|agent \/events/.test(e instanceof Error ? e.message : '')) throw e
  }
}

/**
 * Saves the draft as the class's topics, tags past results to them, closes the Needs you item and writes who approved it. `userId` is the signed-in
 * person who tapped (the teacher; for a learner's own curriculum the learner or the parent who acts for them). Throws when the draft is not ready.
 */
export async function approveDraftMap(admin: JemmaDb, map: { id: string; class_id: string; draft: unknown }, userId: string): Promise<void> {
  const read = readDraft(map.draft)
  if (!read) throw new Error('The draft is not ready yet')
  const mapId = map.id
  const cls = await admin.from('classes').select('school_id').eq('id', map.class_id).single()
  if (cls.error) throw new Error(cls.error.message)
  const now = new Date().toISOString()

  const ok = <T extends { error: { message: string } | null }>(r: T): T => {
    if (r.error) throw new Error(r.error.message)
    return r
  }
  const existing = ok(await admin.from('topics').select('id, name').eq('map_id', mapId)).data ?? []
  const byName = new Map(existing.map((t) => [t.name, t.id]))
  const wanted = read.draft.terms.flatMap((t) => t.topics.map((x, i) => ({ term: t.term, position: i + 1, ...x })))
  const keep = new Set(wanted.map((w) => w.name))
  const drop = existing.filter((t) => !keep.has(t.name)).map((t) => t.id)
  if (drop.length) ok(await admin.from('topics').delete().in('id', drop))
  await Promise.all(
    wanted.map(async (w) => {
      const fields = { term: w.term, position: w.position, family: w.family, misconceptions: w.misconceptions, short_name: w.shortName ?? null }
      const id = byName.get(w.name)
      if (id) ok(await admin.from('topics').update(fields).eq('id', id))
      else ok(await admin.from('topics').insert({ map_id: mapId, name: w.name, ...fields }))
    }),
  )
  const saved = ok(await admin.from('topics').select('id, name').eq('map_id', mapId)).data ?? []
  const idOf = new Map(saved.map((t) => [t.name, t.id]))
  await Promise.all(
    wanted.map(async (w) => {
      const ids = w.prerequisites.map((p) => idOf.get(p)).filter((x): x is string => Boolean(x))
      ok(await admin.from('topics').update({ prerequisite_ids: ids }).eq('id', idOf.get(w.name)!))
    }),
  )
  ok(await admin.from('curriculum_maps').update({ status: 'approved', approved_at: now }).eq('id', mapId))
  ok(await admin.from('needs_you_items').update({ status: 'done' }).eq('kind', 'approve_map').eq('ref_id', mapId))
  ok(await admin.rpc('retag_results', { map: mapId }))
  ok(await admin.from('activity_log').insert({ school_id: cls.data.school_id, class_id: map.class_id, at: now, tool: 'approve_map', text: `Saved the map you approved: ${plural(topicCount(read.draft), 'topic')}` }))
  await recordApproval(admin, { schoolId: cls.data.school_id, kind: 'topic_map', refId: mapId, decision: 'approved', userId })
}
