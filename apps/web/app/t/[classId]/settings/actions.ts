'use server'

import { revalidatePath } from 'next/cache'
import { newJoinCode, requireTeaches } from '@/lib/data/p21'

const refresh = (classId: string) => revalidatePath(`/t/${classId}`, 'layout')

export async function renameClass(classId: string, name: string): Promise<void> {
  const { admin } = await requireTeaches(classId)
  const clean = name.trim()
  if (!clean) return
  const { error } = await admin.from('classes').update({ name: clean }).eq('id', classId)
  if (error) throw new Error(`could not rename: ${error.message}`)
  refresh(classId)
}

export async function setClassGrade(classId: string, grade: number): Promise<void> {
  const { admin } = await requireTeaches(classId)
  if (![4, 5, 6, 7].includes(grade)) return
  const { error } = await admin.from('classes').update({ grade }).eq('id', classId)
  if (error) throw new Error(`could not change grade: ${error.message}`)
  refresh(classId)
}

/** The old code stops working; approved links are unaffected. */
export async function newClassCode(classId: string): Promise<void> {
  const { admin } = await requireTeaches(classId)
  for (let attempt = 0; attempt < 5; attempt++) {
    const { error } = await admin.from('classes').update({ join_code: newJoinCode() }).eq('id', classId)
    if (!error) return refresh(classId)
    if (error.code !== '23505') throw new Error(`could not make a new code: ${error.message}`)
  }
  throw new Error('could not make a new code')
}

export async function removeParent(classId: string, parentId: string, childId: string): Promise<void> {
  const { admin } = await requireTeaches(classId)
  const { error } = await admin.from('parent_links').delete().eq('class_id', classId).eq('parent_id', parentId).eq('child_id', childId)
  if (error) throw new Error(`could not remove: ${error.message}`)
  refresh(classId)
}

export async function addLearner(classId: string, name: string): Promise<void> {
  const { admin, schoolId } = await requireTeaches(classId)
  const clean = name.trim()
  if (!clean) return
  const { data: cls } = await admin.from('classes').select('grade').eq('id', classId).single()
  const { data: kid, error } = await admin.from('children').insert({ school_id: schoolId, first_name: clean, grade: cls!.grade }).select('id').single()
  if (error) throw new Error(`could not add learner: ${error.message}`)
  const { error: enrolError } = await admin.from('enrolments').insert({ class_id: classId, child_id: kid.id })
  if (enrolError) throw new Error(`could not add learner: ${enrolError.message}`)
  refresh(classId)
}
