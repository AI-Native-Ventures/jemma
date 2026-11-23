import { WhatJemmaDid } from '@/components/blocks'
import { getKeyView, getPile, getTestLog, hhmm } from '@/lib/data/p31'
import { getShareState } from '@/lib/data/p50b'
import { ShareCard } from '../../../ShareCard'
import { Poller } from '../../Poller'
import { Flow } from '../../_parts'
import { BeadDot, ReadingDrawing } from '@/components/sa'

const CSS = '@keyframes jemmaPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.55;transform:scale(.85)}}@keyframes jemmaSpin{to{transform:rotate(360deg)}}'
const check = (aria: string) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#161616" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={aria}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
)

/** A bead for each paper (or twelve beads for a big pile): green is read, gold is being read, empty is waiting. */
function PileBeads({ done, total, busy }: { done: number; total: number; busy: boolean }) {
  const n = total <= 12 ? total : 12
  const green = total <= 12 ? done : Math.floor((done / total) * 12)
  const size = n <= 8 ? 24 : 20
  return (
    <span aria-hidden="true" className="flex flex-wrap items-center gap-2" data-sa="bead-progress">
      {Array.from({ length: n }, (_, i) => (
        <BeadDot key={i} size={size} state={i < green ? 'done' : busy && i === green ? 'now' : 'next'} />
      ))}
    </span>
  )
}

/** Board `teacher-reading`: Jemma reads the pile. Refreshes every 2 s while anything is queued or reading. */
export default async function ReadingPage({ params }: { params: Promise<{ classId: string; testId: string }> }) {
  const { classId, testId } = await params
  const [key, pile, share] = await Promise.all([getKeyView(classId, testId), getPile(testId), getShareState(classId, testId)])
  const since = pile[0]?.createdAt ?? new Date(0).toISOString()
  const log = await getTestLog(classId, since)
  const done = pile.filter((p) => p.status === 'marked' || p.status === 'needs_you' || p.status === 'failed').length
  const busy = pile.length - done
  const outOf = key.test.outOf

  return (
    <Flow href={`/t/${classId}`} label="Close" close title={key.test.title.split(':')[0]!} subtitle={`${pile.length} papers snapped${pile[0] ? ` at ${hhmm(pile[0].createdAt)}` : ''}`}>
    <div className="flex flex-col gap-5 px-5 pt-[18px] pb-6 leading-[normal]">
      <style>{CSS}</style>
      <Poller active={busy > 0} />
      <section aria-live="polite" className="flex flex-col gap-3.5 rounded-[22px] border border-line bg-card px-5 py-[22px]">
        <div aria-hidden="true" className="w-[184px]">
          <ReadingDrawing />
        </div>
        <h1 className="m-0 text-[30px] leading-[1.12] font-semibold tracking-[-0.015em]">
          {pile.length === 0 ? 'No papers yet' : busy ? `Reading ${done} of ${pile.length} papers` : `Read ${done} of ${pile.length} papers`}
        </h1>
        <PileBeads done={done} total={pile.length} busy={busy > 0} />
        <p className="m-0 text-[16px] leading-[1.45] text-body text-pretty">
          {busy ? "About a minute left. You can leave this screen. Anything I'm unsure about goes to Needs you." : "All read. Anything I'm unsure about is in Needs you."}
        </p>
      </section>

      {share.card ? <ShareCard classId={classId} card={share.card} /> : null}

      <section aria-labelledby="papers" className="flex flex-col rounded-20 border border-line bg-card px-4 py-2">
        <h2 id="papers" className="mt-2 mb-1 text-[16px] font-semibold">Papers</h2>
        <ul className="m-0 flex list-none flex-col p-0">
          {pile.map((p) => {
            const name = p.childName
            const finished = p.status === 'marked' || p.status === 'needs_you' || p.status === 'failed'
            if (finished && name) {
              return (
                <li key={p.id} className="flex min-h-14 items-center gap-3 border-t border-soft">
                  <span aria-hidden="true" className={`flex size-8 flex-none items-center justify-center rounded-pill text-[13px] font-bold ${p.hasUser ? 'bg-gold-soft' : 'bg-soft-3'}`}>{name[0]}</span>
                  <span className="flex-1 text-[16px] font-medium">{name}</span>
                  {p.status === 'marked' && p.total !== null ? <span className="text-[15px] font-semibold tabular-nums">{p.total}/{outOf}</span> : <span className="text-[14px] text-body">Needs you</span>}
                  {p.status === 'marked' ? check('Marked') : null}
                </li>
              )
            }
            const dashed = <span aria-hidden="true" className="flex size-8 flex-none items-center justify-center rounded-pill border-[1.5px] border-dashed border-muted-2 text-[13px] font-semibold text-body">{p.position}</span>
            if (p.status === 'reading') {
              return (
                <li key={p.id} className="flex min-h-14 items-center gap-3 border-t border-soft">
                  {dashed}
                  <span className="flex flex-1 flex-col leading-tight">
                    <span className="text-[16px] font-medium">Paper {p.position}</span>
                    <span className="text-[13px] text-body">Reading the name and {outOf} answers</span>
                  </span>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" role="img" aria-label="Reading" style={{ animation: 'jemmaSpin 0.9s linear infinite' }}><circle cx="12" cy="12" r="9" stroke="#E6E3DC" strokeWidth="3" /><path d="M21 12a9 9 0 0 0-9-9" stroke="#161616" strokeWidth="3" strokeLinecap="round" /></svg>
                </li>
              )
            }
            return (
              <li key={p.id} className="flex min-h-14 items-center gap-3 border-t border-soft">
                {dashed}
                <span className="flex-1 text-[16px] font-medium text-body">Paper {p.position}</span>
                <span className="text-[14px] text-body">{p.status === 'queued' ? 'Waiting' : p.status === 'failed' ? 'Could not read' : 'Needs you'}</span>
              </li>
            )
          })}
        </ul>
      </section>

      {log.length ? <WhatJemmaDid entries={log} /> : null}

      <div className="flex-1" />
      <a href={`/t/${classId}`} className="flex min-h-[52px] items-center justify-center rounded-14 border-[1.5px] border-ink bg-card px-5 py-3 text-center text-[17px] font-semibold text-balance text-ink no-underline">Back to class</a>
    </div>
    </Flow>
  )
}
