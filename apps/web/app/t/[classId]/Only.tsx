'use client'

import { useEffect, useState, type ReactNode } from 'react'

const LAPTOP = '(min-width: 1024px)'

/**
 * Renders its children only at the width they are drawn for, so the page holds one copy of each text
 * (a hidden twin would still answer text queries and confuse screen readers' find).
 * `phone` is server-rendered and hidden by CSS from 1024 up, then dropped once the width is known.
 * `laptop` appears once the width is known.
 */
export function Only({ on, children }: { on: 'phone' | 'laptop'; children: ReactNode }) {
  const [laptop, setLaptop] = useState<boolean | null>(null)
  useEffect(() => {
    const mq = window.matchMedia(LAPTOP)
    const sync = () => setLaptop(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])
  if (on === 'laptop') return laptop ? <>{children}</> : null
  if (laptop) return null
  return <div className="lg:hidden">{children}</div>
}
