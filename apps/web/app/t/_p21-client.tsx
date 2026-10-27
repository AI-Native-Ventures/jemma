'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'
import { Sheet } from '@/components/ui'

/** The small sheet behind links to features that come after the challenge. */
export function ComingSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Coming after the challenge" description="This part of Jemma is not in this version yet.">
      <button type="button" onClick={onClose} className="flex h-[52px] items-center justify-center rounded-14 bg-ink text-[17px] font-semibold text-white">
        Got it
      </button>
    </Sheet>
  )
}

/** Any control that opens the "Coming after the challenge" sheet. */
export function ComingButton({ className, style, children, ...rest }: { className?: string; style?: React.CSSProperties; children: ReactNode; 'aria-label'?: string; 'aria-pressed'?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className={className} style={style} onClick={() => setOpen(true)} {...rest}>
        {children}
      </button>
      <ComingSheet open={open} onClose={() => setOpen(false)} />
    </>
  )
}

/** Shares the class code with the phone's share sheet, or copies it. */
export function ShareButton({ code, className, children }: { code: string; className: string; children: ReactNode }) {
  const [copied, setCopied] = useState(false)
  async function share() {
    const text = `Link to my class on Jemma with the code ${code}`
    try {
      if (navigator.share) await navigator.share({ text })
      else {
        await navigator.clipboard.writeText(code)
        setCopied(true)
        setTimeout(() => setCopied(false), 1800)
      }
    } catch {
      // The person closed the share sheet.
    }
  }
  return (
    <button type="button" onClick={share} className={className} aria-live="polite">
      {copied ? 'Copied' : children}
    </button>
  )
}
