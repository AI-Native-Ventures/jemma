'use server'

import { redirect } from 'next/navigation'
import { createSchoolForTeacher, type SchoolOffer } from '@/lib/class-writes'
import { requireTeacher, schoolBlurb } from '@/lib/data/p21'
import { OTHER_SUBJECT, SUBJECTS, validateGrade, validateSubject } from '@/lib/subjects'

export type SchoolHit = { id: string; name: string; blurb: string | null }

/** Schools by name. Demo sandboxes are hidden, except the teacher's own school. */
export async function searchSchools(query: string): Promise<SchoolHit[]> {
  const { admin, schoolId } = await requireTeacher()
  const q = query.trim().replace(/[%,()]/g, '')
  if (q.length < 2) return []
  const { data } = await admin.from('schools').select('id, name, region, grades, sandbox_id').ilike('name', `%${q}%`).limit(8)
  return (data ?? []).filter((s) => !s.sandbox_id || s.id === schoolId).slice(0, 5).map((s) => ({ id: s.id, name: s.name, blurb: schoolBlurb(s) }))
}

/** Where the class form opens: with the grade and the subject the teacher said they teach. */
function classFormPath(grade: number | null, subject: string, other: string): string {
  const query = new URLSearchParams()
  const g = validateGrade(grade)
  if (g.ok) query.set('grade', String(g.grade))
  const s = validateSubject(subject, other)
  if (s.ok) {
    if ((SUBJECTS as readonly string[]).includes(s.subject)) query.set('subject', s.subject)
    else {
      query.set('subject', OTHER_SUBJECT)
      query.set('other', s.subject)
    }
  }
  const text = query.toString()
  return text ? `/t/new?${text}` : '/t/new'
}

export async function saveOnboarding(schoolId: string, grade: number | null, subject: string, other: string): Promise<void> {
  const { admin, userId } = await requireTeacher()
  const { error } = await admin.from('profiles').update({ school_id: schoolId }).eq('user_id', userId)
  if (error) throw new Error(`could not save school: ${error.message}`)
  redirect(classFormPath(grade, subject, other))
}

export type CreateSchoolInput = { name: string; country: string; region: string; grade: number | null; subject: string; other: string }
export type CreateSchoolResult = { error: string; existing?: SchoolOffer }

/** "My school isn't listed": makes the school (no sandbox), links the teacher to it and opens the class form. */
export async function createSchool(input: CreateSchoolInput): Promise<CreateSchoolResult> {
  const { admin, userId } = await requireTeacher()
  const made = await createSchoolForTeacher(admin, { userId, name: input.name, country: input.country, region: input.region })
  if (!made.ok) return { error: made.error, existing: made.existing }
  redirect(classFormPath(input.grade, input.subject, input.other))
}
