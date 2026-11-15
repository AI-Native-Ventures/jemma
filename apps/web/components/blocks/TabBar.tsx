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
  return (
    <nav
      aria-label={label}
      style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      className={`sticky bottom-0 z-10 grid leading-[normal] border-t border-line bg-card pt-1.5 pb-[22px] lg:hidden ${
        learner ? 'px-6' : 'px-1'
      }`}
    >
      {tabs.map((tab) => {
        const on = tab.id === active
        const raised = tab.id === 'snap' && !learner
        const text = learner ? 'text-[13px]' : 'text-[12px]'
        if (raised) {
          return (
            <Link
              key={tab.id}
              href={tabHref(role, tab, base)}
              aria-current={on ? 'page' : undefined}
              className={`flex min-h-[52px] flex-col items-center gap-[3px] font-semibold text-ink no-underline ${text}`}
            >
              <span
                data-raised="true"
                className="-mt-4 flex size-[50px] items-center justify-center rounded-pill border-[3px] border-white bg-coral"
              >
                <CameraIcon size={24} />
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
            className={`flex min-h-[52px] flex-col items-center gap-[3px] pt-1 no-underline ${text} ${
              on ? 'font-semibold text-ink' : 'font-medium text-muted'
            }`}
          >
            <span
              className={`flex items-center justify-center rounded-pill ${
                learner ? 'h-8 w-16' : 'h-[30px] w-14'
              } ${on ? 'bg-soft-4' : ''}`}
            >
              {tab.icon(22)}
            </span>
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
