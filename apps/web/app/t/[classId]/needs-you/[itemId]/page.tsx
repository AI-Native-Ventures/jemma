import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getNeedsItem, getPaperView, getPile, getRoster, hhmm, type ReviewResult } from '@/lib/data/p31'
import { createSupabaseServer } from '@/lib/supabase/server'
import { Flow, PageTitle } from '../../snap/_parts'
import { ConfirmButton, FixCard } from './FixCard'
import { NamePicker } from './NamePicker'

const X = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#B8381F" strokeWidth="3.4" strokeLinecap="round" role="img" aria-label="Wrong, 0 marks"><path d="M6 6l12 12M18 6 6 18" /></svg>
)
const TICK = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1F1D36" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="Right, 1 mark"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
)

/** Boards `teacher-review` (check an answer) and `teacher-review-name` (whose paper is this). */
export default async function NeedsYouItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ classId: string; itemId: string }>
  searchParams: Promise<{ q?: string }>
}) {
  const { classId, itemId } = await params
  const { q } = await searchParams
  const item = await getNeedsItem(itemId)
  if (item.kind === 'approve_key') redirect(`/t/${classId}/snap/${item.paperId}/key`)
  if (item.kind !== 'check_answer' && item.kind !== 'unreadable_name') notFound()

  const view = await getPaperView(classId, item.paperId)
  const pile = await getPile(view.test.id)
  const short = view.test.title.split(':')[0]!
  const position = pile.find((p) => p.id === view.paper.id)?.position ?? 1

  if (item.kind === 'unreadable_name') {
    const roster = await getRoster(classId, view.test.id)
    const left = roster.filter((r) => !r.hasPaper)
    const unnamed = pile.filter((p) => !p.childName && p.status !== 'queued' && p.status !== 'reading')
    return (
      <Flow href={`/t/${classId}`} label="Close" close title={`Paper ${position}`} subtitle={`${short} · Needs you`} subtitleFirst>
      <NamePicker
        classId={classId}
        itemId={itemId}
        testId={view.test.id}
        position={position}
        photo={view.pages[0]?.url ?? null}
        roster={roster.map((r) => ({ id: r.id, name: r.firstName, hasPaper: r.hasPaper }))}
        leftNames={left.map((l) => l.firstName)}
        unnamedPositions={unnamed.map((u) => u.position)}
      />
      </Flow>
    )
  }

  const supabase = await createSupabaseServer()
  const { data: open } = await supabase.from('needs_you_items').select('id').eq('status', 'open').order('created_at').order('id')
  const ids = (open ?? []).map((o) => o.id)
  const slot = Math.max(ids.indexOf(itemId), 0) + 1
  const byN = new Map(view.results.map((r) => [r.n, r]))
  const wanted = q ? byN.get(Number(q)) : undefined
  const focus: ReviewResult | undefined = wanted ?? view.results.find((r) => r.unsure) ?? view.results.find((r) => r.changed) ?? view.results[0]
  const name = view.child?.firstName ?? 'this learner'
  const outstanding = view.results.filter((r) => r.unsure)
  const page = view.pages[0]
  const crop = focus?.crop
  const original = focus ? (focus.changed ? (focus.previous ?? focus.answer) : focus.answer) : ''
  const total = view.results.reduce((s, r) => s + r.mark, 0)

  return (
    <Flow href={`/t/${classId}`} label="Back to class" title={`${view.child ? `${name}'s` : 'The'} paper`} subtitle={`${short} · Needs you, ${slot} of ${Math.max(ids.length, 1)}`}>
    <div className="flex flex-col gap-4 px-5 pt-3 pb-5 leading-[normal]">
      <PageTitle size={25} leading={1.2} tracking="-0.01em">
        {focus && focus.unsure
          ? `I'm not sure about question ${focus.n}. I read ${focus.answer || 'nothing'}. What does it say?`
          : outstanding.length === 0
            ? `All checked. Confirm ${name}'s paper.`
            : `Question ${focus?.n}. What does it say?`}
      </PageTitle>

      <figure className="m-0 flex flex-col gap-2">
        <div className="relative h-[262px] overflow-hidden rounded-18 bg-[#6E665D]">
          {page?.url ? (
            <div className="absolute left-0 w-full" style={{ top: '50%', transform: `translateY(-${Math.min(Math.max((crop ? crop.y + crop.h / 2 : 0.5) * 100, 25), 75)}%)` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={page.url} alt={`Paper ${position}, page 1`} className="block h-auto w-full" />
              {crop ? (
                <>
                  <span aria-hidden="true" className="absolute rounded-12 border-[3px] border-coral shadow-[0_0_0_999px_rgba(18,16,34,0.28)]" style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${crop.h * 100}%` }} />
                  <span className="absolute rounded-pill bg-coral px-2.5 py-1 text-[13px] font-bold text-ink" style={{ left: `${crop.x * 100}%`, top: `${(crop.y + crop.h) * 100}%`, marginTop: 6 }}>
                    Q{focus!.n}{focus!.unsure ? ' · not sure' : ''}
                  </span>
                </>
              ) : null}
            </div>
          ) : null}
          <Link href={`/t/${classId}/papers/${view.paper.id}${focus ? `?q=${focus.n}` : ''}`} aria-label="Zoom" className="absolute right-2.5 bottom-2.5 flex size-11 items-center justify-center rounded-pill bg-[rgba(18,16,34,0.72)] text-white">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.4-4.4M11 8.5v5M8.5 11h5" /></svg>
          </Link>
        </div>
        <figcaption className="flex items-center justify-between text-[14px] text-body">
          <span>Photo snapped {hhmm(view.paper.createdAt)}, page 1 of {view.pages.length || 1}</span>
          <Link href={`/t/${classId}/papers/${view.paper.id}`} className="inline-flex min-h-11 items-center text-[14px] font-semibold text-ink underline underline-offset-[3px]">See whole paper</Link>
        </figcaption>
      </figure>

      {focus ? (
        <FixCard
          key={`${focus.n}-${focus.answer}`}
          classId={classId}
          itemId={itemId}
          n={focus.n}
          original={original}
          keyAnswer={focus.keyAnswer}
          current={focus.changed ? focus.answer : null}
          marks={1}
        />
      ) : null}

      <section aria-labelledby="reading" className="flex flex-col rounded-20 border border-line bg-card pt-3 pr-2 pb-2 pl-4">
        <div className="flex items-baseline justify-between pr-2">
          <h2 id="reading" className="m-0 text-[16px] font-semibold">What Jemma read</h2>
          {view.child ? <span className="text-[13px] text-body">Name matched: {name}</span> : null}
        </div>
        <p className="mt-1 mb-1.5 text-[13px] text-body">Tap any answer to fix it.</p>
        <ol className="m-0 flex list-none flex-col p-0">
          {view.results.map((r) => {
            const on = focus?.n === r.n
            return (
              <li key={r.n} className={on ? 'my-0.5 -ml-2 rounded-12 bg-coral-wash' : 'border-t border-soft'}>
                <Link href={`?q=${r.n}`} replace scroll={false} className={`flex items-center gap-2.5 text-ink no-underline ${on ? 'min-h-[52px] px-2' : 'min-h-11 pr-2'}`}>
                  <span className={`w-[30px] text-[13px] font-semibold ${on ? 'text-coral-text' : 'text-body'}`}>Q{r.n}</span>
                  {r.changed || r.unsure ? (
                    <span className="flex flex-1 flex-col leading-tight">
                      <span className="text-[15px]">{r.prompt}</span>
                      <span className="text-[12px] text-body">{r.changed ? `Changed by you, was ${r.previous ?? ''}` : 'Not sure'}</span>
                    </span>
                  ) : (
                    <span className="flex-1 text-[15px]">{r.prompt}</span>
                  )}
                  <span className="w-[52px] text-right text-[16px] font-semibold">{r.answer}</span>
                  <span className={`flex size-7 items-center justify-center rounded-pill ${r.mark ? (on ? 'bg-card' : 'bg-soft-4') : 'bg-[#FFEDE8]'}`}>{r.mark ? TICK : X}</span>
                </Link>
              </li>
            )
          })}
        </ol>
        <div className="mt-1.5 flex items-center justify-between border-t-[1.5px] border-ink pt-3 pr-2 pb-1.5">
          <span className="text-[16px] font-semibold">Total</span>
          <span className="text-[20px] font-bold tabular-nums">{total} / {view.test.outOf}</span>
        </div>
      </section>

      <div className="flex-1" />
      <div className="flex flex-col gap-2">
        <ConfirmButton classId={classId} paperId={view.paper.id} name={name} disabled={outstanding.length > 0} />
        <p className="m-0 text-center text-[13px] text-body">Jemma learns from your fix for the next pile.</p>
      </div>
    </div>
    </Flow>
  )
}
