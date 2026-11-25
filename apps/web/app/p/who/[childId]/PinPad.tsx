'use client'

import { useState, useTransition } from 'react'
import { enterAsChild } from '../actions'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

/** The PIN pad of "Who's learning?": four dots, ten big keys and Go. A child with no PIN gets one Start button instead. */
export function PinPad({ childId, hasPin }: { childId: string; hasPin: boolean }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const go = (value: string) =>
    start(async () => {
      setError(null)
      const res = await enterAsChild(childId, value)
      if (res && !res.ok) {
        setError(res.message)
        setPin('')
      }
    })
  const key = 'flex min-h-[68px] cursor-pointer items-center justify-center rounded-20 border border-line bg-card px-2 text-[28px] font-bold text-ink disabled:opacity-50'
  if (!hasPin) {
    return (
      <button type="button" disabled={pending} onClick={() => go('')} className="flex min-h-[68px] w-full cursor-pointer items-center justify-center rounded-20 border-0 bg-gold px-5 text-[22px] font-bold text-ink disabled:opacity-60">
        Start
      </button>
    )
  }
  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-center gap-4" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`size-5 rounded-pill border-2 ${i < pin.length ? 'border-green bg-green' : 'border-muted-2 bg-card'}`} />
        ))}
      </div>
      <p className="sr-only" aria-live="polite">
        {pin.length} of 4 digits typed
      </p>
      {error ? (
        <p role="alert" className="m-0 text-center text-[16px] font-semibold text-red-text">
          {error}
        </p>
      ) : null}
      <div className="grid grid-cols-3 gap-3">
        {KEYS.map((k) => (
          <button key={k} type="button" className={key} disabled={pending || pin.length >= 4} onClick={() => setPin((p) => (p.length < 4 ? p + k : p))}>
            {k}
          </button>
        ))}
        <button type="button" className={`${key} text-[17px]`} disabled={pending || pin.length === 0} onClick={() => setPin((p) => p.slice(0, -1))} aria-label="Delete a digit">
          Back
        </button>
        <button type="button" className={key} disabled={pending || pin.length >= 4} onClick={() => setPin((p) => (p.length < 4 ? `${p}0` : p))}>
          0
        </button>
        <button type="button" className={`${key} border-0 bg-green text-[20px] text-white`} disabled={pending || pin.length !== 4} onClick={() => go(pin)}>
          Go
        </button>
      </div>
    </div>
  )
}
