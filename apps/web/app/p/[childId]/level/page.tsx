import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { firstToLearn } from '@jemma/profiling/logic'
import { latestDoneLevelCheck, levelDateText, ownSpaceOf, resultsOf } from '@/lib/data/level'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { createSupabaseServer } from '@/lib/supabase/server'
import { answerText } from '@/app/k/session/[sessionId]/logic'
import { LevelResult, type LevelAnswerRow } from './_parts/LevelResult'

export const metadata: Metadata = { title: 'Level check' }
export const dynamic = 'force-dynamic'

/**
 * P163: what a child's level check found, for a parent (board "Level check result"). The parent's own client decides whether this parent sees the
 * child (row-level security); the check of the child's own space is then read with the service role. No finished check: a page that is not found.
 */
export default async function LevelResultPage({ params }: { params: Promise<{ childId: string }> }) {
  const { childId } = await params
  const supabase = await createSupabaseServer()
  const { data: child } = await supabase.from('children').select('id, first_name, private_of').eq('id', childId).maybeSingle()
  if (!child || child.private_of) notFound()
  const admin = createSupabaseAdmin()
  const own = await ownSpaceOf(admin, childId)
  const check = own ? await latestDoneLevelCheck(admin, own) : null
  if (!own || !check) notFound()

  const results = resultsOf(check)
  const answers: LevelAnswerRow[] = check.answers.map((a) => {
    const item = check.questions[a.n - 1]
    return {
      n: a.n,
      topicName: item?.topicName ?? '',
      prompt: item?.question.prompt ?? '',
      answer: item ? answerText(item.question, a.answer) : a.answer,
      correct: a.correct,
      skipped: a.skipped,
    }
  })
  const minutes =
    check.startedAt && check.finishedAt ? Math.max(1, Math.round((Date.parse(check.finishedAt) - Date.parse(check.startedAt)) / 60000)) : null
  // The first lesson: the topic to learn first, and whether Jemma has written a practice of it since the check.
  const first = firstToLearn(results)
  let next: { topicName: string; ready: boolean } | null = null
  if (first) {
    const { data: sessions } = await admin
      .from('sessions')
      .select('id')
      .eq('child_id', own)
      .eq('topic_name', first.topicName)
      .gte('created_at', check.finishedAt ?? check.createdAt)
      .limit(1)
    next = { topicName: first.topicName, ready: (sessions ?? []).length > 0 }
  }

  return <LevelResult name={child.first_name} dateText={levelDateText(check.finishedAt)} minutes={minutes} results={results} answers={answers} next={next} />
}
