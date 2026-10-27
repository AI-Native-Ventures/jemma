'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'

const HOLD_MS = 2000

/** Press and hold for 2 seconds so little fingers don't open the grown-up view by accident. */
export function HoldToOpen({ href }: { href: string }) {
  const router = useRouter()
  const [holding, setHolding] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const start = () => {
    if (timer.current) return
    setHolding(true)
    timer.current = setTimeout(() => router.push(href), HOLD_MS)
  }
  const stop = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    setHolding(false)
  }
  return (
    <button
      type="button"
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && start()}
      onKeyUp={stop}
      onContextMenu={(e) => e.preventDefault()}
      className="relative flex size-[132px] cursor-pointer touch-none flex-col items-center justify-center gap-1 rounded-pill border-0 bg-ink p-0 text-white select-none"
    >
      <style>{`@keyframes p27-hold{from{stroke-dashoffset:383}to{stroke-dashoffset:0}}`}</style>
      <svg width="132" height="132" viewBox="0 0 132 132" aria-hidden="true" className="absolute inset-0">
        <circle cx="66" cy="66" r="61" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="6" />
        {holding ? (
          <circle cx="66" cy="66" r="61" fill="none" stroke="#FF6A4D" strokeWidth="6" strokeLinecap="round" strokeDasharray="383" transform="rotate(-90 66 66)" style={{ animation: `p27-hold ${HOLD_MS}ms linear forwards` }} />
        ) : (
          <path d="M66 5a61 61 0 0 1 52.8 30.5" fill="none" stroke="#FF6A4D" strokeWidth="6" strokeLinecap="round" />
        )}
      </svg>
      <span className="text-[17px] leading-[1.2] font-semibold">Press and hold</span>
      <span className="text-[13px] text-[#C9C6DA]">to see how it went</span>
    </button>
  )
}
