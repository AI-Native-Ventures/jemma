'use client'

import { useState } from 'react'

export function PhotoViewer({ url, crop, label }: { url: string | null; crop: { x: number; y: number; w: number; h: number } | null; label: string | null }) {
  const [zoom, setZoom] = useState(1)
  const [turn, setTurn] = useState(0)
  return (
    <div className="relative mt-1.5 min-h-0 flex-1 overflow-auto bg-[#6E665D] shadow-[inset_0_0_80px_rgba(0,0,0,0.5)]">
      {url ? (
        <div className="relative mx-auto my-4 w-[calc(100%-32px)] origin-top transition-transform" style={{ width: `calc(${zoom * 100}% - 32px)`, transform: `rotate(${turn}deg)` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="Paper as snapped" className="block h-auto w-full shadow-[0_10px_24px_rgba(0,0,0,0.35)]" />
          {crop ? (
            <>
              <span aria-hidden="true" className="absolute rounded-[2px] outline-[3px] outline-offset-2 outline-coral" style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${crop.h * 100}%` }} />
              {label ? (
                <span className="absolute rounded-pill bg-coral px-2 py-0.5 text-[12px] font-bold text-ink" style={{ left: `${(crop.x + crop.w) * 100}%`, top: `${crop.y * 100}%`, marginLeft: 8 }}>{label}</span>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
      <span className="sticky right-3 bottom-3 float-right mr-3 mb-3 flex gap-1.5">
        <button type="button" aria-label="Zoom in" onClick={() => setZoom((z) => (z >= 2.5 ? 1 : z + 0.5))} className="flex size-11 cursor-pointer items-center justify-center rounded-pill border-none bg-[rgba(18,16,34,0.72)] p-0 text-white">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.4-4.4M11 8.5v5M8.5 11h5" /></svg>
        </button>
        <button type="button" aria-label="Rotate" onClick={() => setTurn((t) => (t + 90) % 360)} className="flex size-11 cursor-pointer items-center justify-center rounded-pill border-none bg-[rgba(18,16,34,0.72)] p-0 text-white">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66" /><path d="M20 4v4.5h-4.5" /></svg>
        </button>
      </span>
    </div>
  )
}
