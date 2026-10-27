'use server'

import { redirect } from 'next/navigation'
import { requireTeacher, schoolBlurb } from '@/lib/data/p21'

export type SchoolHit = { id: string; name: string; blurb: string }

/** Schools by name. Demo sandboxes are hidden, except the teacher's own school. */
export async function searchSchools(query: string): Promise<SchoolHit[]> {
  const { admin, schoolId } = await requireTeacher()
  const q = query.trim().replace(/[%,()]/g, '')
  if (q.length < 2) return []
  const { data } = await admin.from('schools').select('id, name, country, sandbox_id').ilike('name', `%${q}%`).limit(8)
  return (data ?? []).filter((s) => !s.sandbox_id || s.id === schoolId).slice(0, 5).map((s) => ({ id: s.id, name: s.name, blurb: schoolBlurb(s.country) }))
}

export async function saveOnboarding(schoolId: string, grades: number[]): Promise<void> {
  const { admin, userId } = await requireTeacher()
  const { error } = await admin.from('profiles').update({ school_id: schoolId }).eq('user_id', userId)
  if (error) throw new Error(`could not save school: ${error.message}`)
  const grade = [...grades].sort((a, b) => a - b)[0]
  redirect(grade ? `/t/new?grade=${grade}` : '/t/new')
}
