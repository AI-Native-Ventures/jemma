'use client'

import { useCallback, useEffect, useState } from 'react'

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

const DISMISSED_KEY = 'jemma-install-dismissed'

const iconProps = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: '#1F1D36',
  strokeWidth: 1.9,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

/** Registers the app-shell service worker. Mounted once by a layout. */
export function RegisterServiceWorker() {
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
  }, [])
  return null
}

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

/**
 * Bottom sheet from board `install-prompt`: asks to put Jemma on the home screen.
 * Shows itself when the browser offers an install (Android) or on an iPhone that has not installed it yet,
 * and not again once dismissed. `forceOpen` always shows it (previews).
 */
export function InstallPrompt({ forceOpen = false }: { forceOpen?: boolean }) {
  const [open, setOpen] = useState(forceOpen)
  const [offer, setOffer] = useState<InstallEvent | null>(null)

  useEffect(() => {
    if (forceOpen) return
    if (isStandalone() || readDismissed()) return
    const onOffer = (e: Event) => {
      e.preventDefault()
      setOffer(e as InstallEvent)
      setOpen(true)
    }
    window.addEventListener('beforeinstallprompt', onOffer)
    if (/iPhone|iPad|iPod/.test(navigator.userAgent)) setOpen(true)
    return () => window.removeEventListener('beforeinstallprompt', onOffer)
  }, [forceOpen])

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(DISMISSED_KEY, '1')
    } catch {}
    setOpen(false)
  }, [])

  const showMe = useCallback(async () => {
    if (offer) {
      await offer.prompt()
      await offer.userChoice
      setOffer(null)
      dismiss()
    }
  }, [offer, dismiss])

  if (!open) return null
  return (
    <>
      <span aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(31,29,54,0.5)' }} />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="inst"
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 50,
          margin: '0 auto',
          maxWidth: 440,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          padding: '10px 20px 30px',
          background: '#FFFFFF',
          borderRadius: '28px 28px 0 0',
          boxShadow: '0 -10px 30px rgba(31,29,54,0.18)',
        }}
      >
        <span aria-hidden="true" style={{ alignSelf: 'center', width: 44, height: 5, borderRadius: 999, background: '#CFCDDC' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 6 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/jemma-app-icon.svg" alt="" style={{ width: 56, height: 56, display: 'block', borderRadius: 14 }} />
          <h2 id="inst" style={{ margin: 0, fontSize: 23, lineHeight: 1.2, fontWeight: 600, letterSpacing: '-0.01em' }}>
            Put Jemma on your home screen
          </h2>
        </div>
        <p style={{ margin: 0, fontSize: 16, lineHeight: 1.5, color: '#5D5A73' }}>It opens like an app and keeps you signed in.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Row
            title="iPhone"
            detail="Tap Share, then Add to Home Screen"
            icon={
              <svg {...iconProps}>
                <path d="M12 15V3.5M7.5 8 12 3.5 16.5 8" />
                <path d="M5 12.5v6a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-6" />
              </svg>
            }
          />
          <Row
            title="Android"
            detail="Tap Install when Chrome asks"
            icon={
              <svg {...iconProps}>
                <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
                <path d="M10.5 18.5h3" />
              </svg>
            }
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
          <button
            type="button"
            onClick={showMe}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 52, borderRadius: 14, border: 'none', background: '#1F1D36', color: '#FFFFFF', fontSize: 17, fontWeight: 600, cursor: 'pointer' }}
          >
            Show me how
          </button>
          <button
            type="button"
            onClick={dismiss}
            style={{ alignSelf: 'center', display: 'flex', alignItems: 'center', minHeight: 44, padding: '0 12px', border: 'none', background: 'transparent', fontSize: 16, fontWeight: 600, color: '#1F1D36', textDecoration: 'underline', textUnderlineOffset: 3, cursor: 'pointer' }}
          >
            Not now
          </button>
        </div>
      </section>
    </>
  )
}

function Row({ title, detail, icon }: { title: string; detail: string; icon: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 16, background: '#F4F3F8' }}>
      <span aria-hidden="true" style={{ width: 36, height: 36, flex: 'none', borderRadius: 12, background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 1, lineHeight: 1.35 }}>
        <span style={{ fontSize: 15, fontWeight: 600 }}>{title}</span>
        <span style={{ fontSize: 14, color: '#5D5A73' }}>{detail}</span>
      </span>
    </div>
  )
}
