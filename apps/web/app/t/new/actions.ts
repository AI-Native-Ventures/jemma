'use server'

import { redirect } from 'next/navigation'
import { newJoinCode, requireTeacher } from '@/lib/data/p21'

export type CreateClassResult = { error: string }

/** Makes the class, its learners and their enrolments, then opens the empty-class screen. */
export async function createClass(input: { name: string; grade: number; code: string; learners: string[] }): Promise<CreateClassResult> {
  const { admin, userId, schoolId } = await requireTeacher()
  const name = input.name.trim()
  if (!name) return { error: 'Give the class a name' }
  if (!schoolId) redirect('/t/onboarding')
  if (![4, 5, 6, 7].includes(input.grade)) return { error: 'Pick a grade' }

  let code = /^[A-Z0-9]{6}$/.test(input.code) ? input.code : newJoinCode()
  let classId: string | null = null
  for (let attempt = 0; attempt < 5 && !classId; attempt++) {
    const { data, error } = await admin
      .from('classes')
      .insert({ school_id: schoolId, teacher_id: userId, name, grade: input.grade, year: new Date().getUTCFullYear(), subject: 'Mathematics', join_code: code })
      .select('id')
      .single()
    if (data) classId = data.id
    else if (error?.code === '23505') code = newJoinCode()
    else throw new Error(`could not create class: ${error?.message}`)
  }
  if (!classId) throw new Error('could not create class: no free code')

  const names = [...new Set(input.learners.map((n) => n.trim()).filter(Boolean))]
  if (names.length) {
    const { data: kids, error } = await admin
      .from('children')
      .insert(names.map((first_name) => ({ school_id: schoolId, first_name, grade: input.grade })))
      .select('id')
    if (error) throw new Error(`could not add learners: ${error.message}`)
    const { error: enrolError } = await admin.from('enrolments').insert(kids.map((k) => ({ class_id: classId, child_id: k.id })))
    if (enrolError) throw new Error(`could not add learners: ${enrolError.message}`)
  }
  redirect(`/t/new/${classId}`)
}
