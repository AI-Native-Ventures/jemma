import type { ReactNode } from 'react'

const chipClass = 'inline-flex items-center gap-1.5 rounded-pill bg-soft-4 px-3 py-[7px] text-[15px] font-semibold'
const svg = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const

export function Chip({ children }: { children: ReactNode }) {
  return <span className={chipClass}>{children}</span>
}

export function MinutesChip({ minutes }: { minutes: number }) {
  return (
    <Chip>
      <svg {...svg}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>
      {minutes} minutes
    </Chip>
  )
}

export const FORMAT_CHIP = {
  diagram: {
    label: 'With a diagram',
    icon: (
      <svg {...svg}><rect x="3.5" y="5" width="17" height="5" rx="1" /><rect x="3.5" y="14" width="17" height="5" rx="1" /><path d="M12 5v5M8 14v5M12 14v5M16 14v5" /></svg>
    ),
  },
  reading: {
    label: 'Reading cards',
    icon: (
      <svg {...svg}><path d="M4 5.5C4 4.7 4.7 4 5.5 4H10c1.1 0 2 .9 2 2v14c0-1.1-.9-2-2-2H4z" /><path d="M20 5.5c0-.8-.7-1.5-1.5-1.5H14c-1.1 0-2 .9-2 2v14c0-1.1.9-2 2-2h6z" /></svg>
    ),
  },
  audio: {
    label: 'Audio memo',
    icon: (
      <svg {...svg}><path d="M4 14v-2a8 8 0 0 1 16 0v2" /><rect x="3.5" y="14" width="4" height="6" rx="1.5" /><rect x="16.5" y="14" width="4" height="6" rx="1.5" /></svg>
    ),
  },
} as const

export function FormatChip({ format }: { format: keyof typeof FORMAT_CHIP }) {
  const f = FORMAT_CHIP[format]
  return (
    <Chip>
      {f.icon}
      {f.label}
    </Chip>
  )
}

export function ChevronRight() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1F1D36" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-none">
      <path d="m9 6 6 6-6 6" />
    </svg>
  )
}
