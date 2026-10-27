import Link from 'next/link'
import { getPaperView, hhmm } from '@/lib/data/p31'
import { createSupabaseServer } from '@/lib/supabase/server'
import { PhotoViewer } from './PhotoViewer'

/** Board `teacher-paper`: the photo as snapped, full screen, with the unsure answer boxed. */
export default async function PaperPage({
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
  const { data: item } = await supabase.from('needs_you_items').select('id').eq('ref_id', paperId).eq('status', 'open').limit(1).maybeSingle()
  const focus = view.results.find((r) => r.n === Number(q)) ?? view.results.find((r) => r.unsure)
  const back = item ? `/t/${classId}/needs-you/${item.id}${focus ? `?q=${focus.n}` : ''}` : `/t/${classId}`
  const backLabel = focus && item ? `Back to question ${focus.n}` : 'Back'
  const name = view.child?.firstName ?? 'This'
  const short = view.test.title.split(':')[0]
  const page = view.pages[0]

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#121022] leading-[normal] text-white">
      <header className="flex items-center gap-1 pt-2.5 pr-3 pb-1.5 pl-2">
        <Link href={back} aria-label={backLabel} className="flex size-11 flex-none items-center justify-center rounded-12 text-white">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </Link>
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="text-[13px] text-[#C9C6DA]">{short} · page 1 of {view.pages.length || 1}</span>
          <span className="text-[17px] font-bold">{view.child ? `${name}'s paper` : 'Paper'}</span>
        </span>
      </header>
      <PhotoViewer url={page?.url ?? null} crop={focus?.crop ?? null} label={focus ? `Q${focus.n}` : null} />
      <div className="flex flex-col gap-3 px-5 pt-3.5 pb-7">
        <p className="m-0 text-[14px] leading-[1.45] text-[#C9C6DA]">
          {name}&apos;s paper as you snapped it at {hhmm(view.paper.createdAt)}.
          {focus?.crop ? ` The coral box is question ${focus.n}${focus.unsure ? ", the answer Jemma wasn't sure about" : ''}.` : ''}
        </p>
        <Link href={back} className="flex h-[52px] items-center justify-center gap-2 rounded-14 bg-card text-[17px] font-semibold text-ink no-underline">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>
          {focus && item ? `Back to question ${focus.n}` : 'Back'}
        </Link>
      </div>
    </div>
  )
}
