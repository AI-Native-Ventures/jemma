'use client'

import { PendingButton } from '@/components/ui/Button'
import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { useState, useTransition } from 'react'
import type { AnswerKeyItem } from '@jemma/profiling/schemas'
import { SURE, PageTitle } from '../../../_parts'
import { shrinkPhoto } from '@/lib/shrink-photo'
import { postFiles } from '@/lib/upload-client'
import { approveKey, confirmKeyItem, type ActionResult } from '../../../actions'

export function DraftKey({ classId, testId, items, unsure, approved, children }: { classId: string; testId: string; items: AnswerKeyItem[]; unsure: number[]; approved: boolean; children: ReactNode }) {
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
  const memo = (file: File | undefined) => {
    if (!file) return
    start(async () => {
      const form = new FormData()
      form.set('file', await shrinkPhoto(file))
      try {
        const res = await postFiles<ActionResult>('t', 'uploadMemo', [classId, testId], form)
        if (!res.ok) return setError(res.message)
      } catch {
        return setError('That did not upload. Check your connection and try again.')
      }
      router.push(`/t/${classId}/snap/${testId}/key`)
    })
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <PageTitle size={26}>{`I worked out the ${items.length} answers. Check one before I mark the papers.`}</PageTitle>
        <p className="m-0 ml-6 text-[15px] leading-[1.45] text-body text-pretty">No memo was snapped, so I solved each question myself.</p>
      </div>

      <section aria-labelledby="key" className="flex flex-col gap-1.5 rounded-20 border border-line bg-card p-4">
        <div className="flex flex-col gap-0.5">
          <h2 id="key" className="m-0 text-[17px] font-semibold">Jemma&apos;s answers</h2>
          <p className="m-0 text-[14px] text-body">{items.length - unsure.length} look sure · {unsure.length} needs you</p>
        </div>
        <ol className="m-0 list-none p-0">
          {items.map((item, idx) => {
            const isUnsure = item.confidence < SURE || !!item.note
            if (isUnsure) {
              return (
                <li key={item.n} className="mx-[-6px] mt-1.5 mb-2 flex flex-col gap-2.5 rounded-16 border border-[#FFC9BB] bg-coral-wash p-3.5">
                  <span className="flex items-center gap-3">
                    <span className="w-[34px] flex-none text-[14px] font-bold text-coral-text">Q{item.n}</span>
                    <span className="min-w-0 flex-1 text-[15px]">{item.prompt}</span>
                    <span className="text-[16px] font-bold">{item.answer}</span>
                  </span>
                  <span className="text-[15px] leading-[1.45]">{item.note ?? 'I am not sure about this one.'}</span>
                  {editing === item.n ? (
                    <span className="flex gap-2">
                      <input aria-label={`Answer to question ${item.n}`} value={draft} onChange={(e) => setDraft(e.target.value)} className="h-[46px] min-w-0 flex-1 rounded-12 border border-muted-2 bg-card px-3 text-[16px] outline-none" />
                      <PendingButton pending={pending} type="button" disabled={pending} onClick={() => save(item.n, draft)} className="h-[46px] cursor-pointer rounded-12 border-none bg-ink px-4 text-[15px] font-semibold text-white">Save</PendingButton>
                    </span>
                  ) : (
                    <span className="grid grid-cols-2 gap-2">
                      <button type="button" aria-pressed="false" disabled={pending} onClick={() => save(item.n, item.answer)} className="h-[46px] cursor-pointer rounded-12 border border-edge bg-card text-[15px] font-medium text-ink">{item.answer} is right</button>
                      <button type="button" aria-pressed="false" onClick={() => { setEditing(item.n); setDraft(item.answer) }} className="h-[46px] cursor-pointer rounded-12 border border-edge bg-card text-[15px] font-medium text-ink">Change it</button>
                    </span>
                  )}
                </li>
              )
            }
            return (
              <li key={item.n} className={`flex min-h-12 items-center gap-3 ${idx > 0 ? 'border-t border-soft' : ''}`}>
                <span className="w-[34px] flex-none text-[14px] font-bold text-body">Q{item.n}</span>
                <span className="min-w-0 flex-1 text-[15px]">{item.prompt}</span>
                <span className="text-[16px] font-bold tabular-nums">{item.answer}</span>
              </li>
            )
          })}
        </ol>
      </section>
      {children}
      <div className="flex flex-col gap-2">
        {error ? <p role="alert" className="m-0 text-[14px] text-coral-text">{error}</p> : null}
        <PendingButton pending={pending} type="button" onClick={approve} disabled={pending || approved} className="flex h-[52px] cursor-pointer items-center justify-center gap-2 rounded-14 border-none bg-ink text-[17px] font-semibold text-white disabled:opacity-60">Approve key and snap papers</PendingButton>
        <label className="flex min-h-11 cursor-pointer items-center justify-center text-[15px] font-semibold text-ink underline underline-offset-[3px] focus-within:outline-2 focus-within:outline-ink">
          A memo is safer: snap the memo instead
          <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={pending} onChange={(e) => { memo(e.target.files?.[0]); e.target.value = '' }} />
        </label>
      </div>
    </>
  )
}
