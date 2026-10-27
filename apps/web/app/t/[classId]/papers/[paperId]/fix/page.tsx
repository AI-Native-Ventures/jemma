import { getPaperView } from '@/lib/data/p31'
import { createSupabaseServer } from '@/lib/supabase/server'
import { FixMark } from './FixMark'

/** Board `teacher-fix-mark`: a marked paper with a sheet to change what an answer says or its mark. */
export default async function FixMarkPage({
  params,
  searchParams,
}: {
  params: Promise<{ classId: string; paperId: string }>
  searchParams: Promise<{ q?: string }>
}) {
  const { classId, paperId } = await params
  const { q } = await searchParams
  const view = await getPaperView(classId, paperId)
  const supabase = await createSupabaseServer()
  const [{ data: cls }, kid] = await Promise.all([
    supabase.from('classes').select('grade, subject, schools(name)').eq('id', classId).single(),
    view.child
      ? supabase.from('children').select('parent_first_name').eq('id', view.child.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const sheetFor = q ? Number(q) : (view.results.find((r) => !r.correct)?.n ?? view.results[0]?.n)
  return (
    <FixMark
      classId={classId}
      paperId={paperId}
      childId={view.child?.id ?? null}
      name={view.child?.firstName ?? 'Learner'}
      parent={kid.data?.parent_first_name ?? null}
      school={cls?.schools?.name ?? ''}
      subject={`Grade ${cls?.grade ?? ''} ${cls?.subject ?? ''}`.trim()}
      test={view.test.title.split(':')[0] ?? view.test.title}
      outOf={view.test.outOf}
      total={view.results.reduce((s, r) => s + r.mark, 0)}
      results={view.results.map((r) => ({ id: r.id, n: r.n, prompt: r.prompt, answer: r.answer, correct: r.correct, keyAnswer: r.keyAnswer, confidence: r.confidence }))}
      openN={sheetFor ?? null}
    />
  )
}
