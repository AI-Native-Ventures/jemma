'use client'

import { useEffect, useState, type ReactNode } from 'react'

/**
 * The phone and laptop layouts are separate trees. The server sends both (CSS shows the right one, so there is no flash);
 * once hydrated, the one that does not match the viewport is removed, so the page holds a single copy of each text.
 */
export function Only({ at, children }: { at: 'phone' | 'laptop'; children: ReactNode }) {
  const [mode, setMode] = useState<'both' | 'phone' | 'laptop'>('both')
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const sync = () => setMode(mq.matches ? 'laptop' : 'phone')
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])
  if (mode !== 'both' && mode !== at) return null
  return <>{children}</>
}
