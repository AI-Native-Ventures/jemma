'use server'

import { revalidatePath } from 'next/cache'
import type { JemmaDb } from '@jemma/profiling/db'
import { isCapsClassName } from '@jemma/profiling/own'
import { checkDocument, sizeProblem } from '@/app/t/[classId]/curriculum/upload-checks'
import { readDraft, removeTopicIn, toRaw, topicCount } from '@/app/t/[classId]/curriculum/format'
import { retryEvent, sendEvent } from '@/lib/agent'
import { newJoinCode } from '@/lib/class-writes'
import { approveDraftMap, draftMapFor, fireCurriculumUploaded } from '@/lib/curriculum-map'
import { myChild } from '@/lib/data/p27'
import { newestOwnTestEvent, ownMapOf } from '@/lib/data/own-uploads'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { GRADE_CHOICES, MAX_PAGE_BYTES, MAX_PAGES, NAME_MAX, NOT_OWN, ownTestState } from './format'

// What a learner adds in "My own" (P97): the photos of a test they got back marked, and their own curriculum. Every action here is for
// the private twin only: a learner who is in My school, or a child that is not a twin, is refused in plain words. The pages of a marked test reach
// the server through the learner's upload route (/k/upload, see lib/upload-route.ts), never as the argument of a form action. Nothing here touches
// the school child, its class, its school or the school's record.

export type OwnActionResult = { ok: true } | { ok: false; message: string }
export type SnapOwnTestResult = { ok: true; paperId: string } | { ok: false; message: string }

const NOT_SAVED = 'Could not save your photos. Try again.'
const UNREACHED = 'Jemma could not be reached. Try again in a minute.'
const TEST_NOT_FOUND = 'That test was not found.'

const refuse = (message: string) => ({ ok: false as const, message })
const reasonOf = (e: unknown) => (e instanceof Error ? e.message : String(e))

type Twin = { id: string; supabase: Awaited<ReturnType<typeof myChild>>['supabase'] }

/** The private twin of this request, or null for a learner who is in My school. A request from a person who is no learner never gets here (`myChild` stops it). */
async function twinOnly(): Promise<Twin | null> {
  const { supabase, child } = await myChild()
  return child.private_of ? { id: child.id, supabase } : null
}

/** The person who tapped: the learner, or the parent whose phone it is after a hand-over. The class of an own curriculum and its approval are theirs. */
async function actorOf(twin: Twin): Promise<string> {
  const { data } = await twin.supabase.auth.getUser()
  if (!data.user) throw new Error('Not signed in')
  return data.user.id
}

/** What a stored page is called at its end: the reader tells the model what a file is from its ending, so a png is stored as .png. */
const endingOf = (type: string) => (type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : type === 'image/gif' ? 'gif' : 'jpg')

/** A paper whose event could not be delivered: the paper is given up on, so the screen shows the retry, and an event left queued is closed. */
async function giveUp(admin: JemmaDb, paperId: string, reason: string, since: string): Promise<void> {
  await admin.from('papers').update({ status: 'failed', error: 'read_failed' }).eq('id', paperId)
  await admin
    .from('events')
    .update({ status: 'failed', error: reason, finished_at: new Date().toISOString() })
    .eq('type', 'own_test.snapped')
    .eq('status', 'queued')
    .eq('payload->>paperId', paperId)
    .gte('created_at', since)
}

/**
 * The learner sends the photos of a test they got back marked (1 to 4 pages; reached through the upload route /k/upload, never as a form action).
 * Only the private twin may send. Each page is stored in the private `papers` bucket at `{schoolId}/{twinId}/own-test/{paperId}-{n}.jpg`, the paper is
 * written as the reader expects (no test, the twin's, owner parent, kind test, queued, nothing read yet) with one `paper_pages` row for each page, and
 * `own_test.snapped` is sent. A page that cannot be stored takes the paper and the pages stored so far away again. When Jemma cannot be reached the
 * paper is marked failed (and a queued event closed), and the answer is still ok: the screen of the test shows the retry and no photo is lost.
 */
export async function snapOwnTest(files: File[]): Promise<SnapOwnTestResult> {
  const twin = await twinOnly()
  if (!twin) return refuse(NOT_OWN)

  const photos = files.filter((f) => f instanceof File && f.size > 0)
  if (photos.length === 0) return refuse('Take a photo of each page of the test.')
  if (photos.length > MAX_PAGES) return refuse(`Jemma can read up to ${MAX_PAGES} pages. Send the first ${MAX_PAGES}.`)
  if (photos.some((p) => !p.type.startsWith('image/'))) return refuse('Jemma can only read photos. Take the pages again.')
  if (photos.some((p) => p.size > MAX_PAGE_BYTES)) return refuse('A photo is too big. Take it again.')

  const admin = createSupabaseAdmin()
  const { data: kid, error: kidError } = await admin.from('children').select('school_id').eq('id', twin.id).single()
  if (kidError || !kid) throw new Error('Child not found')

  const made = await admin
    .from('papers')
    .insert({ test_id: null, child_id: twin.id, owner: 'parent', kind: 'test', status: 'queued', name_read: null, total: null, error: null })
    .select('id')
    .single()
  if (made.error || !made.data) {
    console.error(`own test paper not written: ${made.error?.message ?? 'no row'}`)
    return refuse(NOT_SAVED)
  }
  const paperId = made.data.id

  const stored: string[] = []
  const undo = async () => {
    if (stored.length > 0) await admin.storage.from('papers').remove(stored)
    await admin.from('papers').delete().eq('id', paperId)
  }
  for (const [i, photo] of photos.entries()) {
    const path = `${kid.school_id}/${twin.id}/own-test/${paperId}-${i + 1}.${endingOf(photo.type)}`
    const up = await admin.storage.from('papers').upload(path, photo, { upsert: true, contentType: photo.type })
    if (up.error) {
      console.error(`own test page not saved: ${up.error.message}`)
      await undo()
      return refuse(NOT_SAVED)
    }
    stored.push(path)
  }
  const pages = await admin.from('paper_pages').insert(stored.map((storage_path, i) => ({ paper_id: paperId, page_no: i + 1, storage_path })))
  if (pages.error) {
    console.error(`own test pages not written: ${pages.error.message}`)
    await undo()
    return refuse(NOT_SAVED)
  }

  const asked = new Date().toISOString()
  try {
    await sendEvent('own_test.snapped', { childId: twin.id, paperId })
  } catch (e) {
    console.error(`own_test.snapped for ${paperId} not delivered: ${reasonOf(e)}`)
    await giveUp(admin, paperId, reasonOf(e), asked)
  }
  revalidatePath('/k/own')
  return { ok: true, paperId }
}

/**
 * "Take the photos again" on a test Jemma could not read: the same photos are read again. Only for the twin's own test that is failed (its paper is
 * failed, or its newest event failed): the paper goes back to queued with no error, which is what the reader needs (a failed paper plans nothing), and
 * the failed event is put back (or a new event is sent when there is none). A test that is being read or is already marked is left alone. When Jemma
 * cannot be reached the paper is given up on again and the words are plain. Never throws to the screen once the learner is known.
 */
export async function retryOwnTest(paperId: string): Promise<OwnActionResult> {
  const twin = await twinOnly()
  if (!twin) return refuse(NOT_OWN)
  const admin = createSupabaseAdmin()
  const { data: paper } = await admin.from('papers').select('id, child_id, test_id, status').eq('id', paperId).maybeSingle()
  if (!paper || paper.child_id !== twin.id || paper.test_id) return refuse(TEST_NOT_FOUND)

  const newest = await newestOwnTestEvent(admin, paperId)
  if (ownTestState({ paper: paper.status, event: newest?.status ?? null }) !== 'failed') return { ok: true }

  const asked = new Date().toISOString()
  try {
    await admin.from('papers').update({ status: 'queued', error: null }).eq('id', paperId)
    if (newest?.status === 'failed') await retryEvent(newest.id)
    else await sendEvent('own_test.snapped', { childId: twin.id, paperId })
  } catch (e) {
    console.error(`own test ${paperId} not retried: ${reasonOf(e)}`)
    await giveUp(admin, paperId, reasonOf(e), newest ? '1970-01-01T00:00:00.000Z' : asked)
    return refuse(UNREACHED)
  }
  revalidatePath(`/k/own/test/${paperId}`)
  revalidatePath('/k/own')
  return { ok: true }
}

// ---- an own curriculum --------------------------------------------------------------------------------------------------------------------

export type UploadOwnCurriculumResult = { ok: true; mapId: string } | { ok: false; message: string }

const NOT_SAVED_FILES = 'Could not save your files. Try again.'
const NOT_SENT = 'Could not send your curriculum. Try again.'
const NOT_FOUND_CURRICULUM = 'That curriculum was not found.'
const STILL_READING = 'Jemma is still reading your curriculum.'
const ALREADY_DONE = 'This curriculum is already done.'

const isGrade = (grade: unknown): grade is number => typeof grade === 'number' && Number.isInteger(grade) && GRADE_CHOICES.includes(grade)

/**
 * The learner adds their own curriculum (a PDF or photos of the pages; reached through the upload route /k/upload, never as a form action).
 * Only the private twin may add one. A private class is made for it in the personal school: named by the learner, the grade they chose, Mathematics,
 * the person acting as its teacher, the twin enrolled. The documents are checked as the teacher's upload checks them (a PDF, a JPG or a PNG read from
 * the first bytes, at most 10 MB and 40 pages a document), stored under the class and listed, a draft map is made for them (`draftMapFor`, the teacher's
 * own), and `curriculum.uploaded` is sent so Jemma reads them. Nothing is kept when any step fails. Answers the id of the map.
 */
export async function uploadOwnCurriculum(grade: number, name: string, files: File[]): Promise<UploadOwnCurriculumResult> {
  const twin = await twinOnly()
  if (!twin) return refuse(NOT_OWN)
  if (!isGrade(grade)) return refuse('Pick a grade from 1 to 12.')
  const title = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : ''
  if (!title) return refuse('Give your curriculum a name.')
  if (title.length > NAME_MAX) return refuse('Use a shorter name.')
  // The name "Grade {N} (my own)" says which class is the CAPS class of a grade, so an own curriculum may not take it.
  if (isCapsClassName(title)) return refuse('Use another name.')
  const documents = files.filter((f) => f instanceof File)
  if (documents.length === 0) return refuse('Add a file, or take photos of the pages.')
  const tooBig = sizeProblem(documents)
  if (tooBig) return refuse(tooBig)
  const checked: { file: File; bytes: Uint8Array; mimeType: string; pages: number }[] = []
  for (const file of documents) {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const check = await checkDocument(file.name, bytes)
    if (!check.ok) return refuse(check.message)
    checked.push({ file, bytes, mimeType: check.mimeType, pages: check.pages })
  }

  const userId = await actorOf(twin)
  const admin = createSupabaseAdmin()
  const { data: kid, error: kidError } = await admin.from('children').select('school_id').eq('id', twin.id).single()
  if (kidError || !kid) throw new Error('Child not found')

  let classId: string | null = null
  let code = newJoinCode()
  for (let attempt = 0; attempt < 5 && !classId; attempt++) {
    const row = await admin
      .from('classes')
      .insert({ school_id: kid.school_id, teacher_id: userId, name: title, grade, year: new Date().getUTCFullYear(), subject: 'Mathematics', join_code: code })
      .select('id')
      .single()
    if (row.data) classId = row.data.id
    else if (row.error?.code === '23505') code = newJoinCode()
    else {
      console.error(`own curriculum class not made: ${row.error?.message ?? 'no row'}`)
      return refuse(NOT_SAVED_FILES)
    }
  }
  if (!classId) return refuse(NOT_SAVED_FILES)

  const stored: string[] = []
  // The class goes (and with it its enrolment, documents and map), and so do the files stored so far.
  const undo = async () => {
    if (stored.length > 0) await admin.storage.from('curriculum').remove(stored)
    await admin.from('classes').delete().eq('id', classId!)
  }
  let mapId: string
  try {
    const enrolled = await admin.from('enrolments').insert({ class_id: classId, child_id: twin.id })
    if (enrolled.error) throw new Error(enrolled.error.message)
    const rows: { class_id: string; storage_path: string; title: string; pages: number }[] = []
    for (const [i, { file, bytes, mimeType, pages }] of checked.entries()) {
      const safe = file.name.replace(/[^\w.-]+/g, '_')
      const path = `${kid.school_id}/${classId}/${Date.now()}-${i}-${safe}`
      const up = await admin.storage.from('curriculum').upload(path, bytes, { contentType: mimeType })
      if (up.error) throw new Error(up.error.message)
      stored.push(path)
      rows.push({ class_id: classId, storage_path: path, title: file.name.replace(/\.[^.]+$/, ''), pages })
    }
    const ins = await admin.from('curriculum_docs').insert(rows)
    if (ins.error) throw new Error(ins.error.message)
    mapId = await draftMapFor(admin, classId)
  } catch (e) {
    console.error(`own curriculum not saved: ${reasonOf(e)}`)
    await undo()
    return refuse(NOT_SAVED_FILES)
  }
  try {
    await fireCurriculumUploaded(mapId)
  } catch (e) {
    console.error(`curriculum.uploaded for ${mapId} not sent: ${reasonOf(e)}`)
    await undo()
    return refuse(NOT_SENT)
  }
  revalidatePath('/k/own')
  return { ok: true, mapId }
}

/**
 * "Take out" on a topic of the draft of an own curriculum: the topic leaves the draft, and so does every "needs" that pointed at it. Only for a draft of
 * the twin's own that Jemma has written. Never throws to the screen once the learner is known.
 */
export async function removeOwnTopic(mapId: string, topicName: string): Promise<OwnActionResult> {
  const twin = await twinOnly()
  if (!twin) return refuse(NOT_OWN)
  const admin = createSupabaseAdmin()
  const map = await ownMapOf(admin, twin.id, mapId)
  if (!map) return refuse(NOT_FOUND_CURRICULUM)
  const read = readDraft(map.draft)
  if (map.status === 'approved') return refuse(ALREADY_DONE)
  if (!read) return refuse(STILL_READING)
  const saved = await admin.from('curriculum_maps').update({ draft: toRaw(removeTopicIn(read.draft, topicName), read.resolutions, read.source) as never }).eq('id', mapId).eq('status', 'draft')
  if (saved.error) {
    console.error(`topic not taken out of ${mapId}: ${saved.error.message}`)
    return refuse('Could not take that topic out. Try again.')
  }
  revalidatePath(`/k/own/curriculum/${mapId}`)
  return { ok: true }
}

/**
 * "These look right": the draft becomes the topics of the learner's own class (the teacher's own approval, `approveDraftMap`, with the learner or the
 * parent who acts for them as the person who approved it), and past results are tagged to them. Only for a draft of the twin's own that Jemma has
 * written and that still has a topic. A map that is already approved is left alone. Never throws to the screen once the learner is known.
 */
export async function approveOwnCurriculum(mapId: string): Promise<OwnActionResult> {
  const twin = await twinOnly()
  if (!twin) return refuse(NOT_OWN)
  const admin = createSupabaseAdmin()
  const map = await ownMapOf(admin, twin.id, mapId)
  if (!map) return refuse(NOT_FOUND_CURRICULUM)
  if (map.status === 'approved') return { ok: true }
  const read = readDraft(map.draft)
  if (!read) return refuse(STILL_READING)
  if (topicCount(read.draft) === 0) return refuse('Keep at least one topic.')
  try {
    await approveDraftMap(admin, map, await actorOf(twin))
  } catch (e) {
    console.error(`own curriculum ${mapId} not approved: ${reasonOf(e)}`)
    return refuse('Could not save your curriculum. Try again.')
  }
  revalidatePath(`/k/own/curriculum/${mapId}`)
  revalidatePath('/k/own')
  return { ok: true }
}
