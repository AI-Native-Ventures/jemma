'use client'

import { Spinner } from '@/components/ui/Button'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition, type ReactNode } from 'react'
import { addPage, addPaper, retakePaper, useSamplePapers } from '../../actions'
import { RETAKE_PATH } from '../../_parts'

const sheet = 'absolute h-10 w-[30px] rounded-[3px] bg-[#FBFAF5] shadow-[0_1px_3px_rgba(0,0,0,0.3)] flex flex-col gap-[3px] px-1 py-[5px]'
const lines = (
  <>
    <span className="h-0.5 w-[70%] bg-[#9A9A9A]" />
    <span className="h-0.5 bg-[#C4C4C4]" />
    <span className="h-0.5 bg-[#C4C4C4]" />
    <span className="h-0.5 w-[80%] bg-[#C4C4C4]" />
    <span className="h-0.5 bg-[#C4C4C4]" />
  </>
)

export function Thumb({ two }: { two: boolean }) {
  return (
    <span aria-hidden="true" className="relative size-14 flex-none overflow-hidden rounded-12 bg-[#6E665D]">
      {two ? (
        <>
          <span className={`${sheet} top-1 left-[17px]`}>{lines}</span>
          <span className={`${sheet} top-2.5 left-2.5`}>{lines}</span>
        </>
      ) : (
        <span className={`${sheet} top-2 left-[13px]`}>{lines}</span>
      )}
    </span>
  )
}

const cameraProps = { type: 'file', accept: 'image/*', capture: 'environment', className: 'sr-only' } as const

export function RetakeButton({ classId, paperId, position }: { classId: string; paperId: string; position: number }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <label aria-label={`Retake paper ${position}`} className="flex size-11 cursor-pointer items-center justify-center rounded-12 text-ink focus-within:outline-2 focus-within:outline-ink">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d={RETAKE_PATH} /><path d="M20 4v4.5h-4.5" /></svg>
      <input
        {...cameraProps}
        disabled={pending}
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          start(async () => {
            const form = new FormData()
            form.set('file', file)
            await retakePaper(classId, paperId, form)
            router.refresh()
          })
        }}
      />
    </label>
  )
}

export function Queue({
  classId,
  testId,
  next,
  lastPaper,
  count,
  children,
}: {
  classId: string
  testId: string
  next: number
  lastPaper: { id: string; position: number } | null
  count: number
  children: ReactNode
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const send = (file: File | undefined, kind: 'paper' | 'page') => {
    if (!file) return
    setError(null)
    start(async () => {
      const form = new FormData()
      form.set('file', file)
      const res = kind === 'paper' || !lastPaper ? await addPaper(classId, testId, form) : await addPage(classId, lastPaper.id, form)
      if (!res.ok) setError(res.message)
      router.refresh()
    })
  }
  const sample = () =>
    start(async () => {
      const res = await useSamplePapers(classId, testId)
      if (!res.ok) setError(res.message)
      router.refresh()
    })

  return (
    <>
      <label className={`relative flex h-[68px] cursor-pointer items-center justify-center gap-3 rounded-20 bg-coral text-[21px] font-bold text-ink focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink ${pending ? 'opacity-60' : ''}`}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#1F1D36" strokeWidth="2" aria-hidden="true"><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.4-2h5l1.4 2h1.6A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" /><circle cx="12" cy="12.5" r="3.5" /></svg>
        Snap paper {next}
        {pending ? <Spinner /> : null}
        <input {...cameraProps} data-testid="snap-paper" disabled={pending} onChange={(e) => { send(e.target.files?.[0], 'paper'); e.target.value = '' }} />
      </label>
      {lastPaper ? (
        <label className="flex h-[50px] cursor-pointer items-center justify-center gap-2 rounded-14 border-[1.5px] border-ink bg-card text-[17px] font-semibold text-ink focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          Add a page to paper {lastPaper.position}
          <input {...cameraProps} data-testid="snap-page" disabled={pending} onChange={(e) => { send(e.target.files?.[0], 'page'); e.target.value = '' }} />
        </label>
      ) : null}

      {children}

      {error ? <p role="alert" className="m-0 text-[14px] text-coral-text">{error}</p> : null}
      <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] text-body">
        No papers with you?
        <button type="button" onClick={sample} disabled={pending} className="inline-flex min-h-11 cursor-pointer items-center border-none bg-transparent p-0 text-[15px] font-semibold text-ink underline underline-offset-[3px]">Use the sample papers</button>
      </p>
      <Link href={`/t/${classId}/snap/${testId}/progress`} className="flex h-[52px] items-center justify-center gap-2 rounded-14 bg-ink text-[17px] font-semibold text-white no-underline">
        Done snapping · {count} paper{count === 1 ? '' : 's'}
      </Link>
    </>
  )
}
