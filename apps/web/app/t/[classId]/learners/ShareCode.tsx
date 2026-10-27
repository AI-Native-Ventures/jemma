'use client'

import { useState } from 'react'

/** Class code card; Share copies the code (or opens the phone's share sheet). */
export function ShareCode({ code }: { code: string }) {
  const [done, setDone] = useState(false)
  async function share() {
    try {
      if (navigator.share) await navigator.share({ text: `Link with my class on Jemma: ${code}` })
      else await navigator.clipboard.writeText(code)
      setDone(true)
    } catch {
      // The person closed the share sheet.
    }
  }
  return (
    <section aria-label="Class code" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 12px 12px 16px', borderRadius: 18, border: '1.5px dashed #8C89A3' }}>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 14, color: '#5D5A73' }}>Parents link with this code</span>
        <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: '0.08em' }}>{code}</span>
      </span>
      <button type="button" onClick={share} style={{ height: 44, padding: '0 16px', borderRadius: 12, border: '1.5px solid #1F1D36', background: '#FFFFFF', color: '#1F1D36', fontSize: 15, fontWeight: 600, flex: 'none', cursor: 'pointer' }}>
        {done ? 'Copied' : 'Share'}
      </button>
    </section>
  )
}
