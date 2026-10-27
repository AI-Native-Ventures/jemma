'use client'

import { useEffect, useId } from 'react'
import type { ReactNode } from 'react'

export type SheetProps = {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children?: ReactNode
}

/** Bottom sheet from the boards: dim scrim, grabber, 28 px top radius. */
export function Sheet({ open, onClose, title, description, children }: SheetProps) {
  const titleId = useId()
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default border-0 bg-ink/50"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex leading-[normal] w-full max-w-[560px] flex-col gap-3.5 rounded-t-[28px] bg-ground px-5 pt-2.5 pb-[30px] shadow-[0_-10px_30px_rgba(31,29,54,0.18)]"
      >
        <span aria-hidden="true" className="h-[5px] w-11 self-center rounded-pill bg-edge" />
        <div className="flex flex-col gap-1">
          <h2 id={titleId} className="m-0 text-[24px] leading-[1.2] font-bold tracking-[-0.01em]">
            {title}
          </h2>
          {description ? <p className="m-0 text-[16px] text-body">{description}</p> : null}
        </div>
        {children}
      </section>
    </div>
  )
}
