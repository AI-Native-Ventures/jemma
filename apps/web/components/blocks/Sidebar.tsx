import Link from 'next/link'
import { BellIcon, CameraIcon, GearIcon, SwapIcon } from '../ui/icons'
import { HOMES, TABS, tabHref } from './nav'
import type { Role, TabId } from './nav'

export type SidebarProps = {
  role: Role
  active: TabId
  /** Accessible name of the nav, for example the class name. */
  label: string
  /** Space name in the switcher box. */
  name: string
  subtitle: string
  switchHref: string
  user: { name: string; initials: string }
  settingsHref: string
  notificationsHref?: string
  unread?: number
  base?: string
}

function Wordmark() {
  return (
    <svg width="92" height="36" viewBox="4 12 236 92" role="img" aria-label="jemma" className="ml-1.5 block">
      <path d="M32 46 V80 C32 91 24 95 13 93" fill="none" stroke="#1F1D36" strokeWidth="9.5" strokeLinecap="round" />
      <polygon points="32,19 40,27 32,35 24,27" fill="#FF6A4D" />
      <text x="43" y="80" fill="#1F1D36" fontFamily="var(--font-outfit), Outfit, system-ui, sans-serif" fontSize="66" fontWeight="700">
        emma
      </text>
    </svg>
  )
}

/** Laptop navigation: same tabs, same order as the phone bar. Shown from width 1024. */
export function Sidebar({
  role,
  active,
  label,
  name,
  subtitle,
  switchHref,
  user,
  settingsHref,
  notificationsHref = '/notifications',
  unread = 0,
  base = HOMES[role],
}: SidebarProps) {
  return (
    <aside className="hidden w-[254px] leading-[normal] flex-none flex-col gap-[22px] border-r border-line bg-card px-3.5 pt-[22px] pb-[18px] lg:flex">
      <Wordmark />
      <Link
        href={switchHref}
        aria-label={`Switch. Now showing ${name}`}
        className="flex items-center justify-between gap-2 rounded-14 border border-line bg-ground px-3 py-2.5 text-ink no-underline"
      >
        <span className="flex flex-col leading-[1.2]">
          <span className="text-[16px] font-bold">{name}</span>
          <span className="text-[13px] text-body">{subtitle}</span>
        </span>
        <SwapIcon />
      </Link>
      <nav aria-label={label} className="flex flex-col gap-1">
        {TABS[role].map((tab) => {
          const on = tab.id === active
          const snap = tab.id === 'snap' && role !== 'learner'
          return (
            <Link
              key={tab.id}
              href={tabHref(role, tab, base)}
              aria-current={on ? 'page' : undefined}
              className={`flex min-h-11 items-center gap-3 rounded-12 text-[15px] no-underline ${
                snap ? 'pr-3 pl-2 font-semibold text-ink' : 'px-3'
              } ${on ? 'bg-soft-4 font-semibold text-ink' : snap ? '' : 'font-medium text-[#4A4762]'}`}
            >
              {snap ? (
                <span className="flex size-[30px] items-center justify-center rounded-pill bg-coral">
                  <CameraIcon size={18} />
                </span>
              ) : (
                tab.icon(22)
              )}
              {tab.label}
            </Link>
          )
        })}
      </nav>
      <div className="flex-1" />
      <div className="flex items-center gap-2.5 border-t border-soft pt-2.5 pr-1 pl-1.5">
        <span
          aria-hidden="true"
          className="flex size-[34px] flex-none items-center justify-center rounded-pill bg-soft-3 text-[12px] font-bold"
        >
          {user.initials}
        </span>
        <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{user.name}</span>
        <Link
          href={notificationsHref}
          aria-label={unread > 0 ? `Notifications, ${unread} new` : 'Notifications'}
          className="relative flex size-11 items-center justify-center rounded-[10px] text-ink"
        >
          <BellIcon />
          {unread > 0 ? (
            <span aria-hidden="true" className="absolute top-[9px] right-2.5 size-2.5 rounded-pill border-2 border-card bg-coral" />
          ) : null}
        </Link>
        <Link
          href={settingsHref}
          aria-label="Settings"
          className="flex size-11 items-center justify-center rounded-[10px] text-ink no-underline"
        >
          <GearIcon size={20} />
        </Link>
      </div>
    </aside>
  )
}
