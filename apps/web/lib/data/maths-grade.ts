import { cache } from 'react'
import { createSupabaseServer } from '@/lib/supabase/server'

// P136: the grade a teacher's or a parent's page uses to decide how much of a question is typeset as maths (Grade 8 and up: every line with a sign in it).
// A read that fails, or a row that is not there, says null and the page typesets by the default rule (a line with algebra in it). Read once a request.

/** The grade of a class, or null when it is not known. */
export const getClassGrade = cache(async (classId: string): Promise<number | null> => {
  try {
    const supabase = await createSupabaseServer()
    const { data } = await supabase.from('classes').select('grade').eq('id', classId).maybeSingle()
    return typeof data?.grade === 'number' ? data.grade : null
  } catch {
    return null
  }
})

/** The grade of a learner, or null when it is not known. */
export const getChildGrade = cache(async (childId: string): Promise<number | null> => {
  try {
    const supabase = await createSupabaseServer()
    const { data } = await supabase.from('children').select('grade').eq('id', childId).maybeSingle()
    return typeof data?.grade === 'number' ? data.grade : null
  } catch {
    return null
  }
})
