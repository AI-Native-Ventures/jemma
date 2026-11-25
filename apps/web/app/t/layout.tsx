import type { ReactNode } from 'react'
import { UsWords } from '@/components/UsWords'
import { createSupabaseServer } from '@/lib/supabase/server'
import { usForTeacher } from '@/lib/us-words-on'

/**
 * P164: the teacher's space. It only decides the words: a school in the US reads US English ("math", "practice"). Every page draws its own frame,
 * as before.
 */
export default async function TeacherSpaceLayout({ children }: { children: ReactNode }) {
  const supabase = await createSupabaseServer()
  const { data: auth } = await supabase.auth.getUser()
  const us = auth.user ? await usForTeacher(auth.user.id) : false
  return (
    <>
      {us ? <UsWords /> : null}
      {children}
    </>
  )
}
