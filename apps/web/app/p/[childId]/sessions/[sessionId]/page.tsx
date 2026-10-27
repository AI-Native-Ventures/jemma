import Link from 'next/link'
import { notFound } from 'next/navigation'
import { TabBar } from '@/components/blocks'
import { GemIcon } from '@/components/ui/icons'
import { dayLabel, FORMAT_LABEL, loadSessionResult, mmss, sessionStamp, shortTopic, type SessionItemView } from '@/lib/data/p25'
import { Overlay } from '../../learn/_overlay'

const card = 'rounded-20 border border-line bg-card'

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <span className="flex flex-col gap-0.5 rounded-14 border border-line bg-card p-3">
      <span className="text-[22px] font-bold">{value}</span>
      <span className="text-[13px] text-body">{label}</span>
    </span>
  )
}

function Mark({ correct }: { correct: boolean }) {
  return correct ? (
    <span className="flex size-7 items-center justify-center rounded-pill bg-soft-4">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1F1D36" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="Right"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
    </span>
  ) : (
    <span className="flex size-7 items-center justify-center rounded-pill bg-[#FFEDE8]">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#B8381F" strokeWidth="3.4" strokeLinecap="round" role="img" aria-label="Missed"><path d="M6 6l12 12M18 6 6 18" /></svg>
    </span>
  )
}

function ItemRow({ item }: { item: SessionItemView }) {
  const note =
    item.adapted === 'easier'
      ? 'Made easier after the miss'
      : item.adapted === 'harder'
        ? `Made harder after ${item.rightRun} right`
        : null
  return (
    <li className={`flex items-center gap-2.5 border-t border-soft ${note ? 'min-h-16' : 'min-h-14'}`}>
      <span className="w-[26px] flex-none text-[13px] font-semibold text-body">{item.position}</span>
      <span className="flex flex-1 flex-col leading-[1.3]">
        <span className="text-[15px] font-medium">{item.prompt}</span>
        <span className="text-[13px] text-body">
          Wrote {item.wrote}
          {item.correct ? '' : `, right is ${item.right}`} · {mmss(item.seconds)}
        </span>
        {note ? <span className="text-[12px] font-semibold text-ink">{note}</span> : null}
      </span>
      <Mark correct={item.correct} />
    </li>
  )
}

function StageNode({ state, label }: { state: 'past' | 'now' | 'next'; label: string }) {
  return (
    <span className="flex flex-1 flex-col items-center gap-1.5">
      {state === 'now' ? (
        <svg width="38" height="38" viewBox="0 0 16 16" aria-hidden="true"><polygon points="1,8 15,8 8,15" fill="#FF6A4D" /><polygon points="8,1 15,8 8,15 1,8" fill="none" stroke="#1F1D36" strokeWidth="1.3" /></svg>
      ) : (
        <svg width="30" height="30" viewBox="0 0 16 16" aria-hidden="true"><polygon points="8,1 15,8 8,15 1,8" fill="none" stroke={state === 'past' ? '#8C89A3' : '#CFCDDC'} strokeWidth="1.4" /></svg>
      )}
      <span className={state === 'now' ? 'text-[15px] font-bold' : 'text-[14px] text-body'}>{label}</span>
    </span>
  )
}

const SolidArrow = () => (
  <svg width="40" height="16" viewBox="0 0 40 16" aria-hidden="true" className="flex-none"><path d="M2 8h34M30 3l6 5-6 5" fill="none" stroke="#1F1D36" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
)
const DashedArrow = () => (
  <svg width="40" height="16" viewBox="0 0 40 16" aria-hidden="true" className="flex-none"><path d="M2 8h34" fill="none" stroke="#CFCDDC" strokeWidth="2" strokeDasharray="3 4" strokeLinecap="round" /></svg>
)

export default async function ParentSessionPage({ params }: { params: Promise<{ childId: string; sessionId: string }> }) {
  const { childId, sessionId } = await params
  const r = await loadSessionResult(childId, sessionId)
  if (!r) notFound()
  const name = r.childFirstName
  const at = r.stage === 'new' ? 0 : r.stage === 'practising' ? 1 : 2
  const nodes = ['New', 'Practising', 'Fixed'] as const
  const state = (i: number) => (i < at ? 'past' : i === at ? 'now' : 'next')

  return (
    <Overlay>
      <header className="flex items-center gap-1 pt-2.5 pr-3 pb-1.5 pl-2">
        <Link href={`/p/${childId}/learn`} aria-label="Back" className="flex size-11 flex-none items-center justify-center rounded-12 text-ink">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>
        </Link>
        <span className="flex min-w-0 flex-1 flex-col leading-[1.2]">
          <span className="text-[13px] text-body">
            {name} · {sessionStamp(r.finishedAt)}
          </span>
          <span className="text-[17px] font-bold">Tonight&apos;s session</span>
        </span>
      </header>

      <main className="mx-auto flex w-full max-w-[430px] flex-1 flex-col gap-[18px] px-5 pt-2.5 pb-5">
        <div className="flex items-start gap-2.5">
          <GemIcon size={14} className="mt-2.5 flex-none" />
          <h1 className="m-0 text-pretty text-[26px] leading-[1.2] font-semibold tracking-[-0.015em]">{r.headline}</h1>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Stat value={`${r.right} of ${r.total}`} label="Right" />
          <Stat value={`${r.minutes} min`} label="Time" />
          <Stat value={FORMAT_LABEL[r.format]} label="Format" />
        </div>

        <section aria-labelledby="stage" className={`${card} flex flex-col gap-3.5 p-[18px]`}>
          <h2 id="stage" className="m-0 text-[16px] font-semibold">
            {shortTopic(r.topicName)} moved a stage
          </h2>
          <div className="flex items-center justify-between gap-1.5">
            <StageNode state={state(0)} label={nodes[0]} />
            {at >= 1 ? <SolidArrow /> : <DashedArrow />}
            <StageNode state={state(1)} label={nodes[1]} />
            {at >= 2 ? <SolidArrow /> : <DashedArrow />}
            <StageNode state={state(2)} label={nodes[2]} />
          </div>
          <p className="m-0 text-[14px] leading-[1.45] text-body">
            It counts as fixed after she gets 4 or 5 right on a later check.
            {r.nextCheckDay ? ` Next check: ${r.nextCheckDay}.` : ''}
          </p>
        </section>

        <section aria-labelledby="qs" className={`${card} flex flex-col pt-3 pr-3.5 pb-1.5 pl-4`}>
          <div className="mb-1 flex items-baseline justify-between">
            <h2 id="qs" className="m-0 text-[16px] font-semibold">
              Each question
            </h2>
            <span className="text-[13px] text-body">
              Warm-up: {r.warmup.right} of {r.warmup.total}
            </span>
          </div>
          <ol className="m-0 flex list-none flex-col p-0">
            {r.items.map((item) => (
              <ItemRow key={item.position} item={item} />
            ))}
          </ol>
        </section>

        {r.next ? (
          <section aria-label="Next" className="flex items-center gap-3 rounded-18 border border-line bg-card px-4 py-3.5">
            <span aria-hidden="true" className="flex size-10 flex-none items-center justify-center rounded-12 bg-soft-4">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1F1D36" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 9.5h16M8.5 3v4M15.5 3v4" /></svg>
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="text-[15px] font-semibold">
                {dayLabel(r.next.plannedFor)}
                {r.next.quickCheck ? ' · quick check' : ''}
              </span>
              <span className="text-[14px] text-body">
                {r.next.questions ?? 5} questions{r.next.weak.length ? ` with ${r.next.weak.join(' and ')}` : ''}
              </span>
            </span>
          </section>
        ) : null}

        <div className="flex-1" />
        <Link href={`/p/${childId}`} className="flex h-[52px] items-center justify-center rounded-14 bg-ink text-[17px] font-semibold text-white no-underline">
          Done
        </Link>
      </main>
      <TabBar role="parent" active="learn" label={name} base={`/p/${childId}`} />
    </Overlay>
  )
}
