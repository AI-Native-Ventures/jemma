'use server'

import { revalidatePath } from 'next/cache'
import type { JemmaDb } from '@jemma/profiling/db'
import { applyImportFix, approveImport, createImport, discardImport, loadClassFacts } from '@jemma/profiling/imports'
import { addLearnerRecord, importLearnerRecords, type ToolContext } from '@jemma/profiling/import-tools'
import { validateOneResult, type Fix, type OneResultInput } from '@jemma/profiling/logic'
import { retryEvent, sendEvent } from '@/lib/agent'
import { requireRole } from '@/lib/auth'
import { requestLongView } from '@/lib/long-view'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { createSupabaseServer } from '@/lib/supabase/server'
import { SAMPLE_RECORDS, type SampleName } from './samples'

// What the teacher does on the "Add past records" screens. Every action checks, with the teacher's own session (row level
// security), that they teach the class before anything is written with the service client.

export type Done<T = object> = ({ ok: true } & T) | { ok: false; reason: string }
const fail = (reason: string): { ok: false; reason: string } => ({ ok: false, reason })

/** Not a model: the tools these actions call never read the replay store. */
const noStore = { get: async () => null, put: async () => undefined }

const NOT_YOURS = 'Only the teacher of this class can add past records.'

/**
 * The class, for its own teacher only. Row level security shows a teacher a colleague's class when they share a learner, so
 * seeing the class is not enough: its `teacher_id` must be the signed-in teacher.
 */
async function teachingClass(classId: string) {
  const { userId } = await requireRole('teacher')
  const supabase = (await createSupabaseServer()) as unknown as JemmaDb
  const { data } = await supabase.from('classes').select('id, school_id, name, teacher_id').eq('id', classId).maybeSingle()
  if (!data) return { refused: 'That class was not found.' }
  if (data.teacher_id !== userId) return { refused: NOT_YOURS }
  return { userId, cls: data, supabase }
}

async function ownImport(importId: string) {
  const { userId } = await requireRole('teacher')
  const supabase = (await createSupabaseServer()) as unknown as JemmaDb
  const { data } = await supabase.from('record_imports').select('id, class_id, school_id, status').eq('id', importId).maybeSingle()
  return data ? { userId, row: data } : null
}

/** The file is saved and the import made first. Asking the agent to read it can fail, and then the screen says so and offers to try again. */
async function start(classId: string, fileName: string, text: string): Promise<Done<{ importId: string }>> {
  const own = await teachingClass(classId)
  if (own.refused !== undefined) return fail(own.refused)
  const admin = createSupabaseAdmin()
  const made = await createImport(admin, { schoolId: own.cls.school_id, classId, userId: own.userId, fileName, text })
  if (!made.ok) return fail(made.error)
  try {
    await sendEvent('records.uploaded', { importId: made.importId })
  } catch (e) {
    console.error('records.uploaded not delivered', e)
    await admin.from('record_imports').update({ status: 'failed' }).eq('id', made.importId).eq('status', 'drafting')
  }
  revalidatePath(`/t/${classId}/learners/records`)
  return { ok: true, importId: made.importId }
}

/** A .csv file the teacher chose. The browser reads the text and sends it with the file name. */
export async function uploadRecords(classId: string, fileName: string, text: string): Promise<Done<{ importId: string }>> {
  return start(classId, fileName, text)
}

/** A table the teacher pasted: tabs (from a spreadsheet) or commas. */
export async function pasteRecords(classId: string, text: string): Promise<Done<{ importId: string }>> {
  return start(classId, 'Pasted table', text)
}

/** Demo school only: one of the two sample files of `fixtures/records`, as if it was uploaded. */
export async function startSampleRecords(classId: string, which: SampleName): Promise<Done<{ importId: string }>> {
  const own = await teachingClass(classId)
  if (own.refused !== undefined) return fail(own.refused)
  const sample = SAMPLE_RECORDS[which]
  if (!sample) return fail('That sample file was not found.')
  const school = await createSupabaseAdmin().from('schools').select('sandbox_id').eq('id', own.cls.school_id).maybeSingle()
  if (!school.data?.sandbox_id) return fail('The sample files are only for the demo.')
  return start(classId, sample.fileName, sample.text)
}

/** Asks the agent to read a file again after it could not. */
export async function retryRead(importId: string): Promise<Done> {
  const own = await ownImport(importId)
  if (!own) return fail('This file was not found.')
  const admin = createSupabaseAdmin()
  try {
    const found = await admin.from('events').select('id, status').eq('type', 'records.uploaded').eq('payload->>importId', importId).order('created_at', { ascending: false }).limit(1)
    const newest = found.data?.[0]
    await admin.from('record_imports').update({ status: 'drafting' }).eq('id', importId).eq('status', 'failed')
    if (newest?.status === 'failed') await retryEvent(newest.id)
    else await sendEvent('records.uploaded', { importId })
  } catch (e) {
    console.error('records.uploaded not delivered', e)
    await admin.from('record_imports').update({ status: 'failed' }).eq('id', importId).eq('status', 'drafting')
    return fail('Jemma could not be reached. Try again in a minute.')
  }
  revalidatePath(`/t/${own.row.class_id}/learners/records/${importId}`)
  return { ok: true }
}

/** One decision on a row: pick the learner, change the strand, skip it, or keep a repeat. */
export async function fixRow(importId: string, fix: Fix): Promise<Done> {
  const own = await ownImport(importId)
  if (!own) return fail('This file was not found.')
  const done = await applyImportFix(createSupabaseAdmin(), importId, fix)
  if (!done.ok) return done
  revalidatePath(`/t/${own.row.class_id}/learners/records/${importId}`)
  return { ok: true }
}

/**
 * "Add to records". The teacher's yes is saved with their name first (`approveImport`), then the records are written by the tool
 * `import_learner_records`, which refuses without that yes. Then each learner who got a record gets a Long view update.
 */
export async function addToRecords(importId: string): Promise<Done<{ records: number; learners: number }>> {
  const own = await ownImport(importId)
  if (!own) return fail('This file was not found.')
  const admin = createSupabaseAdmin()
  const approved = await approveImport(admin, { importId, userId: own.userId })
  if (!approved.ok) return approved
  const ctx: ToolContext = { db: admin, schoolId: own.row.school_id, eventId: null, env: { replayStore: noStore }, now: () => new Date() }
  let written: Awaited<ReturnType<typeof importLearnerRecords.run>>
  try {
    written = await importLearnerRecords.run(ctx, { importId })
  } catch (e) {
    console.error('import_learner_records failed', e)
    return fail('Your yes is saved, but the records could not be added. Tap Add to records again.')
  }
  const out = 'output' in written ? written.output : written
  await requestLongView(out.childIds)
  revalidatePath(`/t/${own.row.class_id}/learners/records/${importId}`)
  revalidatePath(`/t/${own.row.class_id}`, 'layout')
  return { ok: true, records: out.written + out.alreadyWritten, learners: out.childIds.length }
}

/** "Discard": nothing is added. */
export async function discardRecords(importId: string): Promise<Done> {
  const own = await ownImport(importId)
  if (!own) return fail('This file was not found.')
  const done = await discardImport(createSupabaseAdmin(), importId)
  if (!done.ok) return done
  revalidatePath(`/t/${own.row.class_id}/learners/records`)
  revalidatePath(`/t/${own.row.class_id}`, 'layout')
  return { ok: true }
}

/** The "One result" form. The checks are the same words the form shows (`validateOneResult`). A model is not used. */
export async function addOneResult(classId: string, childId: string, form: OneResultInput): Promise<Done<{ name: string }>> {
  const own = await teachingClass(classId)
  if (own.refused !== undefined) return fail(own.refused)
  const teaches = await own.supabase.rpc('teaches_child', { child: childId })
  if (teaches.error || teaches.data !== true) return fail('Only the class teacher can add a record.')
  const admin = createSupabaseAdmin()
  const facts = await loadClassFacts(admin, classId)
  const learner = facts.learners.find((l) => l.id === childId)
  if (!learner) return fail('That learner is not in this class.')
  const checked = validateOneResult(form, { subject: facts.subject, year: facts.year, families: facts.families })
  if (!checked.ok) return fail(checked.error)
  const v = checked.value
  const ctx: ToolContext = { db: admin, schoolId: own.cls.school_id, eventId: null, env: { replayStore: noStore }, now: () => new Date() }
  try {
    await addLearnerRecord.run(ctx, {
      childId,
      classId,
      addedBy: own.userId,
      kind: v.source as 'quiz' | 'assignment' | 'project' | 'note',
      subject: v.subject ?? undefined,
      grade: v.grade,
      year: v.year,
      term: v.term,
      title: v.title,
      family: v.family ?? undefined,
      marks: v.marks ?? undefined,
      outOf: v.out_of ?? undefined,
      text: v.text ?? undefined,
      teacherName: v.teacher_name,
    })
  } catch (e) {
    console.error('add_learner_record failed', e)
    return fail(e instanceof Error && /^(Only|That|Pick|Type|Give|Write|The marks)/.test(e.message) ? e.message : 'Could not save this result. Try again.')
  }
  await requestLongView([childId])
  revalidatePath(`/t/${classId}/learners`)
  return { ok: true, name: learner.firstName }
}
