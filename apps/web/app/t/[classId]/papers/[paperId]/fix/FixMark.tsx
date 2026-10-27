'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { fixMark } from '../../../snap/actions'

type Row = { id: string; n: number; prompt: string; answer: string; correct: boolean; keyAnswer: string | null; confidence: number }

const hand = "font-hand text-navy leading-none"
const sr = 'absolute h-px w-px overflow-hidden whitespace-nowrap [clip:rect(0_0_0_0)]'
const circled = (r: Row) => /^(bigger|which)/i.test(r.prompt) || /^[A-D]$/.test(r.answer)

export function FixMark({
  classId, paperId, childId, name, parent, school, subject, test, outOf, total, results, openN,
}: {
  classId: string; paperId: string; childId: string | null; name: string; parent: string | null; school: string
  subject: string; test: string; outOf: number; total: number; results: Row[]; openN: number | null
}) {
  const router = useRouter()
  const row = results.find((r) => r.n === openN) ?? null
  const [pick, setPick] = useState<'read' | 'type'>('read')
  const [text, setText] = useState('')
  const [verdict, setVerdict] = useState<'right' | 'wrong' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const back = childId ? `/t/${classId}/learners/${childId}` : `/t/${classId}`
  const word = row ? (row.correct ? 'right' : 'wrong') : 'wrong'
  const answer = pick === 'type' ? text.trim() : (row?.answer ?? '')
  const mark = verdict ?? word
  const changed = !!row && ((pick === 'type' && answer !== '' && answer !== row.answer) || mark !== word)

  const save = () =>
    start(async () => {
      if (!row) return
      const res = await fixMark(classId, row.id, answer, mark)
      if (!res.ok) return setError(res.message)
      router.push(`/t/${classId}/papers/${paperId}/fix`)
      router.refresh()
      setPick('read')
      setVerdict(null)
    })

  const toggle = (on: boolean) => `h-12 cursor-pointer rounded-12 text-[16px] ${on ? 'border-none bg-ink font-semibold text-white' : 'border border-edge bg-card font-medium text-ink'}`

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-ground leading-[normal] text-ink">
      <header className="flex items-center gap-1 pt-2.5 pr-3 pb-1.5 pl-2">
        <Link href={back} aria-label={`Back to ${name}'s profile`} className="flex size-11 flex-none items-center justify-center rounded-12 text-ink">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>
        </Link>
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="text-[13px] text-body">{name} · {test}</span>
          <span className="text-[17px] font-bold">{name}&apos;s paper</span>
        </span>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-auto px-5 pt-3">
        <div className="rounded-20 bg-soft-3 p-3">
          <div className="rounded-md bg-[#FBFAF5] px-3.5 pt-4 pb-2.5 font-[Arial,Helvetica,sans-serif] text-[#2A2A2A] shadow-[0_4px_14px_rgba(31,29,54,0.12)]">
            <div className="flex items-start justify-between gap-2.5">
              <span className="flex flex-col gap-[3px]">
                <span className="text-[13px] font-bold">{school}</span>
                <span className="text-[11px] text-[#444444]">{subject} · {test}</span>
              </span>
              <span className="inline-flex items-center gap-[5px] rounded-pill bg-ink py-1 pr-2.5 pl-2 font-sans text-[14px] font-bold text-white">
                <svg width="10" height="10" viewBox="0 0 16 16" aria-hidden="true"><polygon points="8,0.5 15.5,8 8,15.5 0.5,8" fill="#FF6A4D" /></svg>
                {total}/{outOf}
              </span>
            </div>
            <span className="mt-2.5 mb-1.5 flex items-end gap-2 text-[11px]">Name <span className="flex-1 border-b border-[#777777] pl-1.5"><span className={`${hand} text-[20px]`}>{name}</span></span></span>
            <ol className="m-0 list-none p-0">
              {results.map((r) => (
                <li key={r.n} className="border-t border-[#ECEAE2]">
                  <Link href={`?q=${r.n}`} replace scroll={false} className="flex min-h-10 items-center gap-2 text-inherit no-underline">
                    <span className="min-w-0 flex-1 text-[13px] leading-[1.3]">{r.n}. &nbsp;{r.prompt}</span>
                    {circled(r) ? (
                      <span className="flex h-8 w-[58px] flex-none items-center justify-center"><span className={`${hand} rounded-full border-[1.5px] border-navy px-[7px] py-[3px] text-[17px]`}>{r.answer}</span></span>
                    ) : (
                      <span className={`${hand} flex h-8 w-[58px] flex-none items-center justify-center rounded-[3px] text-[18px] ${r.correct ? 'border border-[#8F8F8F]' : 'border-2 border-coral'}`}>{r.answer}</span>
                    )}
                    <span className="flex w-[68px] flex-none items-center">
                      {r.correct ? (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1F1D36" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="ml-1" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-pill bg-coral-tint py-[3px] pr-2 pl-1.5 font-sans text-[13px] font-bold whitespace-nowrap">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#1F1D36" strokeWidth="3.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
                          <span className={sr}>Missed. Right answer </span>{r.keyAnswer}
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
      {row ? (
        <>
          <span aria-hidden="true" className="absolute inset-0 bg-[rgba(31,29,54,0.5)]" />
          <section role="dialog" aria-modal="true" aria-labelledby="fixq" className="absolute right-0 bottom-0 left-0 flex max-h-[90%] flex-col gap-3.5 overflow-auto rounded-t-[28px] bg-card px-5 pt-2.5 pb-7 shadow-[0_-10px_30px_rgba(31,29,54,0.18)]">
            <span aria-hidden="true" className="h-[5px] w-11 self-center rounded-pill bg-edge" />
            <div className="flex items-center justify-between gap-2">
              <h2 id="fixq" className="m-0 text-[21px] font-semibold">Question {row.n} · {row.prompt}</h2>
              <Link href="?q=0" replace aria-label="Close" className="flex size-11 flex-none items-center justify-center rounded-12 text-ink">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
              </Link>
            </div>
            <div aria-hidden="true" className="flex items-center gap-3 rounded-14 border border-[#E3E1D8] bg-[#FBFAF5] px-4 py-3.5 font-[Arial,Helvetica,sans-serif] text-[#2A2A2A]">
              <span className="text-[15px]">{row.n}. &nbsp;{row.prompt}</span>
              <span className={`${hand} flex h-11 w-[84px] items-center justify-center rounded-[4px] border-2 border-coral text-[26px]`}>{row.answer}</span>
            </div>
            <p className="m-0 text-[15px] leading-[1.45] text-body">Jemma read <strong className="font-semibold text-ink">{row.answer}</strong> · marked {word} · {Math.round(row.confidence * 100)}% sure</p>
            <fieldset className="m-0 flex flex-col gap-2 border-none p-0">
              <legend className="mb-2 p-0 text-[15px] font-semibold">What does it say?</legend>
              <span className="grid grid-cols-2 gap-2">
                <button type="button" aria-pressed={pick === 'read'} onClick={() => setPick('read')} className={toggle(pick === 'read')}>{row.answer}</button>
                <button type="button" aria-pressed={pick === 'type'} onClick={() => setPick('type')} className={toggle(pick === 'type')}>Type it</button>
              </span>
              {pick === 'type' ? <input aria-label="What it says" value={text} onChange={(e) => setText(e.target.value)} className="h-12 rounded-12 border border-muted-2 px-3 text-[16px] outline-none focus-visible:border-2 focus-visible:border-ink" /> : null}
            </fieldset>
            <fieldset className="m-0 flex flex-col gap-2 border-none p-0">
              <legend className="mb-2 p-0 text-[15px] font-semibold">Mark</legend>
              <span className="grid grid-cols-2 gap-2">
                <button type="button" aria-pressed={mark === 'right'} onClick={() => setVerdict('right')} className={toggle(mark === 'right')}>Right</button>
                <button type="button" aria-pressed={mark === 'wrong'} onClick={() => setVerdict('wrong')} className={toggle(mark === 'wrong')}>Wrong</button>
              </span>
            </fieldset>
            {error ? <p role="alert" className="m-0 text-[14px] text-coral-text">{error}</p> : null}
            <button type="button" disabled={!changed || pending} onClick={save} className="h-[52px] cursor-pointer rounded-14 border-none bg-ink text-[17px] font-semibold text-white disabled:cursor-not-allowed disabled:bg-soft-3 disabled:text-body">Save</button>
            <p className="m-0 text-[14px] leading-[1.45] text-body">Change something to save. {parent ?? 'Their parent'} sees any change, with your name on it. Jemma learns from your fixes.</p>
          </section>
        </>
      ) : null}
    </div>
  )
}
