'use server'

import { revalidatePath } from 'next/cache'
import type { EventPayload, EventType } from '@jemma/profiling/schemas'
import { sendEvent } from '@/lib/agent'
import { recordApproval } from '@/lib/approvals'
import { requireRole } from '@/lib/auth'
import { asKind, getReadAnswers, getSnapPaper, SNAP_KINDS } from '@/lib/data/p32'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { createSupabaseServer } from '@/lib/supabase/server'

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; message: string }

const fail = (message: string): { ok: false; message: string } => ({ ok: false, message })

const MAX_PAGES = 4
const MAX_BYTES = 4_000_000

/** Hands an event to the agent. The row is saved first, so a missed post leaves a queued event, not a lost one. */
async function notifyAgent<T extends EventType>(type: T, payload: EventPayload<T>): Promise<void> {
  try {
    await sendEvent(type, payload)
  } catch (e) {
    console.error(`snap: could not post ${type} to the agent`, e instanceof Error ? e.message : e)
  }
}

const extOf = (file: File) => (file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg')

/** The signed-in parent, and proof (through RLS) that the child is theirs. */
async function parentOfChild(childId: string) {
  const { userId } = await requireRole('parent')
  const supabase = await createSupabaseServer()
  const { data: child } = await supabase.from('children').select('id, school_id').eq('id', childId).maybeSingle()
  if (!child) throw new Error('That child is not yours.')
  return { userId, schoolId: child.school_id, admin: createSupabaseAdmin() }
}

/** Saves the photos of one snap as a new paper and asks Jemma to read it. The parent confirms before anything else is saved. */
export async function snapHomework(childId: string, kind: string, subject: string, files: File[]): Promise<ActionResult<{ paperId: string }>> {
  try {
    const { admin, schoolId } = await parentOfChild(childId)
    if (subject !== 'Mathematics') return fail('Only Mathematics for now.')
    if (!SNAP_KINDS.includes(kind as never)) return fail('Choose what you are snapping.')
    const photos = files.filter((f) => f instanceof File && f.size > 0)
    if (photos.length === 0) return fail('Take a photo first.')
    if (photos.length > MAX_PAGES) return fail(`Up to ${MAX_PAGES} pages at a time.`)
    if (photos.some((f) => !f.type.startsWith('image/') || f.size > MAX_BYTES)) return fail('Those photos are too big. Try again.')

    const paper = await admin
      .from('papers')
      .insert({ child_id: childId, owner: 'parent', kind: asKind(kind), status: 'queued' })
      .select('id')
      .single()
    if (paper.error) return fail(paper.error.message)
    const paperId = paper.data.id
    for (const [i, file] of photos.entries()) {
      const path = `${schoolId}/${paperId}/${i + 1}.${extOf(file)}`
      const up = await admin.storage.from('papers').upload(path, file, { upsert: true, contentType: file.type })
      if (up.error) return fail(`Could not save the photo: ${up.error.message}`)
      const ins = await admin.from('paper_pages').insert({ paper_id: paperId, page_no: i + 1, storage_path: path })
      if (ins.error) return fail(ins.error.message)
    }
    await notifyAgent('homework.snapped', { paperId })
    revalidatePath(`/p/${childId}/snap/${paperId}`)
    return { ok: true, paperId }
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not save the photo.')
  }
}

/**
 * The parent's check: `edits` are answers they corrected, `confirmed` are unsure answers they said are right.
 * Only now is the scan saved (paper marked, Needs you item done), then Jemma diagnoses it.
 */
export async function confirmScan(
  childId: string,
  paperId: string,
  edits: Record<number, string>,
  confirmed: number[] = [],
): Promise<ActionResult> {
  try {
    const { admin, userId, schoolId } = await parentOfChild(childId)
    const paper = await getSnapPaper(childId, paperId)
    if (!paper) return fail('That snap is not yours.')
    if (paper.status !== 'needs_you') return fail('That snap is not waiting for you.')
    const rows = await getReadAnswers(paperId)
    for (const row of rows) {
      const fixed = edits[row.n]?.trim()
      const sure = confirmed.includes(row.n)
      if (!fixed && !sure) continue
      const patch = fixed && fixed !== row.answer_read
        ? { answer_read: fixed, previous_answer: row.answer_read, changed_by: userId, read_confidence: 1 }
        : { changed_by: userId, read_confidence: 1 }
      const upd = await admin.from('question_results').update(patch).eq('id', row.id)
      if (upd.error) return fail(upd.error.message)
    }
    const done = await admin.from('papers').update({ status: 'marked', error: null }).eq('id', paperId)
    if (done.error) return fail(done.error.message)
    await admin.from('needs_you_items').update({ status: 'done' }).eq('ref_id', paperId).eq('kind', 'confirm_scan')
    await recordApproval(admin, { schoolId, kind: 'homework_scan', refId: paperId, childId, decision: 'confirmed', userId })
    await notifyAgent('homework.snapped', { paperId })
    revalidatePath(`/p/${childId}`)
    return { ok: true }
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not save.')
  }
}
