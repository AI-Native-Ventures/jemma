import Link from 'next/link'
import { CameraIcon } from '../ui/icons'
import { HOMES, TABS, tabHref } from './nav'
import type { Role, TabId } from './nav'

export type TabBarProps = {
  role: Role
  active: TabId
  /** Accessible name of the bar: the class name, or the child's name. */
  label: string
  /** Base path of the space, for example `/t/<classId>`. Defaults to the role home. */
  base?: string
}

/** Phone bottom bar. Hidden from width 1024, where `Sidebar` takes over. */
export function TabBar({ role, active, label, base = HOMES[role] }: TabBarProps) {
  const tabs = TABS[role]
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
