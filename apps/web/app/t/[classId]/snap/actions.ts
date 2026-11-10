'use server'

import { revalidatePath } from 'next/cache'
import type { JemmaDb } from '@jemma/profiling/db'
import { markAnswer } from '@jemma/profiling/logic'
import { AnswerKeyItemSchema, type AnswerKeyItem, type EventPayload, type EventType } from '@jemma/profiling/schemas'
import { sendEvent } from '@/lib/agent'
import { recordApproval } from '@/lib/approvals'
import { requireRole } from '@/lib/auth'
import { READ_MIN } from '@/lib/data/p31'
import { UPLOAD_PREFIX } from '@/lib/data/p34'
import { shareResults } from '@/lib/share-results'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { createSupabaseServer } from '@/lib/supabase/server'

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; message: string }

const fail = (message: string): { ok: false; message: string } => ({ ok: false, message })

const SAMPLE_BUCKET = 'sample-papers'
const SAMPLE_PAPERS = ['amina', 'thabo', 'lerato', 'sipho', 'naledi'].map((n) => `class-test-1/${n}.png`)

/** The signed-in teacher, and proof (through RLS) that they teach this class. */
async function teacherOfClass(classId: string) {
  const { userId } = await requireRole('teacher')
  const supabase = await createSupabaseServer()
  const { data: cls } = await supabase.from('classes').select('id, school_id').eq('id', classId).maybeSingle()
  if (!cls) throw new Error('That class is not yours.')
  return { userId, schoolId: cls.school_id, supabase, admin: createSupabaseAdmin() }
}

async function ownTest(classId: string, testId: string) {
  const t = await teacherOfClass(classId)
  const { data: test } = await t.supabase.from('tests').select('id, title, out_of').eq('id', testId).eq('class_id', classId).maybeSingle()
  if (!test) throw new Error('That test is not in this class.')
  return { ...t, test }
}

async function ownPaper(classId: string, paperId: string) {
  const t = await teacherOfClass(classId)
  const { data: paper } = await t.supabase.from('papers').select('id, test_id, child_id, status').eq('id', paperId).maybeSingle()
  if (!paper?.test_id) throw new Error('That paper is not in this class.')
  const { data: test } = await t.supabase.from('tests').select('id, title, out_of, class_id').eq('id', paper.test_id).eq('class_id', classId).maybeSingle()
  if (!test) throw new Error('That paper is not in this class.')
  return { ...t, paper, test }
}

/** Hands an event to the agent. The row is saved first, so a missed post leaves a queued event, not a lost one. */
async function notifyAgent<T extends EventType>(type: T, payload: EventPayload<T>): Promise<void> {
  try {
    await sendEvent(type, payload)
  } catch (e) {
    console.error(`snap: could not post ${type} to the agent`, e instanceof Error ? e.message : e)
  }
}

function extOf(file: File): string {
  const fromName = /\.([a-z0-9]{2,5})$/i.exec(file.name)?.[1]?.toLowerCase()
  if (fromName) return fromName
  const t = file.type
  if (t === 'image/jpeg') return 'jpg'
  if (t === 'application/pdf') return 'pdf'
  return t.startsWith('image/') ? t.slice(6) : 'png'
}

function fileOf(form: FormData): File {
  const f = form.get('file')
  if (!(f instanceof File) || f.size === 0) throw new Error('Choose a photo first.')
  return f
}

async function upload(admin: JemmaDb, path: string, file: File): Promise<void> {
  const { error } = await admin.storage.from('papers').upload(path, file, { upsert: true, contentType: file.type || undefined })
  if (error) throw new Error(`Could not save the photo: ${error.message}`)
}

/** `Mon 26 Oct 2026`, `2026-10-26` or anything Date reads. Falls back to today. */
function parseDate(text: string): string {
  const cleaned = text.trim().replace(/^[A-Za-z]{3,9},?\s+(?=\d)/, '')
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(cleaned) ? new Date(`${cleaned}T00:00:00Z`) : new Date(`${cleaned} UTC`)
  return (Number.isNaN(parsed.getTime()) ? new Date() : parsed).toISOString().slice(0, 10)
}

export async function createTest(
  classId: string,
  input: { title: string; writtenOn: string; outOf: number; topicIds: string[] },
): Promise<ActionResult<{ testId: string }>> {
  try {
    const { admin } = await teacherOfClass(classId)
    const title = input.title.trim()
    if (!title) return fail('Give the test a name.')
    if (!Number.isInteger(input.outOf) || input.outOf < 1 || input.outOf > 200) return fail('Out of must be a whole number.')
    const { data, error } = await admin
      .from('tests')
      // A new test is held: parents and the learner see nothing of it until the teacher taps "Share with parents" (`shareTest`).
      .insert({ class_id: classId, title, written_on: parseDate(input.writtenOn), out_of: input.outOf, topic_ids: input.topicIds, held: true })
      .select('id')
      .single()
    if (error) return fail(error.message)
    return { ok: true, testId: data.id }
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not make the test.')
  }
}

/**
 * "Share with parents": one tap per test. The teacher's name and the time are kept, the approved parents are told, and Jemma
 * plans each learner's next lesson. Sharing a test that was already shared answers ok and does nothing more.
 */
export async function shareTest(classId: string, testId: string): Promise<ActionResult<{ shared: boolean }>> {
  try {
    const { userId, supabase, admin } = await teacherOfClass(classId)
    const done = await shareResults({ teacher: supabase as unknown as JemmaDb, admin, userId }, classId, testId)
    if (!done.ok) return fail(done.message)
    revalidatePath(`/t/${classId}`)
    revalidatePath(`/t/${classId}/tests/${testId}`)
    revalidatePath(`/t/${classId}/snap/${testId}/progress`)
    return { ok: true, shared: done.shared }
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not share the results.')
  }
}

/** Saves the memo photo and asks Jemma to read the key from it. */
export async function uploadMemo(classId: string, testId: string, form: FormData): Promise<ActionResult> {
  try {
    const { admin, schoolId } = await ownTest(classId, testId)
    const file = fileOf(form)
    const path = `${schoolId}/${testId}/memo.${extOf(file)}`
    await upload(admin, path, file)
    const { error } = await admin.from('answer_keys').upsert({ test_id: testId, status: 'draft', memo_path: path, approved_at: null })
    if (error) return fail(error.message)
    await notifyAgent('key.snapped', { testId })
    revalidatePath(`/t/${classId}/snap/${testId}/key`)
    return { ok: true }
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not save the memo.')
  }
}

/** No memo: asks Jemma to work the answers out from the questions. */
export async function draftKey(classId: string, testId: string): Promise<ActionResult> {
  try {
    const { admin } = await ownTest(classId, testId)
    const { error } = await admin.from('answer_keys').upsert({ test_id: testId, status: 'draft', approved_at: null })
    if (error) return fail(error.message)
    await notifyAgent('key.snapped', { testId })
    return { ok: true }
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not start the key.')
  }
}

async function loadKey(admin: JemmaDb, testId: string): Promise<{ status: string; items: AnswerKeyItem[] }> {
  const { data, error } = await admin.from('answer_keys').select('status, items').eq('test_id', testId).maybeSingle()
  if (error || !data) throw new Error('This test has no answer key yet.')
  const items = (Array.isArray(data.items) ? data.items : []).flatMap((i) => {
    const p = AnswerKeyItemSchema.safeParse(i)
    return p.success ? [p.data] : []
  })
  return { status: data.status, items }
}

/** The teacher checked or changed one answer on the key: it is now sure, and the note goes. */
export async function confirmKeyItem(classId: string, testId: string, n: number, answer: string): Promise<ActionResult> {
  try {
    const { admin } = await ownTest(classId, testId)
    const text = answer.trim()
    if (!text) return fail('Type the answer.')
    const key = await loadKey(admin, testId)
    if (key.status === 'approved') return fail('This key is already approved.')
    if (!key.items.some((i) => i.n === n)) return fail('No such question.')
    const items = key.items.map((i) => {
      if (i.n !== n) return i
      const { note: _note, ...rest } = i
      return { ...rest, answer: text, confidence: 1 }
    })
    const { error } = await admin.from('answer_keys').update({ items }).eq('test_id', testId)
    if (error) return fail(error.message)
    revalidatePath(`/t/${classId}/snap/${testId}/key`)
    return { ok: true }
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not save the answer.')
  }
}

export async function approveKey(classId: string, testId: string): Promise<ActionResult> {
  try {
    const { admin, schoolId, userId } = await ownTest(classId, testId)
    const key = await loadKey(admin, testId)
    if (key.items.length === 0) return fail('There are no answers to approve yet.')
    const open = key.items.filter((i) => i.confidence < READ_MIN || i.note).map((i) => i.n)
    if (open.length) return fail(`Check question ${open[0]} first.`)
    const { error } = await admin.from('answer_keys').update({ status: 'approved', approved_at: new Date().toISOString() }).eq('test_id', testId)
    if (error) return fail(error.message)
    await admin.from('needs_you_items').update({ status: 'done' }).eq('kind', 'approve_key').eq('ref_id', testId).eq('status', 'open')
    await recordApproval(admin, { schoolId, kind: 'answer_key', refId: testId, decision: 'approved', userId })
    revalidatePath(`/t/${classId}`)
    return { ok: true }
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not approve the key.')
  }
}

/** File name safe for a storage path, keeping its extension. */
function safeName(file: File): string {
  const clean = file.name.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return clean || `scan.${extOf(file)}`
}

async function newPaper(admin: JemmaDb, testId: string, schoolId: string, file: File | { from: string }, via: 'camera' | 'upload' = 'camera'): Promise<string> {
  const { data, error } = await admin.from('papers').insert({ test_id: testId, owner: 'teacher', kind: 'test', status: 'queued' }).select('id').single()
  if (error) throw new Error(error.message)
  const ext = file instanceof File ? extOf(file) : (file.from.split('.').pop() ?? 'png')
  const path = `${schoolId}/${data.id}/${via === 'upload' && file instanceof File ? `${UPLOAD_PREFIX}${safeName(file)}` : `1.${ext}`}`
  if (file instanceof File) await upload(admin, path, file)
  else {
    const copied = await admin.storage.from(SAMPLE_BUCKET).copy(file.from, path, { destinationBucket: 'papers' })
    if (copied.error) throw new Error(`Could not copy the sample paper: ${copied.error.message}`)
  }
  const page = await admin.from('paper_pages').insert({ paper_id: data.id, page_no: 1, storage_path: path })
  if (page.error) throw new Error(page.error.message)
  return data.id
}

/** One photo, one new paper. */
export async function addPaper(classId: string, testId: string, form: FormData): Promise<ActionResult<{ paperId: string }>> {
  try {
    const { admin, schoolId } = await ownTest(classId, testId)
    const paperId = await newPaper(admin, testId, schoolId, fileOf(form))
    await notifyAgent('paper.snapped', { paperId })
    revalidatePath(`/t/${classId}/snap/${testId}/papers`)
    return { ok: true, paperId }
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not save the paper.')
  }
}

/** Laptop upload: every image or PDF chosen becomes one paper. Jemma reads each as it lands. */
export async function uploadScans(classId: string, testId: string, form: FormData): Promise<ActionResult<{ count: number }>> {
  try {
    const { admin, schoolId } = await ownTest(classId, testId)
    const files = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0)
    if (files.length === 0) return fail('Choose a PDF, JPG or PNG first.')
    if (files.some((f) => !(f.type === 'application/pdf' || f.type.startsWith('image/') || /\.(pdf|jpe?g|png|webp|heic)$/i.test(f.name)))) return fail('Only PDF, JPG or PNG files work here.')
    const ids: string[] = []
    for (const file of files) ids.push(await newPaper(admin, testId, schoolId, file, 'upload'))
    for (const paperId of ids) await notifyAgent('paper.snapped', { paperId })
    revalidatePath(`/t/${classId}/snap/${testId}/papers`)
    return { ok: true, count: ids.length }
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not save the files.')
  }
}

/** Another page of a paper already in the pile. Jemma reads the paper again with the new page. */
export async function addPage(classId: string, paperId: string, form: FormData): Promise<ActionResult> {
  try {
    const { admin, schoolId, test } = await ownPaper(classId, paperId)
    const file = fileOf(form)
    const { data: pages } = await admin.from('paper_pages').select('page_no').eq('paper_id', paperId)
    const pageNo = Math.max(0, ...(pages ?? []).map((p) => p.page_no)) + 1
    const path = `${schoolId}/${paperId}/${pageNo}.${extOf(file)}`
    await upload(admin, path, file)
    const ins = await admin.from('paper_pages').insert({ paper_id: paperId, page_no: pageNo, storage_path: path })
    if (ins.error) return fail(ins.error.message)
    await admin.from('papers').update({ status: 'queued', error: null }).eq('id', paperId)
    await notifyAgent('paper.snapped', { paperId })
    revalidatePath(`/t/${classId}/snap/${test.id}/papers`)
    return { ok: true }
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not add the page.')
  }
}

/** Replaces page 1 of a paper with a new photo (blurry or cut off) and reads it again. */
export async function retakePaper(classId: string, paperId: string, form: FormData): Promise<ActionResult> {
  try {
    const { admin, schoolId, test } = await ownPaper(classId, paperId)
    const file = fileOf(form)
    const path = `${schoolId}/${paperId}/1.${extOf(file)}`
    await upload(admin, path, file)
    const upd = await admin.from('paper_pages').update({ storage_path: path }).eq('paper_id', paperId).eq('page_no', 1)
    if (upd.error) return fail(upd.error.message)
    await admin.from('papers').update({ status: 'queued', error: null }).eq('id', paperId)
    await notifyAgent('paper.snapped', { paperId })
    revalidatePath(`/t/${classId}/snap/${test.id}/papers`)
    return { ok: true }
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not retake the photo.')
  }
}

/** "No papers with you?" Copies the five sample papers into the test and queues them. */
export async function useSamplePapers(classId: string, testId: string): Promise<ActionResult<{ count: number }>> {
  try {
    const { admin, schoolId } = await ownTest(classId, testId)
    const ids: string[] = []
    for (const from of SAMPLE_PAPERS) ids.push(await newPaper(admin, testId, schoolId, { from }))
    for (const paperId of ids) await notifyAgent('paper.snapped', { paperId })
    revalidatePath(`/t/${classId}/snap/${testId}/papers`)
    return { ok: true, count: ids.length }
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not add the sample papers.')
  }
}

async function ownItem(classId: string, itemId: string) {
  const t = await teacherOfClass(classId)
  const { data: item } = await t.supabase.from('needs_you_items').select('id, kind, status, ref_id').eq('id', itemId).maybeSingle()
  if (!item) throw new Error('That item is not yours.')
  const paper = await ownPaper(classId, item.ref_id)
  return { ...paper, item }
}

async function retotal(admin: JemmaDb, paperId: string): Promise<number> {
  const { data } = await admin.from('question_results').select('mark').eq('paper_id', paperId)
  const total = (data ?? []).reduce((sum, r) => sum + r.mark, 0)
  await admin.from('papers').update({ total }).eq('id', paperId)
  return total
}

async function keyFor(admin: JemmaDb, testId: string, n: number): Promise<AnswerKeyItem> {
  const key = await loadKey(admin, testId)
  const item = key.items.find((i) => i.n === n)
  if (!item) throw new Error('That question is not on the key.')
  return item
}

/** The teacher says what question `n` says. Code marks it against the key; the model never does. */
export async function resolveAnswer(
  classId: string,
  itemId: string,
  n: number,
  answer: string,
): Promise<ActionResult<{ correct: boolean; mark: number; total: number }>> {
  try {
    const { admin, userId, schoolId, paper, test } = await ownItem(classId, itemId)
    const text = answer.trim()
    if (!text) return fail('Type what it says.')
    const key = await keyFor(admin, test.id, n)
    const { data: row } = await admin.from('question_results').select('id, answer_read, previous_answer, changed_by').eq('paper_id', paper.id).eq('n', n).maybeSingle()
    if (!row) return fail('That question is not on this paper.')
    const { correct } = markAnswer(text, key.answer)
    const mark = correct ? key.marks : 0
    const { error } = await admin
      .from('question_results')
      .update({
        answer_read: text,
        read_confidence: 1,
        correct,
        mark,
        previous_answer: row.changed_by ? row.previous_answer : row.answer_read,
        changed_by: userId,
      })
      .eq('id', row.id)
    if (error) return fail(error.message)
    const total = await retotal(admin, paper.id)
    await recordApproval(admin, { schoolId, kind: 'mark', refId: paper.id, childId: paper.child_id, decision: 'edited', userId })
    revalidatePath(`/t/${classId}/needs-you/${itemId}`)
    return { ok: true, correct, mark, total }
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not save the answer.')
  }
}

/** Paper `itemId` belongs to `childId`. If it was the last unnamed paper and one learner is left, that learner gets it. */
export async function resolveName(classId: string, itemId: string, childId: string): Promise<ActionResult<{ also: string | null }>> {
  try {
    const { admin, supabase, userId, schoolId, paper, test, item } = await ownItem(classId, itemId)
    const { data: enrolled } = await supabase.from('enrolments').select('child_id').eq('class_id', classId).eq('child_id', childId).maybeSingle()
    if (!enrolled) return fail('That learner is not in this class.')

    const assign = async (paperId: string, kid: string, itemRow: string | null) => {
      await admin.from('papers').update({ child_id: kid, status: 'queued', error: null }).eq('id', paperId)
      if (itemRow) await admin.from('needs_you_items').update({ status: 'done' }).eq('id', itemRow)
      await notifyAgent('paper.snapped', { paperId })
    }
    await assign(paper.id, childId, item.id)

    // Elimination: one other unnamed paper and one learner left means that is whose it is.
    const [{ data: others }, { data: roster }, { data: papers }] = await Promise.all([
      admin.from('needs_you_items').select('id, ref_id').eq('kind', 'unreadable_name').eq('status', 'open').neq('id', item.id),
      admin.from('enrolments').select('child_id').eq('class_id', classId),
      admin.from('papers').select('id, child_id').eq('test_id', test.id),
    ])
    const inTest = new Set((papers ?? []).map((p) => p.id))
    const unnamed = (others ?? []).filter((o) => inTest.has(o.ref_id))
    const taken = new Set((papers ?? []).map((p) => p.child_id).filter((c): c is string => !!c))
    const left = (roster ?? []).map((r) => r.child_id).filter((c) => !taken.has(c))
    let also: string | null = null
    if (unnamed.length === 1 && left.length === 1) {
      await assign(unnamed[0]!.ref_id, left[0]!, unnamed[0]!.id)
      const { data: kid } = await admin.from('children').select('first_name').eq('id', left[0]!).single()
      also = kid?.first_name ?? null
    }
    await recordApproval(admin, { schoolId, kind: 'paper_name', refId: paper.id, decision: 'confirmed', userId })
    revalidatePath(`/t/${classId}`)
    return { ok: true, also }
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not save the name.')
  }
}

/** The teacher is happy with the paper: it is marked, the item is done and the agent hears about it. */
export async function confirmPaper(classId: string, paperId: string): Promise<ActionResult> {
  try {
    const { admin, userId, schoolId, paper } = await ownPaper(classId, paperId)
    const { data: rows } = await admin.from('question_results').select('n, answer_read, read_confidence, changed_by').eq('paper_id', paperId)
    const open = (rows ?? []).filter((r) => r.changed_by === null && r.read_confidence < READ_MIN).map((r) => r.n)
    if (open.length) return fail(`Question ${Math.min(...open)} still needs you.`)
    if (!paper.child_id) return fail('Say whose paper this is first.')
    const upd = await admin.from('papers').update({ status: 'marked' }).eq('id', paperId)
    if (upd.error) return fail(upd.error.message)
    await admin.from('needs_you_items').update({ status: 'done' }).eq('ref_id', paperId).eq('status', 'open').in('kind', ['check_answer', 'confirm_scan'])
    await recordApproval(admin, { schoolId, kind: 'paper', refId: paperId, childId: paper.child_id, decision: 'confirmed', userId })
    await notifyAgent('paper.checked', { paperId })
    revalidatePath(`/t/${classId}`)
    return { ok: true }
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not confirm the paper.')
  }
}

/** Teacher fix on a marked paper: what it says, and optionally right or wrong. Parents see the change. */
export async function fixMark(
  classId: string,
  resultId: string,
  answer: string,
  verdict?: 'right' | 'wrong',
): Promise<ActionResult<{ mark: number; total: number }>> {
  try {
    const t = await teacherOfClass(classId)
    const { data: result } = await t.supabase.from('question_results').select('id, paper_id, n, answer_read, previous_answer, changed_by').eq('id', resultId).maybeSingle()
    if (!result) return fail('That answer is not yours.')
    const { paper, test, admin, userId } = await ownPaper(classId, result.paper_id)
    const text = answer.trim()
    if (!text) return fail('Type what it says.')
    const key = await keyFor(admin, test.id, result.n)
    const correct = verdict ? verdict === 'right' : markAnswer(text, key.answer).correct
    const mark = correct ? key.marks : 0
    const { error } = await admin
      .from('question_results')
      .update({
        answer_read: text,
        read_confidence: 1,
        correct,
        mark,
        previous_answer: result.changed_by ? result.previous_answer : result.answer_read,
        changed_by: userId,
      })
      .eq('id', resultId)
    if (error) return fail(error.message)
    const total = await retotal(admin, paper.id)
    await recordApproval(admin, { schoolId: t.schoolId, kind: 'mark', refId: paper.id, childId: paper.child_id, decision: 'edited', userId })
    await notifyAgent('paper.checked', { paperId: paper.id })
    revalidatePath(`/t/${classId}/papers/${paper.id}/fix`)
    return { ok: true, mark, total }
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not save the change.')
  }
}
