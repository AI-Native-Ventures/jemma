'use client'

import { useEffect, useState } from 'react'

/**
 * The sentence for a start time. With a clock (`now`, the browser's) it says "today at 09:14", or the day and the time. Without one it
 * says no day and no time: the server does not know the judge's time zone, so it must not guess a clock time.
 */
export function startedSentence(iso: string, now: Date | null): string {
  if (!now) return 'Your copy started.'
  const d = new Date(iso)
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const today = d.toDateString() === now.toDateString()
  const when = today ? `today at ${time}` : `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} at ${time}`
  return `Your copy started ${when}.`
}

/**
 * "Your copy started today at 09:14." in the judge's own clock. The server renders the sentence without a time, and the browser adds
 * the time once it has mounted, with its own clock and time zone (nothing is hard-coded: a judge abroad reads their own clock).
 */
export function StartedAt({ iso }: { iso: string }) {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => setNow(new Date()), [])
  return <span>{startedSentence(iso, now)}</span>
}
