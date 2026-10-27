'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import type { AnswerKeyItem } from '@jemma/profiling/schemas'
import { approveKey, confirmKeyItem, uploadMemo } from '../../actions'
import { Diamond, KeyFraction, PageTitle, SURE } from '../../_parts'

const PENCIL = 'M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z'
const answerCls = 'text-[18px] font-bold'

function Answer({ value }: { value: string }) {
  return /^\s*(\d+\s+)?\d+\/\d+\s*$/.test(value) ? <KeyFraction value={value} /> : <span className={answerCls}>{value}</span>
}

export function KeyList({
  classId,
  testId,
  items,
  approved,
  unsure,
  memo,
}: {
  classId: string
  testId: string
  items: AnswerKeyItem[]
  approved: boolean
  unsure: number
  memo: { url: string | null; at: string | null; marks: number }
}) {
  const router = useRouter()
  const [editing, setEditing] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const save = (n: number, answer: string) =>
    start(async () => {
      const res = await confirmKeyItem(classId, testId, n, answer)
      if (!res.ok) return setError(res.message)
      setError(null)
      setEditing(null)
      router.refresh()
    })
  const approve = () =>
    start(async () => {
      const res = await approveKey(classId, testId)
      if (!res.ok) return setError(res.message)
      router.push(`/t/${classId}/snap/${testId}/papers`)
    })
  const retake = (file: File | undefined) => {
    if (!file) return
    start(async () => {
      const form = new FormData()
      form.set('file', file)
      const res = await uploadMemo(classId, testId, form)
      if (!res.ok) return setError(res.message)
      router.refresh()
    })
  }

  const edit = (n: number, current: string) => {
    setEditing(n)
    setDraft(current)
  }
  const editor = (n: number) => (
    <span className="flex gap-2">
      <input
        aria-label={`Answer to question ${n}`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className="h-11 min-w-0 flex-1 rounded-12 border border-muted-2 bg-card px-3 text-[16px] outline-none focus-visible:border-2 focus-visible:border-ink"
      />
      <button type="button" disabled={pending} onClick={() => save(n, draft)} className="h-11 cursor-pointer rounded-12 border-none bg-ink px-4 text-[15px] font-semibold text-white">Save</button>
    </span>
  )

  const title = unsure
    ? `I read ${items.length} answers from the memo. ${unsure === 1 ? 'Check one, then approve.' : `Check ${unsure}, then approve.`}`
    : `I read ${items.length} answers from the memo. Approve when they look right.`

  return (
    <>
      <PageTitle size={25} leading={1.2} tracking="-0.01em">{title}</PageTitle>

      <section aria-label="Memo photo" className="flex items-center gap-3.5 rounded-18 border border-line bg-card p-3">
        <span aria-hidden="true" className="flex h-[100px] w-[78px] flex-none items-center justify-center overflow-hidden rounded-[10px] bg-[#D9D5CC]">
          <span className="flex h-[84px] w-[62px] -rotate-2 flex-col gap-1 bg-[#FDFCF8] px-[7px] py-2 shadow-[0_2px_6px_rgba(0,0,0,0.18)]">
            <span className="h-1 w-[70%] rounded-[1px] bg-[#3A3A3A]" />
            {[90, 90, 80, 90, 70, 90, 85, 90, 60].map((w, i) => (
              <span key={i} className="h-0.5 bg-[#9A988F]" style={{ width: `${w}%` }} />
            ))}
          </span>
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="text-[16px] font-semibold">Memo, 1 page</span>
          <span className="text-[14px] text-body">
            {memo.at ? `Snapped ${memo.at} · ` : ''}{items.length} questions, {memo.marks} mark{memo.marks === 1 ? '' : 's'} each
          </span>
          <span className="mt-0.5 flex gap-2">
            {memo.url ? (
              <a href={memo.url} target="_blank" rel="noreferrer" className="flex h-11 items-center rounded-[10px] border border-muted-2 bg-card px-3.5 text-[14px] font-semibold text-ink no-underline">View photo</a>
            ) : (
              <span className="flex h-11 items-center rounded-[10px] border border-muted-2 bg-card px-3.5 text-[14px] font-semibold">View photo</span>
            )}
            <label className="flex h-11 cursor-pointer items-center rounded-[10px] border border-muted-2 bg-card px-3.5 text-[14px] font-semibold focus-within:outline-2 focus-within:outline-ink">
              Retake
              <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={pending || approved} onChange={(e) => { retake(e.target.files?.[0]); e.target.value = '' }} />
            </label>
          </span>
        </span>
      </section>

      <section aria-labelledby="key" className="flex flex-col rounded-20 border border-line bg-card py-1.5 pr-2 pl-4">
        <h2 id="key" className="sr-only">Answers Jemma read</h2>
        <ol className="m-0 flex list-none flex-col p-0">
          {items.map((item, idx) => {
            const isUnsure = item.confidence < SURE || !!item.note
            if (isUnsure) {
              return (
                <li key={item.n} className="my-1 -ml-3 flex flex-col gap-2.5 rounded-14 border border-[#FFC9BB] bg-coral-wash py-3 pr-2 pl-3">
                  <span className="flex items-center gap-2.5">
                    <span className="w-[30px] flex-none text-[14px] font-semibold text-coral-text">Q{item.n}</span>
                    <span className="flex min-w-0 flex-1 flex-col gap-px">
                      <span className="text-[15px]">{item.prompt}</span>
                      <span className="text-[12px] text-body">{item.topicName}</span>
                    </span>
                    <Answer value={item.answer} />
                    <span className="w-11 flex-none" />
                  </span>
                  <span className="flex gap-2 text-[14px] leading-[1.45]">
                    <Diamond size={12} className="mt-1" />
                    <span>{item.note ?? 'I am not sure I read this one right.'}</span>
                  </span>
                  {editing === item.n ? (
                    editor(item.n)
                  ) : (
                    <span className="grid grid-cols-2 gap-2">
                      <button type="button" disabled={pending} onClick={() => save(item.n, item.answer)} className="h-11 cursor-pointer rounded-12 border-none bg-ink text-[15px] font-semibold text-white">Yes, {item.answer}</button>
                      <button type="button" onClick={() => edit(item.n, item.answer)} className="h-11 cursor-pointer rounded-12 border-[1.5px] border-ink bg-card text-[15px] font-semibold text-ink">Change it</button>
                    </span>
                  )}
                </li>
              )
            }
            return (
              <li key={item.n} className={`flex flex-wrap items-center gap-x-2.5 py-[9px] ${idx > 0 ? 'border-t border-soft' : ''}`}>
                <span className="w-[30px] flex-none text-[14px] font-semibold text-body">Q{item.n}</span>
                <span className="flex min-w-0 flex-1 flex-col gap-px">
                  <span className="text-[15px]">{item.prompt}</span>
                  <span className="text-[12px] text-body">{item.topicName}</span>
                </span>
                <Answer value={item.answer} />
                <button type="button" aria-label={`Fix the answer to question ${item.n}`} onClick={() => edit(item.n, item.answer)} className="flex size-11 flex-none cursor-pointer items-center justify-center rounded-12 border-none bg-transparent p-0 text-ink">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={PENCIL} /></svg>
                </button>
                {editing === item.n ? <div className="basis-full pb-2 pl-10">{editor(item.n)}</div> : null}
              </li>
            )
          })}
        </ol>
      </section>

      <div className="flex-1" />
      {error ? <p role="alert" className="m-0 text-[14px] text-coral-text">{error}</p> : null}
      <div className="flex flex-col gap-2">
        <button type="button" onClick={approve} disabled={pending} className="flex h-[52px] cursor-pointer items-center justify-center gap-2 rounded-14 border-none bg-ink text-[17px] font-semibold text-white disabled:opacity-60">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
          Approve key, snap papers
        </button>
        <p className="m-0 text-center text-[13px] leading-[1.4] text-body">Jemma marks every paper against this key. Change it later and Jemma marks again.</p>
      </div>
    </>
  )
}
