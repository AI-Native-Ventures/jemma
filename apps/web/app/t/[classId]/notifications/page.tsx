import Link from 'next/link'
import { GemIcon } from '@/components/ui/icons'
import { getNotificationsPage, type NotificationRow } from '@/lib/data/p20'
import { BackHeader } from '../tests/back-header'
import { markAllRead } from './actions'

const Svg = ({ children }: { children: React.ReactNode }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1F1D36" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
)

const ICONS: Record<NotificationRow['icon'], React.ReactNode> = {
  link: (
    <Svg>
      <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />
    </Svg>
  ),
  check: (
    <Svg>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </Svg>
  ),
  test: (
    <Svg>
      <rect x="5" y="3.5" width="14" height="17" rx="2" />
      <path d="M8.5 8h7M8.5 11.5h7M8.5 15h4" />
    </Svg>
  ),
  map: (
    <Svg>
      <path d="M12 3.5 3.5 8 12 12.5 20.5 8z" />
      <path d="M3.5 12 12 16.5 20.5 12" />
      <path d="M3.5 16 12 20.5 20.5 16" />
    </Svg>
  ),
  bell: (
    <Svg>
      <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </Svg>
  ),
}

function Item({ n }: { n: NotificationRow }) {
  return (
    <li>
      <Link
        href={n.href}
        className={`flex items-start gap-3 rounded-18 py-3.5 pr-3 pl-3.5 text-ink no-underline ${n.unread ? 'border border-[#FFC9BB] bg-coral-wash' : 'border border-line bg-card'}`}
      >
        {n.unread ? (
          <span
            aria-hidden="true"
            className="relative flex size-[38px] flex-none items-center justify-center rounded-pill bg-coral-soft text-[14px] font-bold"
          >
            {n.title.slice(0, 1)}
            <svg width="18" height="18" viewBox="0 0 16 16" className="absolute -right-1 -bottom-1 rounded-pill bg-card p-px">
              <polygon points="1,8 15,8 8,15" fill="#FF6A4D" />
              <polygon points="8,1 15,8 8,15 1,8" fill="none" stroke="#1F1D36" strokeWidth="1.4" />
            </svg>
          </span>
        ) : (
          <span aria-hidden="true" className="flex size-[38px] flex-none items-center justify-center rounded-12 bg-soft-4">
            {ICONS[n.icon]}
          </span>
        )}
        <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span className="text-[16px] leading-[1.3] font-semibold">{n.title}</span>
          <span className="text-[14px] leading-[1.4] text-body">{n.body}</span>
        </span>
        <span className="flex flex-none flex-col items-end gap-1.5 pt-0.5">
          <span className="text-[13px] text-body tabular-nums">{n.time}</span>
          {n.unread ? (
            <span className="inline-flex items-center gap-[5px] text-[12px] font-bold text-coral-text">
              <span aria-hidden="true" className="size-2 rounded-pill bg-coral" />
              New
            </span>
          ) : null}
        </span>
      </Link>
    </li>
  )
}

export default async function TeacherNotificationsPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params
  const { cls, headline, groups } = await getNotificationsPage(classId)
  const base = `/t/${classId}`

  return (
    <div className="leading-[normal] lg:max-w-[720px]">
      <BackHeader
        href={base}
        backLabel="Back to class"
        eyebrow={cls.name}
        title="Notifications"
        right={
          <form action={markAllRead.bind(null, classId)}>
            <button
              type="submit"
              className="min-h-11 cursor-pointer border-none bg-transparent px-2 text-[14px] font-semibold text-ink underline underline-offset-[3px]"
            >
              Mark all read
            </button>
          </form>
        }
      />
      <div className="flex flex-col gap-[18px] px-5 pt-3.5 pb-5">
        <div className="flex items-start gap-2.5">
          <GemIcon size={14} className="mt-2.5 flex-none" />
          <h1 className="m-0 text-[26px] leading-[1.18] font-semibold tracking-[-0.015em] text-pretty">{headline}</h1>
        </div>

        {groups.map((g) => (
          <section key={g.label} aria-label={g.label} className="flex flex-col gap-2.5">
            <h2 className="m-0 text-[15px] font-semibold text-body">{g.label}</h2>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {g.items.map((n) => (
                <Item key={n.id} n={n} />
              ))}
            </ul>
          </section>
        ))}

        <p className="m-0 flex gap-2.5 text-[14px] leading-[1.45] text-body">
          <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true" className="mt-1 flex-none">
            <polygon points="8,0.5 15.5,8 8,15.5 0.5,8" fill="#FF6A4D" />
          </svg>
          Jemma only sends a push when something needs you. Everything else waits here.
        </p>
      </div>
    </div>
  )
}
