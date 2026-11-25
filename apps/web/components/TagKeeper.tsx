'use client'

import { useEffect } from 'react'

/**
 * P161: keeps the tags of an ad link (utm_source, utm_medium, utm_campaign) for 30 days in a cookie of Jemma's own, so a person who looks at the tour
 * first and signs up later is still counted for the ad they came by. Only the tags are kept; nothing is sent to any ad network.
 */
export function TagKeeper() {
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const t = new URLSearchParams()
    for (const k of ['utm_source', 'utm_medium', 'utm_campaign']) {
      const v = q.get(k)
      if (v) t.set(k, v.slice(0, 60))
    }
    if ([...t.keys()].length === 0) return
    document.cookie = `jemma_tags=${encodeURIComponent(t.toString())}; path=/; max-age=${30 * 24 * 60 * 60}; samesite=lax${window.location.protocol === 'https:' ? '; secure' : ''}`
  }, [])
  return null
}
