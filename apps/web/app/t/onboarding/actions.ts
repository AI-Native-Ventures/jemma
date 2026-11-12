'use server'

import { redirect } from 'next/navigation'
import { createSchoolForTeacher, type SchoolOffer } from '@/lib/class-writes'
import { requireTeacher, schoolBlurb } from '@/lib/data/p21'
import { validateGrade, validateSubject } from '@/lib/subjects'

export type SchoolHit = { id: string; name: string; blurb: string | null }

/** Schools by name. Demo sandboxes are hidden, except the teacher's own school. */
export async function searchSchools(query: string): Promise<SchoolHit[]> {
  const { admin, schoolId } = await requireTeacher()
  const q = query.trim().replace(/[%,()]/g, '')
  if (q.length < 2) return []
  const { data } = await admin.from('schools').select('id, name, region, grades, sandbox_id').ilike('name', `%${q}%`).limit(8)
  return (data ?? []).filter((s) => !s.sandbox_id || s.id === schoolId).slice(0, 5).map((s) => ({ id: s.id, name: s.name, blurb: schoolBlurb(s) }))
}

/** Where the class form opens: with the grade of the teacher's first class. The subject is not in the address: the form says it. */
function classFormPath(grade: number | null): string {
  const g = validateGrade(grade)
  return g.ok ? `/t/new?grade=${g.grade}` : '/t/new'
}

export type SaveOnboardingResult = { error: string } | void

/** Links the teacher to the school and opens the class form. A subject that is not enabled is refused first, so a hand-made request links nothing. */
export async function saveOnboarding(schoolId: string, grade: number | null, subject: string, other: string = ''): Promise<SaveOnboardingResult> {
  const { admin, userId } = await requireTeacher()
  const checked = validateSubject(subject, other)
  if (!checked.ok) return { error: checked.error }
  const { error } = await admin.from('profiles').update({ school_id: schoolId }).eq('user_id', userId)
  if (error) throw new Error(`could not save school: ${error.message}`)
  redirect(classFormPath(grade))
}

export type CreateSchoolInput = { name: string; country: string; region: string; grade: number | null; subject: string; other?: string }
export type CreateSchoolResult = { error: string; existing?: SchoolOffer }

/** "My school isn't listed": makes the school (no sandbox), links the teacher to it and opens the class form. */
export async function createSchool(input: CreateSchoolInput): Promise<CreateSchoolResult> {
  const { admin, userId } = await requireTeacher()
  const checked = validateSubject(input.subject, input.other)
  if (!checked.ok) return { error: checked.error }
  const made = await createSchoolForTeacher(admin, { userId, name: input.name, country: input.country, region: input.region })
  if (!made.ok) return { error: made.error, existing: made.existing }
  redirect(classFormPath(input.grade))
}
