'use client'

/** "today at 09:14" in the judge's own clock. Server and browser may differ, so the browser's text wins. */
export function StartedAt({ iso }: { iso: string }) {
  const d = new Date(iso)
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const today = d.toDateString() === new Date().toDateString()
  const when = today ? `today at ${time}` : `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} at ${time}`
  return <span suppressHydrationWarning>{`Your copy started ${when}.`}</span>
}
