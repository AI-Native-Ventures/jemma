'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useRef, useState } from 'react'

type State = 'idle' | 'loading' | 'done'

/** A request that is a page load or a server action. Prefetches run in the background and never show. */
function isTracked(input: RequestInfo | URL, init?: RequestInit): boolean {
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
  if (headers.get('Next-Router-Prefetch')) return false
  return headers.has('RSC') || headers.has('Next-Action')
}

/** True for a plain tap on a link that goes to another page of this app. */
function isInAppNavigation(e: MouseEvent): boolean {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false
  const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
  if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return false
  const url = new URL(a.href, window.location.href)
  if (url.origin !== window.location.origin) return false
  return url.pathname + url.search !== window.location.pathname + window.location.search
}

function Bar() {
  const pathname = usePathname()
  const search = useSearchParams().toString()
  const [state, setState] = useState<State>('idle')
  const loading = useRef(false)
  const inflight = useRef(0)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  const start = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
    loading.current = true
    setState('loading')
    // Safety net: never leave the bar running if a navigation is cancelled.
    timers.current.push(setTimeout(finish, 20_000))
  }
  const finish = () => {
    if (!loading.current) return
    loading.current = false
    timers.current.forEach(clearTimeout)
    setState('done')
    timers.current = [setTimeout(() => setState('idle'), 400)]
  }

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (isInAppNavigation(e)) start()
    }
    document.addEventListener('click', onClick, true)

    const original = window.fetch
    window.fetch = function (input, init) {
      if (!isTracked(input, init)) return original.call(this, input, init)
      inflight.current += 1
      start()
      const settle = () => {
        inflight.current -= 1
        if (inflight.current <= 0) {
          inflight.current = 0
          finish()
        }
      }
      return original.call(this, input, init).then(
        (r) => (settle(), r),
        (err) => (settle(), Promise.reject(err)),
      )
    }
    return () => {
      document.removeEventListener('click', onClick, true)
      window.fetch = original
      timers.current.forEach(clearTimeout)
    }
    // start and finish only touch refs and the stable state setter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The new page rendered: the path or query changed.
  useEffect(() => {
    finish()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, search])

  return (
    <div
      data-nav-progress
      data-state={state}
      role="progressbar"
      aria-hidden={state === 'idle'}
      className="pointer-events-none fixed left-0 top-0 z-[9999] h-[2px] w-full origin-left bg-coral"
      style={{
        transform: state === 'idle' ? 'scaleX(0)' : state === 'loading' ? 'scaleX(0.85)' : 'scaleX(1)',
        opacity: state === 'done' ? 0 : state === 'idle' ? 0 : 1,
        transition:
          state === 'loading'
            ? 'transform 8s cubic-bezier(0.1, 0.8, 0.2, 1), opacity 60ms linear'
            : state === 'done'
              ? 'transform 150ms ease-out, opacity 250ms ease-out 150ms'
              : 'none',
      }}
    />
  )
}

/** A 2 px coral bar fixed at the top of the screen. Starts on any in-app link tap, router push or server action and ends when the new page renders. */
export function NavProgress() {
  return (
    <Suspense fallback={null}>
      <Bar />
    </Suspense>
  )
}
