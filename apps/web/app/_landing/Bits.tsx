import type { ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { Gem } from './Shot'

// The small parts every section of the landing page shares: the column, the room round a section, the headings, the bead hem and the two buttons.

/** The column of the page: 1280 px of words and pictures at most, with 24 px of room at each side. */
export const WRAP = 'mx-auto w-full max-w-[1328px] px-6'

/** The room above and under a section. */
export const BAND = 'py-12 sm:py-20 xl:py-28'

/** The heading of a section. */
export const H2 = 'm-0 text-[32px] leading-[1.08] font-bold tracking-[-0.02em] text-balance sm:text-[40px] lg:text-[50px] xl:text-[58px]'

/** The sentence beside or under the heading of a section. */
export const LEAD = 'm-0 text-[18px] leading-[1.5] text-body sm:text-[20px] lg:text-[22px] xl:text-[24px]'

/** The heading of a section, with the gold gem before its first word. The gem is only a picture. */
export function Title({ id, gem = true, className = '', children }: { id: string; gem?: boolean; className?: string; children: ReactNode }) {
  return (
    <h2 id={id} className={`${H2} ${className}`}>
      {gem ? <Gem className="mr-[0.3em] inline-block size-[0.4em] align-[0.1em]" /> : null}
      {children}
    </h2>
  )
}

/** Words that stay on one line, so a heading breaks where it reads well. */
export function Together({ children }: { children: ReactNode }) {
  return <span className="whitespace-nowrap">{children}</span>
}

/** An arrow to the right, after the words of a button or before a grade. Only a picture. */
export function Arrow({ size = 20, strokeWidth = 2.2, className = '' }: { size?: number; strokeWidth?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`flex-none ${className}`}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}

/** A small line drawing on the 24 grid of the app's icons (round caps, the colour of the words round it). Only a picture. */
export function Drawing({ size = 28, children }: { size?: number; children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-none">
      {children}
    </svg>
  )
}

const BEADS = ['#007749', '#FFB81C', '#E03C31', '#001489', '#161616', '#FFB81C'] as const

/**
 * The bead hem: one row of beads in the colours of the app, between two black lines, as wide as the page. It sits at the top of the page and at the
 * top of the green band. Only a picture. Each hem on a page needs its own `id` (the pattern is found by it).
 */
export function BeadHem({ id, className = '' }: { id: string; className?: string }) {
  return (
    <svg aria-hidden="true" width="100%" height="16" className={`block ${className}`}>
      <defs>
        <pattern id={id} x="0" y="2" width="72" height="12" patternUnits="userSpaceOnUse">
          <rect width="72" height="12" fill="#FFFFFF" />
          {BEADS.map((fill, i) => (
            <polygon key={i} points={`${12 * i + 6},0 ${12 * i + 12},6 ${12 * i + 6},12 ${12 * i},6`} fill={fill} />
          ))}
        </pattern>
      </defs>
      <rect x="0" y="0" width="100%" height="2" fill="#161616" />
      <rect x="0" y="2" width="100%" height="12" fill={`url(#${id})`} />
      <rect x="0" y="14" width="100%" height="2" fill="#161616" />
    </svg>
  )
}

/** Room on both buttons: at least 58 px high, 28 px at the sides, and a long label takes a second line instead of touching the edge. */
const BUTTON = '!h-auto min-h-[58px] flex-[1_1_200px] !rounded-18 !px-7 py-3 text-center !text-[18px] text-balance lg:min-h-16 lg:!text-[20px]'

/**
 * The two ways in: "Try a lesson" (the one gold button, no sign-up) and "Sign in". Side by side when there is room, one under the other on a
 * phone. On the green band "Sign in" is drawn in white.
 */
export function WaysIn({ onGreen = false }: { onGreen?: boolean }) {
  return (
    <div className="flex w-full max-w-[520px] flex-wrap gap-5">
      <Button href="/tour" variant="gold" className={BUTTON}>
        Try a lesson
        <Arrow />
      </Button>
      <Button href="/sign-in" variant="secondary" className={`${BUTTON} ${onGreen ? '!border-white !bg-transparent !text-white' : ''}`}>
        Sign in
      </Button>
    </div>
  )
}
