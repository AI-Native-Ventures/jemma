'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CameraIcon } from '../ui/icons'
import { HOMES, TABS, markedTab, tabHref } from './nav'
import type { Role, TabId } from './nav'

export type TabBarProps = {
  role: Role
  /** The tab the server marked for the first paint. In the browser the bar marks the tab of the address it is in (see `markedTab`). */
  active: TabId
  /** Accessible name of the bar: the class name, or the child's name. */
  label: string
  /** Base path of the space, for example `/t/<classId>`. Defaults to the role home. */
  base?: string
  /** Show only these tabs, in the order of the role's tabs. An empty list shows no bar (a child's page with nowhere else to go). Omitted: every tab. */
  only?: TabId[]
}

/** Phone bottom bar. Hidden from width 1024, where `Sidebar` takes over. */
export function TabBar({ role, active: first, label, base = HOMES[role], only }: TabBarProps) {
  // A layout is not drawn again when a child taps a tab, so the mark follows the address in the browser, not the value the layout passed.
  const active = markedTab(role, base, usePathname(), first)
  const tabs = only ? TABS[role].filter((t) => only.includes(t.id)) : TABS[role]
  if (tabs.length === 0) return null
  const learner = role === 'learner'
  // About 61 px of bar for a learner and 64 px with the raised Snap button (a border, 2 px, the tabs, 2 px), plus the inset under a phone's home bar.
  return (
    <nav
      aria-label={label}
      style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`, paddingBottom: 'calc(env(safe-area-inset-bottom) + 2px)' }}
      className={`sticky bottom-0 z-10 grid leading-[normal] border-t border-line bg-card pt-0.5 lg:hidden ${
        learner ? 'px-4' : 'px-1'
      }`}
    >
      {tabs.map((tab) => {
        const on = tab.id === active
        const raised = tab.id === 'snap' && !learner
        const text = learner ? 'text-[13px]' : 'text-[12px]'
        // Each tab is a tap target of at least 44 px by 44 px: the link, not the pill, is the target (the grid cell is wider than 44 px at 320 px).
        if (raised) {
          return (
            <Link
              key={tab.id}
              href={tabHref(role, tab, base)}
              aria-current={on ? 'page' : undefined}
              className={`flex min-h-[56px] flex-col items-center justify-end gap-0.5 pb-1 font-semibold text-ink no-underline ${text}`}
            >
              <span
                data-raised="true"
                className="-mt-2.5 flex size-12 items-center justify-center rounded-pill border-[3px] border-white bg-coral"
              >
                <CameraIcon size={22} />
              </span>
              {tab.label}
            </Link>
          )
        }
        return (
          <Link
            key={tab.id}
            href={tabHref(role, tab, base)}
            aria-current={on ? 'page' : undefined}
            className={`flex min-h-[56px] flex-col items-center justify-end gap-0.5 pb-1 font-semibold no-underline ${text} ${
              on ? 'text-ink' : 'text-muted'
            }`}
          >
            <span className={`flex h-7 w-12 items-center justify-center rounded-pill ${on ? 'bg-soft-4' : ''}`}>
              {tab.icon(20)}
            </span>
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
