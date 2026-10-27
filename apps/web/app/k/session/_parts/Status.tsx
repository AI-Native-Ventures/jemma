'use client'

import Link from 'next/link'
import type { StageMove } from '../[sessionId]/logic'
import type { FinishedSession } from '../[sessionId]/types'
import { Diamond } from './Gems'

const spin = 'motion-safe:animate-spin'

function Ring({ size, r, sw, path, mark }: { size: number; r: number; sw: number; path: string; mark: number }) {
  const c = size / 2
  return (
    <span aria-hidden="true" className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={spin}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="#EEEDF5" strokeWidth={sw} />
        <path d={path} fill="none" stroke="#FF6A4D" strokeWidth={sw} strokeLinecap="round" />
      </svg>
      <Diamond size={mark} className="absolute" />
    </span>
  )
}

type Row = { title: string; sub: string; state: 'done' | 'now' | 'next'; tag: string }

export function Loading({ warmup, tries, learnNote }: { warmup: number; tries: number; learnNote: string }) {
  const rows: Row[] = [
    ...(warmup > 0 ? [{ title: 'Warm-up', sub: `${warmup} quick questions`, state: 'done' as const, tag: 'Ready' }] : []),
    { title: 'Learn', sub: learnNote, state: 'now', tag: 'Now' },
    { title: 'Try', sub: `${tries} questions`, state: 'next', tag: 'Next' },
  ]
  return (
    <div className="flex flex-1 flex-col gap-[22px] px-5 pt-[26px] pb-6">
      <section role="status" aria-live="polite" className="flex flex-col items-center gap-3.5 text-center">
        <Ring size={120} r={52} sw={9} path="M60 8a52 52 0 0 1 49.5 36" mark={44} />
        <h1 className="m-0 text-center text-[30px] leading-[1.14] font-bold tracking-[-0.02em] text-pretty">Getting your lesson ready.</h1>
        <p className="m-0 text-[18px] leading-[1.45] text-body">About 10 seconds. Grab a pencil and some paper!</p>
      </section>
      <section aria-label="Tonight's lesson" className="rounded-[24px] border border-line bg-card px-[18px] py-2">
        <ol className="m-0 flex list-none flex-col p-0">
          {rows.map((row) => (
            <li key={row.title} className="flex min-h-14 items-center gap-3.5">
              <span aria-hidden="true" className="flex size-8 flex-none items-center justify-center">
                {row.state === 'done' ? (
                  <span className="flex size-8 items-center justify-center rounded-pill bg-ink">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
                  </span>
                ) : row.state === 'now' ? (
                  <svg width="32" height="32" viewBox="0 0 28 28" className={spin}>
                    <circle cx="14" cy="14" r="11" fill="none" stroke="#EEEDF5" strokeWidth="3.5" />
                    <path d="M14 3a11 11 0 0 1 11 11" fill="none" stroke="#FF6A4D" strokeWidth="3.5" strokeLinecap="round" />
                  </svg>
                ) : (
                  <span className="size-8 rounded-pill border-2 border-edge" />
                )}
              </span>
              <span className="flex flex-1 flex-col leading-[1.3]">
                <span className="text-[17px] font-semibold">{row.title}</span>
                <span className="text-[15px] text-body">{row.sub}</span>
              </span>
              <span className={`text-[14px] font-semibold ${row.state === 'now' ? 'text-coral-text' : 'text-body'}`}>{row.tag}</span>
            </li>
          ))}
        </ol>
      </section>
      <div className="flex-1" />
    </div>
  )
}

export function LoadError({ onRetry, warmupHref }: { onRetry: () => void; warmupHref?: () => void }) {
  return (
    <div className="flex flex-1 flex-col gap-[22px] px-5 pt-[26px] pb-7">
      <section role="alert" className="flex flex-col items-center gap-3.5 rounded-[26px] border border-line bg-card px-[22px] pt-7 pb-6 text-center">
        <Ring size={84} r={38} sw={7} path="M42 4a38 38 0 0 1 36.1 26.2" mark={30} />
        <h1 className="m-0 text-[30px] leading-[1.15] font-bold tracking-[-0.02em] text-pretty">Your lesson is taking a little longer</h1>
        <p className="m-0 text-[18px] leading-[1.45] text-body text-pretty">It&apos;s not you. The internet is slow right now. Nothing you did is lost.</p>
      </section>
      <div className="flex flex-col gap-2.5">
        <button type="button" onClick={onRetry} className="flex h-[68px] cursor-pointer items-center justify-center gap-3 rounded-20 border-0 bg-coral text-[23px] font-bold text-ink">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 12a8 8 0 1 1-2.34-5.66" /><path d="M20 4v4.5h-4.5" />
          </svg>
          Try again
        </button>
        {warmupHref ? (
          <button type="button" onClick={warmupHref} className="flex h-[60px] cursor-pointer items-center justify-center rounded-20 border-2 border-ink bg-card text-[19px] font-semibold text-ink">
            Do the warm-up first
          </button>
        ) : null}
      </div>
      <p className="m-0 text-center text-[16px] leading-[1.45] text-body">Still stuck? Ask a grown-up to check the Wi-Fi.</p>
      <div className="flex-1" />
    </div>
  )
}

const STAGES = [
  { id: 'new', label: 'New' },
  { id: 'practising', label: 'Practising' },
  { id: 'fixed', label: 'Fixed' },
] as const

function StageGem({ stage, on }: { stage: StageMove['to']; on: boolean }) {
  if (!on) {
    return (
      <svg width="24" height="24" viewBox="0 0 16 16" aria-hidden="true">
        <polygon points="8,1.8 14.2,8 8,14.2 1.8,8" fill="none" stroke={stage === 'new' ? '#8C89A3' : '#CFCDDC'} strokeWidth="1.4" />
      </svg>
    )
  }
  return (
    <svg width="24" height="24" viewBox="0 0 16 16" aria-hidden="true">
      {stage === 'fixed' ? <polygon points="8,1 15,8 8,15 1,8" fill="#FF6A4D" /> : <polygon points="1,8 15,8 8,15" fill="#FF6A4D" />}
      <polygon points="8,1 15,8 8,15 1,8" fill="none" stroke="#1F1D36" strokeWidth="1.3" />
    </svg>
  )
}

const lower = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s)

export function Progress({ done, onDone }: { done: FinishedSession; onDone: () => void }) {
  const stage = done.stage
  const label = stage ? STAGES.find((s) => s.id === stage.to)!.label : ''
  const title = !stage
    ? 'Great work tonight!'
    : stage.to === 'fixed'
      ? 'You fixed it!'
      : stage.from === stage.to
        ? `You kept it at ${label}!`
        : `You moved it to ${label}!`
  return (
    <main className="flex flex-1 flex-col items-center gap-[22px] px-6 pt-3 pb-7 text-center">
      <style>{`@keyframes jemmaPop{0%{transform:scale(.6);opacity:0}70%{transform:scale(1.08)}100%{transform:scale(1);opacity:1}}`}</style>
      <div aria-hidden="true" className="mt-2 flex size-[196px] items-center justify-center rounded-pill bg-[#FFF1ED]">
        <svg width="132" height="132" viewBox="0 0 16 16" style={{ animation: 'jemmaPop 700ms ease-out both' }}>
          <polygon points="1,8 15,8 8,15" fill="#FF6A4D" />
          <polygon points="8,1 15,8 8,15 1,8" fill="none" stroke="#1F1D36" strokeWidth="0.7" strokeLinejoin="round" />
        </svg>
      </div>
      <div className="flex flex-col gap-2.5">
        <p className="m-0 text-[15px] font-semibold text-coral-text">{stage?.topicName ?? done.topicName}</p>
        <h1 className="m-0 text-[32px] leading-[1.12] font-bold tracking-[-0.02em]">{title}</h1>
      </div>
      {stage ? (
        <ol aria-label="Stages" className="m-0 grid w-full list-none grid-cols-3 gap-1.5 p-0">
          {STAGES.map((s) => {
            const on = s.id === stage.to
            return (
              <li
                key={s.id}
                aria-current={on ? 'step' : undefined}
                className={`flex flex-col items-center gap-1.5 rounded-[16px] bg-card px-1.5 py-3 ${on ? 'border-2 border-ink' : 'border border-line'}`}
              >
                <StageGem stage={s.id} on={on} />
                <span className={`text-[14px] ${on ? 'font-bold' : 'text-body'}`}>{s.label}</span>
              </li>
            )
          })}
        </ol>
      ) : null}
      <p className="m-0 text-[18px] leading-[1.5] text-pretty">
        You stuck with it for {done.minutes} {done.minutes === 1 ? 'minute' : 'minutes'} and cracked {lower(done.topicName)}. That&apos;s how gaps get fixed.
      </p>
      {done.next ? (
        <div className="flex w-full items-center gap-3 rounded-18 border border-line bg-card px-4 py-3.5 text-left">
          <span aria-hidden="true" className="flex size-10 flex-none items-center justify-center rounded-12 bg-soft-4">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1F1D36" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 9.5h16M8.5 3v4M15.5 3v4" />
            </svg>
          </span>
          <span className="flex flex-col gap-0.5">
            <span className="text-[16px] font-semibold">Next: {done.next.day}</span>
            <span className="text-[14px] text-body">{done.next.topic}</span>
          </span>
        </div>
      ) : null}
      <div className="flex-1" />
      <div className="flex w-full flex-col gap-1.5">
        <button type="button" onClick={onDone} className="flex h-[60px] cursor-pointer items-center justify-center rounded-18 border-0 bg-ink text-[19px] font-bold text-white">
          Done
        </button>
        <Link href="/k/gaps" className="flex min-h-11 items-center justify-center text-[16px] font-semibold text-ink underline underline-offset-[3px]">
          See all my gaps
        </Link>
      </div>
    </main>
  )
}
