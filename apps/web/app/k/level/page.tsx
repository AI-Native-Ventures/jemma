import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { firstToLearn } from '@jemma/profiling/logic'
import { isOwnRecord } from '@jemma/profiling/own-names'
import { latestLevelCheck, resultsOf } from '@/lib/data/level'
import { myChild } from '@/lib/data/p27'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { LevelTop } from './_parts/LevelScreens'
import { LevelFlow, type LevelFlowProps } from './LevelFlow'
import { questionFor } from './question'

export const metadata: Metadata = { title: 'Find my level' }
export const dynamic = 'force-dynamic'

/**
 * P163: the level check, in the learner's own space only (a school class has the teacher's tests). Where the check is decides the screen: not started,
 * Jemma writing the questions, a write that failed, the next question, or the end.
 */
export default async function LevelPage() {
  const { child } = await myChild()
  if (!isOwnRecord(child)) redirect('/k')
  const admin = createSupabaseAdmin()
  const check = await latestLevelCheck(admin, child.id)
  const base = { firstName: child.first_name, grade: check?.grade ?? child.grade ?? 1 }

  let props: LevelFlowProps = { ...base, state: 'start' }
  if (check?.status === 'done') props = { ...base, state: 'done', first: firstToLearn(resultsOf(check))?.topicName ?? null }
  else if (check?.status === 'failed') props = { ...base, state: 'failed' }
  else if (check?.status === 'writing') {
    // A write that ended failed for good shows as a failure, with Try again; anything else is still being written.
    const { data: event } = check.eventId ? await admin.from('events').select('status').eq('id', check.eventId).maybeSingle() : { data: null }
    props = { ...base, state: event?.status === 'failed' || event?.status === 'cancelled' ? 'failed' : 'writing' }
  } else if (check?.status === 'ready') {
    const question = questionFor(check, check.answers.length + 1)
    props = question ? { ...base, state: 'ready', checkId: check.id, question } : { ...base, state: 'done', first: firstToLearn(resultsOf(check))?.topicName ?? null }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-ground font-sans leading-[normal] lg:mx-auto lg:w-full lg:max-w-[560px]">
      <LevelTop />
      <LevelFlow {...props} />
    </div>
  )
}
