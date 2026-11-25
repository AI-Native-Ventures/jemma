'use client'

import { useRefreshPoll } from '@/lib/use-refresh-poll'

/** Looks again every 3 seconds while PayFast's notice of the payment is on its way. */
export function Waiting() {
  useRefreshPoll(3000, true)
  return null
}
