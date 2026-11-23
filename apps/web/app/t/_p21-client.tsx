'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'

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
