import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getNeedsItem, getPaperView, getPile, getRoster, hhmm, type ReviewResult } from '@/lib/data/p31'
import { getReviewPile, type ReviewPileRow } from '@/lib/data/p34'
import { createSupabaseServer } from '@/lib/supabase/server'
import { Diamond, Flow, PageTitle } from '../../snap/_parts'
import { ConfirmButton, FixCard } from './FixCard'
import { NamePicker } from './NamePicker'
import { PhotoStage } from './PhotoStage'

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
  // For this kind `ref_id` (kept in `paperId`) is the learner.
  if (item.kind === 'review_long_view') redirect(`/t/${classId}/learners/${item.paperId}/long-view`)
  // For this kind `ref_id` is the file of past records.
  if (item.kind === 'check_records') redirect(`/t/${classId}/learners/records/${item.paperId}`)
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
  const review = await getReviewPile(view.test.id)

  const headline =
    focus && focus.unsure
      ? `I'm not sure about question ${focus.n}. I read ${focus.answer || 'nothing'}. What does it say?`
      : outstanding.length === 0
        ? `All checked. Confirm ${name}'s paper.`
        : `Question ${focus?.n}. What does it say?`
  const laptopHeadline =
    focus && focus.unsure ? `I'm not sure about question ${focus.n} on ${view.child ? `${name}'s` : 'this'} paper. I read ${focus.answer || 'nothing'}. What does it say?` : headline

  return (
    <Flow href={`/t/${classId}`} label="Back to class" title={`${view.child ? `${name}'s` : 'The'} paper`} subtitle={`${short} · Needs you, ${slot} of ${Math.max(ids.length, 1)}`} hideAtLaptop>
    <div className="flex flex-col gap-4 px-5 pt-3 pb-5 leading-[normal] lg:px-8 lg:pt-6 lg:pb-9">
      <div className="contents lg:mx-auto lg:flex lg:w-full lg:max-w-[1140px] lg:flex-col lg:gap-[18px]">
      <div className="hidden flex-wrap items-center gap-x-4 gap-y-2 lg:flex">
        <Link href={`/t/${classId}`} className="inline-flex min-h-11 items-center gap-1 text-[15px] font-semibold text-ink no-underline">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>
          Class
        </Link>
        <span className="text-[15px] text-body">/ Needs you / {short}</span>
      </div>
      <div className="lg:hidden">
        <PageTitle size={25} leading={1.2} tracking="-0.01em">{headline}</PageTitle>
      </div>
      <div className="hidden items-start gap-3 lg:flex">
        <Diamond size={16} className="mt-3.5" />
        <h1 className="m-0 text-[32px] leading-[1.2] font-semibold tracking-[-0.02em] text-pretty">{laptopHeadline}</h1>
      </div>

      <div className="contents lg:flex lg:flex-wrap lg:items-start lg:gap-5">
        <PileNav classId={classId} current={view.paper.id} outOf={view.test.outOf} toCheck={review.toCheck} marked={review.marked} />

        <figure className="m-0 flex min-w-0 flex-col gap-2 lg:flex-[1_1_440px] lg:gap-2.5">
          <PhotoStage
            zoom={
              <Link href={`/t/${classId}/papers/${view.paper.id}${focus ? `?q=${focus.n}` : ''}`} aria-label="Zoom" className="flex size-11 items-center justify-center rounded-pill bg-[rgba(18,16,34,0.72)] text-white">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.4-4.4M11 8.5v5M8.5 11h5" /></svg>
              </Link>
            }
          >
            {page?.url ? (
              <div className="absolute left-0 w-full" style={{ top: '50%', transform: `translateY(-${Math.min(Math.max((crop ? crop.y + crop.h / 2 : 0.5) * 100, 25), 75)}%)` }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={page.url} alt={`Paper ${position}, page 1`} className="block h-auto w-full" />
                {crop ? (
                  <>
                    <span aria-hidden="true" className="absolute rounded-12 border-[3px] border-coral shadow-[0_0_0_999px_rgba(18,16,34,0.28)] lg:shadow-[0_0_0_999px_rgba(18,16,34,0.22)]" style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${crop.h * 100}%` }} />
                    <span className="absolute rounded-pill bg-coral px-2.5 py-1 text-[13px] font-bold text-ink" style={{ left: `${crop.x * 100}%`, top: `${(crop.y + crop.h) * 100}%`, marginTop: 6 }}>
                      Q{focus!.n}{focus!.unsure ? ' · not sure' : ''}
                    </span>
                  </>
                ) : null}
              </div>
            ) : null}
          </PhotoStage>
          <figcaption className="flex items-center justify-between text-[14px] text-body lg:hidden">
            <span>Photo snapped {hhmm(view.paper.createdAt)}, page 1 of {view.pages.length || 1}</span>
            <Link href={`/t/${classId}/papers/${view.paper.id}`} className="inline-flex min-h-11 items-center text-[14px] font-semibold text-ink underline underline-offset-[3px]">See whole paper</Link>
          </figcaption>
          <figcaption className="hidden text-[14px] text-body lg:block">
            {name}&apos;s paper as you snapped it, {hhmm(view.paper.createdAt)}. The box shows the answer Jemma is unsure about.
          </figcaption>
        </figure>

        <div className="contents lg:flex lg:min-w-0 lg:flex-[1_1_360px] lg:flex-col lg:gap-3.5">
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

      <section aria-labelledby="reading" className="flex flex-col rounded-20 border border-line bg-card pt-3 pr-2 pb-2 pl-4 lg:pt-3 lg:pr-3.5 lg:pb-2.5">
        <div className="flex items-baseline justify-between pr-2 lg:mb-1 lg:pr-0">
          <h2 id="reading" className="m-0 text-[16px] font-semibold">What Jemma read</h2>
          {view.child ? <span className="text-[13px] text-body lg:hidden">Name matched: {name}</span> : null}
          <span className="hidden text-[12px] font-semibold text-body lg:inline">Read · mark · sure</span>
        </div>
        <p className="mt-1 mb-1.5 text-[13px] text-body lg:hidden">Tap any answer to fix it.</p>
        <ol className="m-0 flex list-none flex-col p-0 lg:hidden">
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
        <ol className="m-0 hidden list-none flex-col p-0 lg:flex">
          {view.results.map((r) => {
            const on = focus?.n === r.n
            return (
              <li key={r.n} className={on ? 'my-0.5 -mx-1.5 rounded-12 bg-coral-wash' : 'border-t border-soft'}>
                <Link href={`?q=${r.n}`} replace scroll={false} className={`flex items-center gap-2.5 text-ink no-underline ${on ? 'min-h-[46px] px-1.5' : 'min-h-10'}`}>
                  <span className={`w-[30px] text-[13px] font-semibold ${on ? 'text-coral-text' : 'text-body'}`}>Q{r.n}</span>
                  <span className="flex flex-1 flex-col leading-[1.2]">
                    <span className="text-[15px] font-semibold">{r.answer}</span>
                    {r.changed || r.unsure ? <span className="text-[12px] text-body">{r.changed ? `You changed it from ${r.previous ?? ''}` : 'Not sure'}</span> : null}
                  </span>
                  <span className={`flex size-[26px] items-center justify-center rounded-pill ${r.mark ? (on ? 'bg-card' : 'bg-soft-4') : 'bg-[#FFEDE8]'}`}>{r.mark ? TICK : X}</span>
                  <span className={`w-11 text-right text-[13px] ${on ? 'font-bold text-coral-text' : 'text-body'}`}>{Math.round(r.confidence * 100)}%</span>
                </Link>
              </li>
            )
          })}
        </ol>
        <div className="mt-1.5 flex items-center justify-between border-t-[1.5px] border-ink pt-3 pr-2 pb-1.5 lg:pt-2.5 lg:pr-0 lg:pb-0">
          <span className="text-[16px] font-semibold">Total</span>
          <span className="text-[20px] font-bold tabular-nums">{total} / {view.test.outOf}</span>
        </div>
      </section>

      <div className="flex-1 lg:hidden" />
      <div className="flex flex-col gap-2">
        <ConfirmButton classId={classId} paperId={view.paper.id} name={name} disabled={outstanding.length > 0} />
        <p className="m-0 text-center text-[13px] text-body lg:hidden">Jemma learns from your fix for the next pile.</p>
      </div>
        </div>
      </div>
      </div>
    </div>
    </Flow>
  )
}

const avatarCls = (coral: boolean) =>
  `flex size-[30px] flex-none items-center justify-center rounded-pill text-[12px] font-bold ${coral ? 'bg-coral-soft' : 'bg-soft-3'}`

/** Laptop only: the papers of this test, still to check then marked (board `laptop-teacher-review`). */
function PileNav({ classId, current, outOf, toCheck, marked }: { classId: string; current: string; outOf: number; toCheck: ReviewPileRow[]; marked: ReviewPileRow[] }) {
  const rows = (list: ReviewPileRow[], first: boolean) =>
    list.map((p, i) => {
      const on = p.id === current
      const name = p.childName ?? `Paper ${p.position}`
      const href = p.itemId ? `/t/${classId}/needs-you/${p.itemId}` : `/t/${classId}/papers/${p.id}`
      return (
        <Link
          key={p.id}
          href={href}
          aria-current={on ? 'page' : undefined}
          className={`flex items-center gap-2.5 rounded-14 px-3 py-2.5 text-ink no-underline ${on ? 'border-2 border-ink bg-card' : ''}`}
        >
          <span aria-hidden="true" className={avatarCls(!first && i === 0)}>{name.slice(0, 1)}</span>
          {first ? (
            <span className="flex flex-1 flex-col leading-tight">
              <span className="text-[15px] font-semibold">{name}</span>
              <span className="text-[12px] font-semibold text-coral-text">{Math.max(p.unsure, 1) === 1 ? '1 answer to check' : `${p.unsure} answers to check`}</span>
            </span>
          ) : (
            <>
              <span className="flex-1 text-[15px]">{name}</span>
              <span className="text-[14px] font-semibold tabular-nums">{p.total ?? 0}/{outOf}</span>
            </>
          )}
        </Link>
      )
    })
  return (
    <nav aria-label="Papers" className="hidden min-w-[180px] flex-[0_1_210px] flex-col gap-1.5 lg:flex">
      <span className="px-1 text-[13px] font-semibold text-body">To check · {toCheck.length}</span>
      {rows(toCheck, true)}
      <span className="px-1 pt-2.5 text-[13px] font-semibold text-body">Marked · {marked.length}</span>
      {rows(marked, false)}
    </nav>
  )
}
