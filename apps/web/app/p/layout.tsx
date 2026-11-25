import { headers } from 'next/headers'
import type { ReactNode } from 'react'
import { UsWords } from '@/components/UsWords'
import { createSupabaseServer } from '@/lib/supabase/server'
import { usForParent } from '@/lib/us-words-on'

/**
 * P164: the parent's space. It only decides the words: a family in the US reads US English ("math", "practice"). Every page draws its own frame,
 * as before.
 */
export default async function ParentSpaceLayout({ children }: { children: ReactNode }) {
  const supabase = await createSupabaseServer()
  const { data: auth } = await supabase.auth.getUser()
  const us = auth.user ? await usForParent(auth.user.id, (await headers()).get('cf-ipcountry')) : false
  return (
    <>
      {us ? <UsWords /> : null}
      {children}
    </>
  )
}
