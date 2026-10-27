'use client'

import { useState, type ReactNode } from 'react'

const ROTATE_PATH = 'M20 12a8 8 0 1 1-2.34-5.66'

/**
 * The photo frame. Phone: just the picture and its zoom link. Laptop (board `laptop-teacher-review`): taller, with an
 * inner shadow and a Rotate button next to Zoom. The crop box turns with the photo because it is a child of it.
 */
export function PhotoStage({ children, zoom }: { children: ReactNode; zoom: ReactNode }) {
  const [turns, setTurns] = useState(0)
  return (
    <div className="relative h-[262px] overflow-hidden rounded-18 bg-[#6E665D] lg:h-[720px] lg:rounded-20">
      <div className="absolute inset-0 transition-transform" style={{ transform: turns ? `rotate(${turns * 90}deg)` : undefined }}>
        {children}
      </div>
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 hidden shadow-[inset_0_0_70px_rgba(0,0,0,0.35)] lg:block" />
      <span className="absolute right-2.5 bottom-2.5 flex gap-1.5 lg:right-3 lg:bottom-3">
        {zoom}
        <button
          type="button"
          aria-label="Rotate"
          onClick={() => setTurns((t) => (t + 1) % 4)}
          className="hidden size-11 cursor-pointer items-center justify-center rounded-pill border-none bg-[rgba(18,16,34,0.72)] p-0 text-white lg:flex"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ROTATE_PATH} /><path d="M20 4v4.5h-4.5" /></svg>
        </button>
      </span>
    </div>
  )
}
