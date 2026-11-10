'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { JemmaDb } from '@jemma/profiling/db'
import { requireRole } from '@/lib/auth'
import { retryEvent, sendEvent } from '@/lib/agent'
import { recordApproval } from '@/lib/approvals'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { createSupabaseServer } from '@/lib/supabase/server'
import {
  SAMPLE_DOCS,
  addTopicIn,
  moveTopicIn,
  plural,
  readDraft,
  removeTopicIn,
  renameTopicIn,
  saveTopicIn,
  resolveIn,
  toRaw,
  topicCount,
  type TopicEdit,
} from './format'

const SAMPLE_PDF = 'curriculum/grade-6-teaching-plan.pdf'

async function ownClass(classId: string) {
  await requireRole('teacher')
  const supabase = await createSupabaseServer()
  const { data } = await supabase.from('classes').select('id, school_id, name').eq('id', classId).maybeSingle()
  if (!data) throw new Error('Class not found')
  return data
}

async function ownMap(mapId: string) {
  await requireRole('teacher')
  const supabase = await createSupabaseServer()
  const { data } = await supabase.from('curriculum_maps').select('id, class_id, status, draft, created_at').eq('id', mapId).maybeSingle()
  if (!data) throw new Error('Map not found')
  return data
}

/** The event row is saved before it is posted, so an agent that is not reachable leaves it queued and the page keeps its working state. */
async function fire(mapId: string) {
  try {
    await sendEvent('curriculum.uploaded', { mapId })
  } catch (e) {
    if (!/AGENT_URL|agent \/events/.test(e instanceof Error ? e.message : '')) throw e
  }
}

/** The class's draft map (a fresh empty one when there is none), ready for new documents. */
async function draftMapFor(admin: JemmaDb, classId: string): Promise<string> {
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

const pdfPages = (bytes: Uint8Array) => Math.max(1, (new TextDecoder('latin1').decode(bytes).match(/\/Type\s*\/Page[^s]/g) ?? []).length)

/** Photos or files from the teacher; the agent drafts the map from them. */
export async function uploadCurriculum(classId: string, files: File[]): Promise<void> {
  const cls = await ownClass(classId)
  if (files.length === 0) return
  const admin = createSupabaseAdmin()
  const mapId = await draftMapFor(admin, classId)
  const rows: { class_id: string; storage_path: string; title: string; pages: number }[] = []
  for (const [i, file] of files.entries()) {
    const safe = file.name.replace(/[^\w.-]+/g, '_')
    const path = `${cls.school_id}/${classId}/${Date.now()}-${i}-${safe}`
    const bytes = new Uint8Array(await file.arrayBuffer())
    const up = await admin.storage.from('curriculum').upload(path, bytes, { contentType: file.type || 'application/octet-stream' })
    if (up.error) throw new Error(up.error.message)
    rows.push({ class_id: classId, storage_path: path, title: file.name.replace(/\.[^.]+$/, ''), pages: file.type === 'application/pdf' ? pdfPages(bytes) : 1 })
  }
  const ins = await admin.from('curriculum_docs').insert(rows)
  if (ins.error) throw new Error(ins.error.message)
  await fire(mapId)
  revalidatePath(`/t/${classId}/curriculum`)
}

/** Demo only: the two documents the board shows, copied from the sample files. */
export async function useSampleCurriculum(classId: string): Promise<void> {
  const cls = await ownClass(classId)
  const admin = createSupabaseAdmin()
  const school = await admin.from('schools').select('sandbox_id').eq('id', cls.school_id).single()
  if (!school.data?.sandbox_id) throw new Error('The sample curriculum is only for the demo')
  const mapId = await draftMapFor(admin, classId)
  const rows = []
  for (const [i, doc] of SAMPLE_DOCS.entries()) {
    const path = `${cls.school_id}/${classId}/sample-${i + 1}.pdf`
    const copy = await admin.storage.from('sample-papers').copy(SAMPLE_PDF, path, { destinationBucket: 'curriculum' })
    if (copy.error && !/already exists|Duplicate/i.test(copy.error.message)) throw new Error(copy.error.message)
    rows.push({ class_id: classId, storage_path: path, title: doc.title, pages: doc.pages })
  }
  const ins = await admin.from('curriculum_docs').insert(rows)
  if (ins.error) throw new Error(ins.error.message)
  await fire(mapId)
  revalidatePath(`/t/${classId}/curriculum`)
}

/** Re-queues the draft job after a failure. */
export async function retryDraft(mapId: string): Promise<void> {
  const map = await ownMap(mapId)
  const ev = await createSupabaseAdmin().from('events').select('id').eq('type', 'curriculum.uploaded').eq('payload->>mapId', mapId).eq('status', 'failed').order('created_at', { ascending: false }).limit(1)
  const id = ev.data?.[0]?.id
  if (id) await retryEvent(id)
  revalidatePath(`/t/${map.class_id}/curriculum`)
}

/** Reads the draft, applies `edit`, writes it back. Edits are allowed on an approved map too; approving again saves them. */
async function editDraft(mapId: string, edit: (r: NonNullable<ReturnType<typeof readDraft>>) => NonNullable<ReturnType<typeof readDraft>>) {
  const map = await ownMap(mapId)
  const read = readDraft(map.draft)
  if (!read) throw new Error('The draft is not ready yet')
  const next = edit(read)
  const res = await createSupabaseAdmin().from('curriculum_maps').update({ draft: toRaw(next.draft, next.resolutions) as never }).eq('id', mapId)
  if (res.error) throw new Error(res.error.message)
  revalidatePath(`/t/${map.class_id}/curriculum`, 'layout')
}

export async function resolveCheck(mapId: string, topicName: string, option: string): Promise<void> {
  await editDraft(mapId, (r) => resolveIn(r, topicName, option))
}

export async function moveTopic(mapId: string, topicName: string, term: number, position: number): Promise<void> {
  await editDraft(mapId, (r) => ({ ...r, draft: moveTopicIn(r.draft, topicName, term, position) }))
}

export async function renameTopic(mapId: string, from: string, to: string): Promise<void> {
  await editDraft(mapId, (r) => {
    const name = to.trim()
    if (!name || name === from) return r
    const resolutions = { ...r.resolutions }
    if (from in resolutions) {
      resolutions[name] = resolutions[from]!
      delete resolutions[from]
    }
    return { draft: renameTopicIn(r.draft, from, name), resolutions }
  })
}

export async function addTopic(mapId: string, term: number, name: string): Promise<void> {
  await editDraft(mapId, (r) => (name.trim() ? { ...r, draft: addTopicIn(r.draft, term, name.trim()) } : r))
}

/** Laptop topic panel: name, term, place and what it needs, in one save. */
export async function saveTopic(mapId: string, from: string, edit: TopicEdit): Promise<void> {
  await editDraft(mapId, (r) => saveTopicIn(r, from, edit))
}

export async function removeTopic(mapId: string, name: string): Promise<void> {
  await editDraft(mapId, (r) => ({ ...r, draft: removeTopicIn(r.draft, name) }))
}

/** Saves the draft as the class's topics, tags past results to them and closes the Needs you item. */
export async function approveMap(mapId: string): Promise<void> {
  const map = await ownMap(mapId)
  const read = readDraft(map.draft)
  if (!read) throw new Error('The draft is not ready yet')
  const admin = createSupabaseAdmin()
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
  await recordApproval(admin, { schoolId: cls.data.school_id, kind: 'topic_map', refId: mapId, decision: 'approved', userId: (await requireRole('teacher')).userId })

  revalidatePath(`/t/${map.class_id}/curriculum`, 'layout')
  redirect(`/t/${map.class_id}/curriculum`)
}
