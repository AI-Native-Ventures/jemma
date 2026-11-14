'use server'

import { revalidatePath } from 'next/cache'
import type { JemmaDb } from '@jemma/profiling/db'
import { retryEvent, sendEvent } from '@/lib/agent'
import { myChild } from '@/lib/data/p27'
import { newestOwnTestEvent } from '@/lib/data/own-uploads'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { MAX_PAGE_BYTES, MAX_PAGES, NOT_OWN, ownTestState } from './format'

// What a learner adds in "My own" (P97): the photos of a test they got back marked, and (further down) their own curriculum. Every action here is for
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

/** The private twin of this request, or null for a learner who is in My school. A request from a person who is no learner never gets here (`myChild` stops it). */
async function twinOnly(): Promise<{ id: string } | null> {
  const { child } = await myChild()
  return child.private_of ? { id: child.id } : null
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
