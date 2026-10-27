import type { ElementType, HTMLAttributes } from 'react'

export type CardTone = 'plain' | 'coral' | 'ink'
export type CardRadius = 14 | 18 | 20 | 22 | 26

const tones: Record<CardTone, string> = {
  plain: 'bg-card border border-line',
  coral: 'bg-coral-wash border border-[#FFC9BB]',
  ink: 'bg-ink text-white border border-ink',
}

const radii: Record<CardRadius, string> = {
  14: 'rounded-14',
  18: 'rounded-18',
  20: 'rounded-20',
  22: 'rounded-[22px]',
  26: 'rounded-[26px]',
}

export type CardProps = HTMLAttributes<HTMLElement> & {
  as?: ElementType
  tone?: CardTone
  radius?: CardRadius
  /** Soft lift used on the child "Tonight" card. */
  raised?: boolean
}

export function Card({ as: Tag = 'div', tone = 'plain', radius = 18, raised, className = '', ...rest }: CardProps) {
  const shadow = raised ? 'shadow-[0_8px_24px_rgba(31,29,54,0.06)]' : ''
  return <Tag className={`flex flex-col leading-[normal] p-4 ${tones[tone]} ${radii[radius]} ${shadow} ${className}`} {...rest} />
}
