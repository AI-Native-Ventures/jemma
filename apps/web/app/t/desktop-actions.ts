'use server'

import { runInCloud } from '@jemma/profiling/orchestrator'
import { post } from '@/lib/agent'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { createSupabaseServer } from '@/lib/supabase/server'

/** The signed-in user's school, from their profile or the first class they teach. */
async function mySchool(): Promise<string> {
  const supabase = await createSupabaseServer()
  const { data } = await supabase.auth.getUser()
  if (!data.user) throw new Error('Sign in first')
  const { data: profile } = await supabase.from('profiles').select('school_id').eq('user_id', data.user.id).maybeSingle()
  if (profile?.school_id) return profile.school_id
  const { data: cls } = await supabase.from('classes').select('school_id').eq('teacher_id', data.user.id).limit(1)
  if (!cls?.[0]) throw new Error('No school')
  return cls[0].school_id
}

/** "Run in the cloud this time": waiting desktop jobs of the user's school go to the cloud runner. */
export async function runInCloudThisTime(): Promise<{ queued: number }> {
  return runInCloud(createSupabaseAdmin(), await mySchool(), post)
}

/** Which runner this school uses, set from "Where Jemma's AI runs". */
export async function setAiRunner(runner: 'cloud' | 'desktop'): Promise<void> {
  if (runner !== 'cloud' && runner !== 'desktop') throw new Error('Unknown runner')
  const schoolId = await mySchool()
  const { error } = await createSupabaseAdmin().from('schools').update({ ai_runner: runner }).eq('id', schoolId)
  if (error) throw new Error(error.message)
}

/** "Remove" on a paired desktop: forget it, so its heartbeat stops counting. */
export async function removeDesktop(runnerId: string): Promise<void> {
  const supabase = await createSupabaseServer()
  const { error } = await supabase.from('runner_presence').delete().eq('runner_id', runnerId)
  if (error) throw new Error(error.message)
}
