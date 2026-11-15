'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { capsDraft, capsSource } from '@jemma/profiling/caps'
import { isApprovalNotSaved } from '@/lib/approvals'
import { requireRole } from '@/lib/auth'
import { approveDraftMap, draftMapFor, fireCurriculumUploaded } from '@/lib/curriculum-map'
import { retryEvent } from '@/lib/agent'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { createSupabaseServer } from '@/lib/supabase/server'
import { checkDocument, sizeProblem } from './upload-checks'
import {
  CAPS_HAS_MAP,
  SAMPLE_DOCS,
  SAMPLE_ONLY_FOR,
  addTopicIn,
  capsRefusal,
  moveTopicIn,
  plural,
  readDraft,
  removeTopicIn,
  renameTopicIn,
  saveTopicIn,
  resolveIn,
  sampleCurriculumFits,
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

export type UploadResult = { ok: true } | { ok: false; message: string }

/**
 * Photos or files from the teacher; the agent drafts the map from them. A PDF, JPG or PNG (read from the first bytes), at most
 * 10 MB and 40 pages a document. A refusal is returned, not thrown: a thrown error reaches the browser as a blank "something
 * went wrong", and the teacher needs to read the limit. Nothing is stored unless every document passes.
 */
export async function uploadCurriculum(classId: string, files: File[]): Promise<UploadResult> {
  const cls = await ownClass(classId)
  if (files.length === 0) return { ok: true }
  const tooBig = sizeProblem(files)
  if (tooBig) return { ok: false, message: tooBig }
  const checked: { file: File; bytes: Uint8Array; mimeType: string; pages: number }[] = []
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const check = await checkDocument(file.name, bytes)
    if (!check.ok) return { ok: false, message: check.message }
    checked.push({ file, bytes, mimeType: check.mimeType, pages: check.pages })
  }
  const admin = createSupabaseAdmin()
  const mapId = await draftMapFor(admin, classId)
  const rows: { class_id: string; storage_path: string; title: string; pages: number }[] = []
  for (const [i, { file, bytes, mimeType, pages }] of checked.entries()) {
    const safe = file.name.replace(/[^\w.-]+/g, '_')
    const path = `${cls.school_id}/${classId}/${Date.now()}-${i}-${safe}`
    const up = await admin.storage.from('curriculum').upload(path, bytes, { contentType: mimeType })
    if (up.error) throw new Error(up.error.message)
    rows.push({ class_id: classId, storage_path: path, title: file.name.replace(/\.[^.]+$/, ''), pages })
  }
  const ins = await admin.from('curriculum_docs').insert(rows)
  if (ins.error) throw new Error(ins.error.message)
  await fireCurriculumUploaded(mapId)
  revalidatePath(`/t/${classId}/curriculum`)
  return { ok: true }
}

/** Demo only, and only for a Grade 6 Mathematics class: the two documents the board shows, copied from the sample files. */
export async function useSampleCurriculum(classId: string): Promise<void> {
  const cls = await ownClass(classId)
  const admin = createSupabaseAdmin()
  const school = await admin.from('schools').select('sandbox_id').eq('id', cls.school_id).single()
  if (!school.data?.sandbox_id) throw new Error('The sample curriculum is only for the demo')
  const taught = await admin.from('classes').select('subject, grade').eq('id', classId).single()
  if (!taught.data || !sampleCurriculumFits(taught.data.subject, taught.data.grade)) throw new Error(SAMPLE_ONLY_FOR)
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
  await fireCurriculumUploaded(mapId)
  revalidatePath(`/t/${classId}/curriculum`)
}

export type CapsResult = { ok: true } | { ok: false; message: string }

/**
 * "Start from the CAPS map": the official South African Mathematics topics of the class's grade become its draft map. No document, no
 * event and no model: the topics come from the files in the repository. The teacher checks and approves the map as before. A refusal is
 * returned, not thrown, so the teacher can read it. A class that already has an approved map is left alone.
 */
export async function useCapsMap(classId: string): Promise<CapsResult> {
  const cls = await ownClass(classId)
  const admin = createSupabaseAdmin()
  const [taught, school] = await Promise.all([
    admin.from('classes').select('subject, grade').eq('id', classId).single(),
    admin.from('schools').select('country').eq('id', cls.school_id).single(),
  ])
  if (!taught.data || !school.data) throw new Error('Class not found')
  const { subject, grade } = taught.data
  const refusal = capsRefusal(subject, school.data.country, grade)
  if (refusal) return { ok: false, message: refusal }
  const draft = capsDraft(grade)
  const source = capsSource(grade)
  if (!draft || !source) return { ok: false, message: capsRefusal(subject, school.data.country, 0)! }

  const approved = await admin.from('curriculum_maps').select('id').eq('class_id', classId).eq('status', 'approved').limit(1)
  if ((approved.data?.length ?? 0) > 0) return { ok: false, message: CAPS_HAS_MAP }

  const mapId = await draftMapFor(admin, classId)
  const saved = await admin.from('curriculum_maps').update({ draft: toRaw(draft, {}, { kind: 'caps', ...source }) as never }).eq('id', mapId).eq('status', 'draft')
  if (saved.error) throw new Error(saved.error.message)
  const logged = await admin.from('activity_log').insert({
    school_id: cls.school_id,
    class_id: classId,
    at: new Date().toISOString(),
    tool: 'use_caps_map',
    text: `Loaded the CAPS map for Grade ${grade}: ${plural(topicCount(draft), 'topic')}`,
  })
  if (logged.error) throw new Error(logged.error.message)
  revalidatePath(`/t/${classId}/curriculum`, 'layout')
  return { ok: true }
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
  // The source of a draft (the official curriculum) stays with it through every edit.
  const res = await createSupabaseAdmin().from('curriculum_maps').update({ draft: toRaw(next.draft, next.resolutions, read.source) as never }).eq('id', mapId)
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

/**
 * Saves the draft as the class's topics, tags past results to them and closes the Needs you item (the work is in `approveDraftMap`, which a learner's own curriculum uses too).
 * The approval is saved first. When it cannot be saved nothing changes and the answer is the one plain line for the screen to show; on success the teacher is sent on.
 */
export async function approveMap(mapId: string): Promise<{ ok: false; message: string }> {
  const map = await ownMap(mapId)
  try {
    await approveDraftMap(createSupabaseAdmin(), map, (await requireRole('teacher')).userId)
  } catch (e) {
    if (isApprovalNotSaved(e)) return { ok: false, message: e.message }
    throw e
  }
  revalidatePath(`/t/${map.class_id}/curriculum`, 'layout')
  redirect(`/t/${map.class_id}/curriculum`)
}
