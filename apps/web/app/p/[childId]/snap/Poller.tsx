'use client'

import { useRefreshPoll } from '@/lib/use-refresh-poll'

/** Refreshes the server data 2 s after the last answer came back, while `active`. */
export function Poller({ active }: { active: boolean }) {
  useRefreshPoll(2000, active)
  return null
}
