import Link from 'next/link'
import { DesktopOffActions, DesktopOffIcon } from './DesktopOff'
import { CheckDocIcon, ChevronRightIcon, ReviewDocIcon } from '../ui/icons'

export type NeedsYouItem = {
  href: string
  title: string
  detail: string
  /** `review` is the question-mark paper (teacher), `check` the ticked paper (parent). */
  icon?: 'review' | 'check'
  /** The "Jemma Desktop is off" card: two buttons instead of a link. */
  desktopOff?: boolean
}

export type NeedsYouListProps = {
  items: NeedsYouItem[]
  /** Laptop layout: one wrapped row with a "Review" label. */
  wide?: boolean
}

/** Everything Jemma is unsure about, in one coral card. Renders nothing when empty. */
export function NeedsYouList({ items, wide = false }: NeedsYouListProps) {
  if (items.length === 0) return null
  return (
    <section
      aria-labelledby="needs"
      className={
        wide
          ? 'flex flex-wrap items-center leading-[normal] gap-3.5 rounded-20 border border-[#FFC9BB] bg-coral-wash px-4 py-3.5'
          : `flex flex-col leading-[normal] gap-2 rounded-20 border border-[#FFC9BB] bg-coral-wash px-3.5 pt-3.5 ${items.some((i) => i.desktopOff) ? 'pb-3.5' : 'pb-2'}`
      }
    >
      <div className={`flex items-center gap-2 ${wide ? '' : 'pl-0.5'}`}>
        <h2 id="needs" className="m-0 text-[16px] font-semibold">
          Needs you
        </h2>
        <span className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-pill bg-coral px-[7px] text-[13px] font-bold text-ink">
          {items.length}
        </span>
      </div>
      {items.map((item) => {
        if (item.desktopOff) {
          return (
            <div key={item.href + item.title} className="flex flex-col gap-3.5 rounded-14 bg-card p-3 text-ink">
              <div className="flex items-start gap-3">
                <span aria-hidden="true" className="flex size-10 flex-none items-center justify-center rounded-12 bg-coral-tint">
                  <DesktopOffIcon />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                  <span className="text-[16px] leading-[1.3] font-semibold">{item.title}</span>
                  <span className="text-[14px] leading-[1.4] text-body">{item.detail}</span>
                </span>
              </div>
              <DesktopOffActions />
            </div>
          )
        }
        const Icon = item.icon === 'check' ? CheckDocIcon : ReviewDocIcon
        return wide ? (
          <Link
            key={item.href + item.title}
            href={item.href}
            className="flex min-h-14 flex-[1_1_420px] items-center gap-3 rounded-14 bg-card px-2.5 py-2 text-ink no-underline"
          >
            <span aria-hidden="true" className="flex size-[38px] flex-none items-center justify-center rounded-12 bg-coral-tint">
              <Icon size={20} />
            </span>
            <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-[16px] font-semibold">{item.title}</span>
              <span className="text-[14px] text-body">{item.detail}</span>
            </span>
            <span className="flex-none text-[14px] font-semibold">Review</span>
            <ChevronRightIcon size={18} className="flex-none" />
          </Link>
        ) : (
          <Link
            key={item.href + item.title}
            href={item.href}
            className="flex min-h-16 items-center gap-3 rounded-14 bg-card py-2.5 pr-1.5 pl-2.5 text-ink no-underline"
          >
            <span aria-hidden="true" className="flex size-10 flex-none items-center justify-center rounded-12 bg-coral-tint">
              <Icon />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[16px] font-semibold">{item.title}</span>
              <span className="text-[14px] text-body">{item.detail}</span>
            </span>
            <ChevronRightIcon className="flex-none" />
          </Link>
        )
      })}
    </section>
  )
}
