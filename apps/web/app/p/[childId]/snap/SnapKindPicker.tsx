'use client'

import { IconLabel } from '@/components/ui/IconLabel'
import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import type { SnapKind } from '@/lib/data/p32'

const stroke = { fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' } as const

const KINDS: { kind: SnapKind; title: string; hint: string; icon: ReactNode }[] = [
  {
    kind: 'test',
    title: 'Test',
    hint: 'Marked or not yet',
    icon: (
      <>
        <rect x="5" y="4.5" width="14" height="16" rx="2" />
        <path d="M9 4.5V3.8a.8.8 0 0 1 .8-.8h4.4a.8.8 0 0 1 .8.8v.7" />
        <path d="m8.5 11 1.5 1.5 3-3M8.5 16.5h7" />
      </>
    ),
  },
  {
    kind: 'homework',
    title: 'Homework',
    hint: 'A worksheet or exercise book page',
    icon: (
      <>
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5M9 13h6M9 17h4" />
      </>
    ),
  },
  {
    kind: 'textbook',
    title: 'Textbook page',
    hint: 'So lessons use her own book',
    icon: (
      <>
        <path d="M4 5.5C4 4.7 4.7 4 5.5 4H10c1.1 0 2 .9 2 2v14c0-1.1-.9-2-2-2H4z" />
        <path d="M20 5.5c0-.8-.7-1.5-1.5-1.5H14c-1.1 0-2 .9-2 2v14c0-1.1.9-2 2-2h6z" />
      </>
    ),
  },
  {
    kind: 'report',
    title: 'Report card',
    hint: 'Term marks from school',
    icon: (
      <>
        <rect x="4" y="3.5" width="16" height="17" rx="2" />
        <path d="M8 8h8M8 12h5M8 16h3" />
        <path d="M15 14.5l1.5 1.5 2.5-3" />
      </>
    ),
  },
]

const tick = (size: number, width: number, color = 'currentColor') => (
  <svg width={size} height={size} viewBox="0 0 24 24" stroke={color} strokeWidth={width} {...stroke} aria-hidden="true">
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
)

/** The four kinds, the subject and the "Take the photos" button of parent-snap-type. */
export function SnapKindPicker({ childId }: { childId: string }) {
  const [picked, setPicked] = useState<SnapKind>('homework')
  return (
    <>
      <fieldset className="m-0 grid grid-cols-2 gap-2.5 border-none p-0">
        <legend className="sr-only">Kind of page</legend>
        {KINDS.map((k) => {
          const on = picked === k.kind
          return (
            <button
              key={k.kind}
              type="button"
              aria-pressed={on}
              onClick={() => setPicked(k.kind)}
              className={`relative flex min-h-[132px] flex-col items-start gap-2.5 rounded-18 bg-card p-4 text-left text-ink ${on ? 'border-2 border-ink' : 'border border-line'}`}
            >
              {on ? (
                <span className="absolute right-3 top-3 flex size-6 items-center justify-center rounded-full bg-ink">{tick(14, 3, '#FFFFFF')}</span>
              ) : null}
              <svg width="28" height="28" viewBox="0 0 24 24" stroke="#1F1D36" strokeWidth="1.7" {...stroke} aria-hidden="true">
                {k.icon}
              </svg>
              <span className="flex flex-col gap-0.5">
                <span className="text-[17px] font-semibold">{k.title}</span>
                <span className="text-[13px] leading-[1.35] text-body">{k.hint}</span>
              </span>
            </button>
          )
        })}
      </fieldset>

      <fieldset className="m-0 flex flex-col gap-2.5 border-none p-0">
        <legend className="mb-2.5 p-0 text-[16px] font-semibold">Subject</legend>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-pressed="true"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border-none bg-ink px-3.5 text-[15px] font-medium text-white"
          >
            {tick(14, 2.6)}
            Mathematics
          </button>
          <span className="text-[14px] text-body">More subjects coming soon</span>
        </div>
      </fieldset>

      <p className="m-0 flex items-start gap-2.5 rounded-14 bg-[#EEEDF5] px-3.5 py-3 text-[14px] leading-[1.45]">
        <svg width="18" height="18" viewBox="0 0 24 24" stroke="#1F1D36" strokeWidth="1.8" {...stroke} aria-hidden="true" className="mt-px flex-none">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
        </svg>
        One photo per page. Lay it flat in good light. You&apos;ll check what Jemma read before anything is saved.
      </p>

      <div className="flex-1" />
      <Link
        href={`/p/${childId}/snap/photo?kind=${picked}`}
        className="flex min-h-14 items-center justify-center gap-2 rounded-14 bg-ink px-5 py-3 text-center text-[17px] font-semibold text-balance text-white no-underline"
      >
        <IconLabel gap={8} icon={<svg width="20" height="20" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" {...stroke} aria-hidden="true">
          <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.4-2h5l1.4 2h1.6A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" />
          <circle cx="12" cy="12.5" r="3.5" />
        </svg>}>
          Take the photos
        </IconLabel>
      </Link>
    </>
  )
}
