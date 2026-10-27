'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { confirmPaper, resolveAnswer } from '../../snap/actions'

const tick = (size: number, sw: number) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
)

export function FixCard({
  classId,
  itemId,
  n,
  original,
  keyAnswer,
  current,
  marks,
}: {
  classId: string
  itemId: string
  n: number
  original: string
  keyAnswer: string | null
  current: string | null
  marks: number
}) {
  const router = useRouter()
  const options = [...new Set([original, keyAnswer].filter((o): o is string => !!o))]
  const [selected, setSelected] = useState<string | null>(current)
  const [typing, setTyping] = useState(current !== null && !options.includes(current))
  const [text, setText] = useState(current ?? '')
  const [verdict, setVerdict] = useState<{ correct: boolean; mark: number } | null>(current !== null ? { correct: current === keyAnswer, mark: current === keyAnswer ? marks : 0 } : null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const choose = (answer: string) =>
    start(async () => {
      setError(null)
      const res = await resolveAnswer(classId, itemId, n, answer)
      if (!res.ok) return setError(res.message)
      setSelected(answer)
      setVerdict({ correct: res.correct, mark: res.mark })
      router.refresh()
    })

  const chip = (on: boolean, big: boolean) =>
    `flex h-[52px] cursor-pointer items-center justify-center gap-1.5 rounded-14 font-semibold ${big ? 'text-[19px]' : 'text-[16px]'} ${on ? 'border-2 border-ink bg-ink text-white' : 'border border-muted-2 bg-card text-ink'}`

  return (
    <section aria-labelledby="fix" className="flex flex-col gap-3 rounded-20 border border-line bg-card p-4">
      <h2 id="fix" className="m-0 text-[16px] font-semibold">Question {n} says</h2>
      <div className="grid grid-cols-3 gap-2">
        {options.map((o) => (
          <button key={o} type="button" aria-pressed={selected === o && !typing} disabled={pending} onClick={() => { setTyping(false); choose(o) }} className={chip(selected === o && !typing, true)}>
            {selected === o && !typing ? tick(16, 3) : null}
            {o}
          </button>
        ))}
        <button type="button" aria-pressed={typing} onClick={() => setTyping(true)} className={chip(typing, false)}>Type it</button>
      </div>
      {typing ? (
        <span className="flex gap-2">
          <input aria-label={`What question ${n} says`} value={text} onChange={(e) => setText(e.target.value)} className="h-11 min-w-0 flex-1 rounded-12 border border-muted-2 bg-card px-3 text-[16px] outline-none focus-visible:border-2 focus-visible:border-ink" />
          <button type="button" disabled={pending || !text.trim()} onClick={() => choose(text)} className="h-11 cursor-pointer rounded-12 border-none bg-ink px-4 text-[15px] font-semibold text-white">Use this</button>
        </span>
      ) : null}
      {error ? <p role="alert" className="m-0 text-[14px] text-coral-text">{error}</p> : null}
      {selected && verdict ? (
        <p className="m-0 flex items-center gap-2 text-[15px]">
          <span className="flex size-6 flex-none items-center justify-center rounded-pill bg-soft-4 text-ink">{tick(14, 3)}</span>
          {verdict.correct
            ? `${selected} matches the key. Question ${n} gets ${verdict.mark} mark${verdict.mark === 1 ? '' : 's'}.`
            : `${selected} does not match the key. Question ${n} gets 0 marks.`}
        </p>
      ) : null}
    </section>
  )
}

export function ConfirmButton({ classId, paperId, name, disabled }: { classId: string; paperId: string; name: string; disabled: boolean }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  return (
    <>
      {error ? <p role="alert" className="m-0 text-center text-[14px] text-coral-text">{error}</p> : null}
      <button
        type="button"
        disabled={pending || disabled}
        onClick={() =>
          start(async () => {
            const res = await confirmPaper(classId, paperId)
            if (!res.ok) return setError(res.message)
            router.push(`/t/${classId}`)
          })
        }
        className="flex h-[52px] cursor-pointer items-center justify-center gap-2 rounded-14 border-none bg-ink text-[17px] font-semibold text-white disabled:opacity-50"
      >
        {tick(20, 2.2)}
        Confirm {name}&apos;s paper
      </button>
    </>
  )
}
