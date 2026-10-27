import Link from 'next/link'
import { BellIcon, ChevronDownIcon, GearIcon } from '../ui/icons'
import { DemoBadge } from './DemoBadge'

export type SpaceHeaderProps = {
  name: string
  subtitle: string
  switchHref: string
  settingsHref: string
  demo?: boolean
  /** Where the Demo badge goes (the "switch who you are" screen). */
  demoHref?: string
  notificationsHref?: string
  /** Unread count; the coral dot shows when above 0. */
  unread?: number
  /** First letter in a coral circle, as on the parent header. */
  avatar?: string
  /** Accessible name of the settings link. */
  settingsLabel?: string
}

/** Top bar of the teacher class space and the parent child space (phone). */
export function SpaceHeader({
  name,
  subtitle,
  switchHref,
  settingsHref,
  demo,
  demoHref = '/demo',
  notificationsHref = '/notifications',
  unread = 0,
  avatar,
  settingsLabel = 'Settings',
}: SpaceHeaderProps) {
  return (
    <header className={`flex items-center leading-[normal] justify-between gap-2 pt-2.5 pr-2.5 pb-1.5 lg:hidden ${avatar ? 'pl-3' : 'pl-4'}`}>
      <Link
        href={switchHref}
        aria-label={`Switch. Now showing ${name}`}
        className={`flex min-h-11 items-center rounded-12 px-1 text-ink no-underline ${avatar ? 'gap-2.5' : 'gap-1'}`}
      >
        {avatar ? (
          <span
            aria-hidden="true"
            className="flex size-[38px] flex-none items-center justify-center rounded-pill bg-coral-soft text-[16px] font-bold"
          >
            {avatar}
          </span>
        ) : null}
        <span className="flex flex-col leading-[1.15]">
          <span className="text-[19px] font-bold tracking-[-0.01em]">{name}</span>
          <span className="text-[13px] text-body">{subtitle}</span>
        </span>
        <ChevronDownIcon />
      </Link>
      <span className="flex items-center">
        {demo ? (
          <Link
            href={demoHref}
            aria-label="Demo: switch who you are"
            className="flex min-h-11 items-center px-1 text-ink no-underline"
          >
            <DemoBadge />
          </Link>
        ) : null}
        <Link
          href={notificationsHref}
          aria-label={unread > 0 ? `Notifications, ${unread} new` : 'Notifications'}
          className="relative flex size-11 items-center justify-center rounded-12 text-ink"
        >
          <BellIcon />
          {unread > 0 ? (
            <span
              aria-hidden="true"
              className="absolute top-[9px] right-2.5 size-2.5 rounded-pill border-2 border-ground bg-coral"
            />
          ) : null}
        </Link>
        <Link
          href={settingsHref}
          aria-label={settingsLabel}
          className="flex size-11 items-center justify-center rounded-12 text-ink no-underline"
        >
          <GearIcon />
        </Link>
      </span>
    </header>
  )
}
