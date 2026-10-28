'use client'

import Link, { useLinkStatus } from 'next/link'
import { useFormStatus } from 'react-dom'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'coral' | 'link'
export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl'

type Common = {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode
  className?: string
  /** Shows the spinner and blocks taps. A submit button inside a running server action form does this by itself. */
  pending?: boolean
  children: ReactNode
}

export type ButtonProps = Common &
  (
    | ({ href: string } & { onClick?: undefined; type?: undefined; disabled?: undefined })
    | ({ href?: undefined } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className'>)
  )

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-ink text-white font-semibold',
  secondary: 'border-[1.5px] border-ink bg-card text-ink font-semibold',
  coral: 'bg-coral text-ink font-bold',
  link: 'min-h-11 text-ink font-semibold underline underline-offset-[3px]',
}

// Heights and radii measured from the boards: 46 (laptop actions), 52 (forms),
// 60 (Done), 68 (Start).
const sizes: Record<ButtonSize, string> = {
  sm: 'h-[46px] rounded-14 px-[18px] text-[15px]',
  md: 'h-[52px] rounded-14 px-4 text-[17px]',
  lg: 'h-[60px] rounded-18 px-4 text-[19px] !font-bold',
  xl: 'h-[68px] rounded-20 px-4 text-[24px]',
}

/** Small coral spinner pinned to the right edge, so the label and the button width do not move. */
export function Spinner() {
  return (
    <span role="status" aria-label="Working" className="pointer-events-none absolute right-3 top-1/2 -mt-[9px] flex">
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" className="animate-spin">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
        <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </span>
  )
}

function LinkSpinner() {
  const { pending } = useLinkStatus()
  return pending ? <Spinner /> : null
}

/**
 * A plain button that shows it is working. Pending while its form's server action runs (a submit button), or when `pending` is true.
 * Keeps its own classes and styles, so it can stand in for a hand-styled `<button>`.
 */
export function PendingButton({ pending: pendingProp, disabled, className = '', children, type, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { pending?: boolean }) {
  const form = useFormStatus()
  const pending = Boolean(pendingProp) || (type === 'submit' && form.pending)
  return (
    <button {...rest} type={type} className={`relative ${className}`} disabled={disabled || pending} aria-busy={pending || undefined}>
      {children}
      {pending ? <Spinner /> : null}
    </button>
  )
}

export function Button(props: ButtonProps) {
  const { variant = 'primary', size = 'md', icon, className = '', children } = props
  const base = 'flex leading-[normal] items-center justify-center gap-2 no-underline disabled:opacity-50'
  const cls =
    variant === 'link' ? `${base} ${variants.link} ${className}` : `${base} ${sizes[size]} ${variants[variant]} ${size === 'xl' ? 'gap-3' : ''} ${className}`
  const content = (
    <>
      {icon}
      {children}
    </>
  )
  if (props.href !== undefined) {
    return (
      <Link href={props.href} className={`relative ${cls}`}>
        {content}
        <LinkSpinner />
      </Link>
    )
  }
  const { variant: _v, size: _s, icon: _i, className: _c, children: _ch, href: _h, type = 'button', pending, ...rest } = props
  return (
    <PendingButton type={type} pending={pending} className={`${cls} cursor-pointer`} {...rest}>
      {content}
    </PendingButton>
  )
}
