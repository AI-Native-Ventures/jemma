import Link from 'next/link'
import type { ReactNode } from 'react'
import { GemIcon } from '@/components/ui'

export const hand = "Kalam, 'Comic Sans MS', cursive"

/** "2", "2 and 4", "1, 2 and 4". */
export function joinNumbers(ns: number[]): string {
  if (ns.length < 2) return ns.join('')
  return `${ns.slice(0, -1).join(', ')} and ${ns[ns.length - 1]}`
}

export const lower = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s)

export const CAMERA_PATH = 'M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.4-2h5l1.4 2h1.6A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z'

export function CameraGlyph({ color = 'currentColor' }: { color?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={CAMERA_PATH} />
      <circle cx="12" cy="12.5" r="3.5" />
    </svg>
  )
}

/** The board's 5-per-bullet gem line. */
export function GemLine({ children, size = 11, mt = 5, gap = 10, className = '' }: { children: ReactNode; size?: number; mt?: number; gap?: number; className?: string }) {
  return (
    <li className={`flex text-[15px] leading-[1.45] ${className}`} style={{ gap }}>
      <GemIcon size={size} className="flex-none" style={{ marginTop: mt }} />
      {children}
    </li>
  )
}

/**
 * Full-screen frame of the reading, check, error and saved boards: their own back or close header, no tab bar.
 * Covers the space header and tab bar the same way the camera does.
 */
export function FlowShell({
  href, icon = 'back', label, title, children,
}: { href: string; icon?: 'back' | 'close'; label: string; title: string; children: ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-ground text-ink"
      style={{ fontFamily: 'var(--font-outfit), system-ui, sans-serif' }}
    >
      <div className="mx-auto flex min-h-full max-w-[560px] flex-col leading-[normal]">
        <header className="flex items-center gap-1 pb-1.5 pl-2 pr-3 pt-2.5">
          <Link href={href} aria-label={icon === 'back' ? 'Back to the camera' : 'Close'} className="flex size-11 flex-none items-center justify-center rounded-12 text-ink">
            <svg width={icon === 'back' ? 24 : 22} height={icon === 'back' ? 24 : 22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={icon === 'back' ? 'm15 6-6 6 6 6' : 'M6 6l12 12M18 6 6 18'} />
            </svg>
          </Link>
          <span className="flex min-w-0 flex-1 flex-col leading-[1.2]">
            <span className="text-[13px] text-body">{label}</span>
            <span className="text-[17px] font-bold">{title}</span>
          </span>
        </header>
        {children}
      </div>
    </div>
  )
}
