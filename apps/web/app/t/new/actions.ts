'use server'

import { redirect } from 'next/navigation'
import type { JemmaDb } from '@jemma/profiling/db'
import { canCopyFrom, ClassWriteError, createClassRecord } from '@/lib/class-writes'
import { requireTeacher } from '@/lib/data/p21'
import { createSupabaseServer } from '@/lib/supabase/server'
import { validateClass } from '@/lib/subjects'

export type CreateClassResult = { error: string }

export type CreateClassInput = {
  name: string
  grade: number
  /** Mathematics for now. Any subject that is not enabled is refused, also `Other` with a typed name in `otherSubject`. */
  subject: string
  otherSubject?: string
  code: string
  /** Learners who are new to the school. The surname is optional. */
  learners: { firstName: string; lastName?: string }[]
  /** A class of this school the teacher can see: all its learners are enrolled here too. */
  copyFromClassId?: string | null
}

/** Makes the class, its learners and their enrolments, then opens the empty-class screen. */
export async function createClass(input: CreateClassInput): Promise<CreateClassResult> {
  const { admin, userId, schoolId } = await requireTeacher()
  if (!schoolId) redirect('/t/onboarding')
  const checked = validateClass(input)
  if (!checked.ok) return { error: checked.error }

  let copyFromClassId: string | null = null
  if (input.copyFromClassId) {
    const teacher = (await createSupabaseServer()) as unknown as JemmaDb
    if (!(await canCopyFrom(teacher, schoolId, input.copyFromClassId))) return { error: 'Pick one of your own classes to copy the learners from' }
    copyFromClassId = input.copyFromClassId
  }

  let classId: string
  try {
    classId = (await createClassRecord(admin, { userId, schoolId, ...checked.value, code: input.code, learners: input.learners, copyFromClassId })).classId
  } catch (e) {
    if (e instanceof ClassWriteError) return { error: e.message }
    throw e
  }
  redirect(`/t/new/${classId}`)
}
