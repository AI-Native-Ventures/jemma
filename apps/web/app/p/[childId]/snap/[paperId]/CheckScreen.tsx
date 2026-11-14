'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { GemIcon } from '@/components/ui'
import { confirmScan } from '../actions'
import { hand } from '../_parts'

export type CheckAnswer = { n: number; prompt: string; answer: string; right: boolean; unsure: boolean }

const rightPill = (bg: string) => (
  <span className="flex size-7 flex-none items-center justify-center rounded-full" style={{ background: bg }}>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1F1D36" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="Marked right">
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  </span>
)
const wrongPill = (
  <span className="flex size-7 flex-none items-center justify-center rounded-full bg-[#FFEDE8]">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#B8381F" strokeWidth="3.4" strokeLinecap="round" role="img" aria-label="Marked wrong">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  </span>
)

/** parent-snap-check: what Jemma read, one unsure answer to settle, then Confirm and save. */
export function CheckScreen({
  childId, paperId, answers, title, written, photoUrl, next, retakeHref,
}: {
  childId: string
  paperId: string
  answers: CheckAnswer[]
  title: string
  written: string
  photoUrl: string | null
  next: string | null
  retakeHref: string
}) {
  const router = useRouter()
  const [sure, setSure] = useState<number[]>([])
  const [fixing, setFixing] = useState<number[]>([])
  const [edits, setEdits] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const n = answers.length

  async function save() {
    setBusy(true)
    setMessage(null)
    const res = await confirmScan(childId, paperId, edits, sure)
    if (res.ok) router.push(`/p/${childId}/snap/${paperId}/saved`)
    else {
      setMessage(res.message)
      setBusy(false)
    }
  }

  return (
    <main className="flex flex-col gap-4 px-5 pb-5 pt-2.5 leading-[normal] lg:mx-auto lg:max-w-[560px]">
      <div className="flex items-start gap-2.5">
        <GemIcon size={14} className="mt-2.5 flex-none" />
        <h1 className="m-0 text-pretty text-[25px] font-semibold leading-[1.2] tracking-[-0.01em]">
          I read {n} answer{n === 1 ? '' : 's'} and the teacher&apos;s marks. Check one, then confirm.
        </h1>
      </div>

      <section aria-label="Your photo" className="flex items-center gap-3.5 rounded-18 border border-line bg-card p-3">
        <span aria-hidden="true" className="flex h-[82px] w-16 flex-none items-center justify-center overflow-hidden rounded-[10px] bg-[#7A6F63]">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt="" className="size-full object-cover" />
          ) : (
            <span className="flex h-[68px] w-[52px] rotate-[1.6deg] flex-col gap-[5px] bg-[#FCFBF6] px-1.5 py-[7px]">
              <span className="h-[3px] w-[70%] bg-[#555555]" />
              <span className="h-0.5 bg-[#B5B3AA]" />
              <span className="h-0.5 bg-[#B5B3AA]" />
              <span className="h-0.5 w-[80%] bg-[#B5B3AA]" />
              <span className="h-0.5 bg-[#B5B3AA]" />
              <span className="h-0.5 w-[60%] bg-[#B5B3AA]" />
            </span>
          )}
        </span>
        <span className="flex flex-1 flex-col gap-0.5">
          <span className="text-[16px] font-semibold">{title}</span>
          <span className="text-[14px] text-body">{written}</span>
        </span>
        {photoUrl ? (
          <a href={photoUrl} target="_blank" rel="noreferrer" className="flex h-11 flex-none items-center rounded-[10px] border border-[#8C89A3] bg-card px-3.5 text-[14px] font-semibold text-ink no-underline">
            View
          </a>
        ) : (
          <button type="button" className="h-11 flex-none rounded-[10px] border border-[#8C89A3] bg-card px-3.5 text-[14px] font-semibold text-ink">View</button>
        )}
      </section>

      <section aria-labelledby="read" className="flex flex-col rounded-20 border border-line bg-card py-3 pb-2 pl-4 pr-2.5">
        <div className="flex items-baseline justify-between pr-1.5">
          <h2 id="read" className="m-0 text-[16px] font-semibold">What Jemma read</h2>
          <span className="text-[12px] font-semibold text-body">Amina wrote · teacher</span>
        </div>
        <ol className="m-0 mt-1.5 flex list-none flex-col p-0">
          {answers.map((a) => {
            const open = a.unsure && !sure.includes(a.n)
            const value = edits[a.n] ?? a.answer
            if (!open) {
              return (
                <li key={a.n} className="flex min-h-[52px] items-center gap-2.5 border-t border-[#EFEEF4] pr-1.5">
                  <span className="w-[22px] text-[13px] font-semibold text-body">{a.n}</span>
                  <span className="flex-1 text-[15px]">{a.prompt}</span>
                  <span className="w-14 text-right text-[20px] text-[#2F3A56]" style={{ fontFamily: hand }}>{value}</span>
                  {a.right ? rightPill('#EEEDF5') : wrongPill}
                </li>
              )
            }
            return (
              <li key={a.n} className="-ml-2.5 my-1 flex flex-col gap-2.5 rounded-14 border border-[#FFC9BB] bg-[#FFF4F1] p-2.5">
                <span className="flex items-center gap-2.5">
                  <span className="w-[22px] text-[13px] font-semibold text-[#B8381F]">{a.n}</span>
                  <span className="flex-1 text-[15px]">{a.prompt}</span>
                  <span className="w-14 text-right text-[20px] text-[#5A6378]" style={{ fontFamily: hand }}>{value}</span>
                  {a.right ? rightPill('#FFFFFF') : wrongPill}
                </span>
                <span className="flex gap-2 text-[14px] leading-[1.45]">
                  <GemIcon size={12} className="mt-1 flex-none" />
                  <span>The pencil is faint here. Does it say {a.answer}?</span>
                </span>
                {fixing.includes(a.n) ? (
                  <input
                    aria-label="What it says"
                    value={value}
                    onChange={(e) => setEdits((cur) => ({ ...cur, [a.n]: e.target.value }))}
                    className="h-11 rounded-12 border-[1.5px] border-ink bg-card px-3 text-[15px] text-ink"
                  />
                ) : (
                  <span className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setSure((cur) => [...cur, a.n])} className="min-h-11 rounded-12 border-none bg-ink px-5 py-2 text-center text-[15px] font-semibold text-balance text-white">
                      Yes, {a.answer}
                    </button>
                    <button type="button" onClick={() => setFixing((cur) => [...cur, a.n])} className="min-h-11 rounded-12 border-[1.5px] border-ink bg-card px-5 py-2 text-center text-[15px] font-semibold text-balance text-ink">
                      Fix it
                    </button>
                  </span>
                )}
              </li>
            )
          })}
        </ol>
      </section>

      {next ? (
        <section aria-label="What happens next" className="flex gap-3 rounded-18 border border-line bg-card px-4 py-3.5">
          <GemIcon size={12} className="mt-[5px] flex-none" />
          <p className="m-0 text-[15px] leading-[1.5]">{next}</p>
        </section>
      ) : null}

      <div className="flex-1" />
      <div className="flex flex-col gap-1.5">
        {message ? <p role="alert" className="m-0 text-[14px] text-[#B8381F]">{message}</p> : null}
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="flex min-h-14 items-center justify-center gap-2 rounded-14 border-none bg-ink px-5 py-3 text-center text-[17px] font-semibold text-balance text-white disabled:opacity-50"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-none">
            <path d="m5 12.5 4.5 4.5L19 7.5" />
          </svg>
          Confirm and save
        </button>
        <Link href={retakeHref} className="flex min-h-11 items-center justify-center text-[15px] font-semibold text-ink underline underline-offset-[3px]">
          Retake the photo
        </Link>
      </div>
    </main>
  )
}
