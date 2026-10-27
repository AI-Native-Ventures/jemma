'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

/** Refreshes the server data every 2 s while `active`. */
export function Poller({ active }: { active: boolean }) {
  const router = useRouter()
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => router.refresh(), 2000)
    return () => clearInterval(id)
  }, [active, router])
  return null
}
