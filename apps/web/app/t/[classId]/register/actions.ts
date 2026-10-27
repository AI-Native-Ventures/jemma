'use server'

import { revalidatePath } from 'next/cache'
import type { JemmaDb } from '@jemma/profiling/db'
import { saveAttendance } from '@jemma/profiling/records'
import { requireRole } from '@/lib/auth'
import { createSupabaseServer } from '@/lib/supabase/server'

type Entry = { childId: string; status: 'here' | 'late' | 'away' }

/** Saves one attendance row per child for the day under the teacher's own login (RLS checks they teach each child). */
export async function saveRegister(classId: string, day: string, entries: Entry[]): Promise<{ ok: true } | { ok: false; reason: string }> {
  await requireRole('teacher')
  const supabase = await createSupabaseServer()
  try {
    await saveAttendance(supabase as unknown as JemmaDb, { classId, day, entries })
  } catch {
    return { ok: false, reason: 'Could not save the register. Try again.' }
  }
  revalidatePath(`/t/${classId}/learners`)
  return { ok: true }
}
