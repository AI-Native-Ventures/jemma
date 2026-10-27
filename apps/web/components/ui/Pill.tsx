import type { ReactNode } from 'react'

export type PillTone = 'soft' | 'coral' | 'ink' | 'danger' | 'quiet'

const tones: Record<PillTone, string> = {
  soft: 'bg-soft-4 text-ink',
  coral: 'bg-coral-tint text-ink',
  ink: 'bg-ink text-white',
  danger: 'bg-[#FFEDE8] text-coral-text',
  quiet: 'bg-soft-2 text-body',
}

export type PillProps = {
  tone?: PillTone
  icon?: ReactNode
  className?: string
  children: ReactNode
}

/** Fully rounded label, for example "12 minutes" or "With a diagram". */
export function Pill({ tone = 'soft', icon, className = '', children }: PillProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 leading-[normal] rounded-pill px-3 py-[7px] text-[15px] font-semibold ${tones[tone]} ${className}`}
    >
      {icon}
      {children}
    </span>
  )
}
