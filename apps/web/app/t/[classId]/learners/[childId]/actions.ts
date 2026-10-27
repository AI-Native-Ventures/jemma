'use server'

import { revalidatePath } from 'next/cache'
import type { JemmaDb } from '@jemma/profiling/db'
import { insertObservation } from '@jemma/profiling/records'
import { sendEvent } from '@/lib/agent'
import { requireRole } from '@/lib/auth'
import { createSupabaseServer } from '@/lib/supabase/server'

const KINDS = ['participation', 'confidence', 'effort', 'behaviour'] as const
type Kind = (typeof KINDS)[number]

/** Saves a teacher's quick note under their own login (RLS checks they teach the child), then tells the agent. */
export async function saveNote(childId: string, kind: Kind, text: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { userId } = await requireRole('teacher')
  if (!KINDS.includes(kind)) return { ok: false, reason: 'Pick what the note is about.' }
  if (!text.trim()) return { ok: false, reason: 'Write a note first.' }
  const supabase = await createSupabaseServer()
  try {
    await insertObservation(supabase as unknown as JemmaDb, { childId, authorId: userId, kind, text })
  } catch {
    return { ok: false, reason: 'Could not save the note. Try again.' }
  }
  try {
    await sendEvent('observation.added', { childId })
  } catch (e) {
    // The event row is already recorded by sendEvent before it posts; the note itself is saved.
    console.error('observation.added not delivered', e)
  }
  revalidatePath('/t/[classId]/learners/[childId]', 'page')
  return { ok: true }
}
