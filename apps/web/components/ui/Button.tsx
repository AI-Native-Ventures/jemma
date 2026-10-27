import Link from 'next/link'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'coral' | 'link'
export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl'

type Common = {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode
  className?: string
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
      <Link href={props.href} className={cls}>
        {content}
      </Link>
    )
  }
  const { variant: _v, size: _s, icon: _i, className: _c, children: _ch, href: _h, type = 'button', ...rest } = props
  return (
    <button type={type} className={`${cls} cursor-pointer`} {...rest}>
      {content}
    </button>
  )
}
