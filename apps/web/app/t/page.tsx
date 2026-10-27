import Link from 'next/link'
import { Wordmark } from '@/components/install'
import { BellIcon, ChevronRightIcon, ClipboardIcon, PeopleIcon } from '@/components/ui/icons'
import { requireRole } from '@/lib/auth'
import { getTeacherClasses, shortName, type ClassCard } from '@/lib/data/p21'
import { Column, Title } from './_p21'

export const dynamic = 'force-dynamic'

function Card({ c }: { c: ClassCard }) {
  const isNew = c.tests === 0
  const href = isNew ? `/t/new/${c.id}` : `/t/${c.id}`
  return (
    <Link href={href} className="flex flex-col gap-3.5 rounded-20 border border-line bg-card p-[18px] text-ink no-underline">
      <span className="flex items-start justify-between gap-3">
        <span className="flex flex-col gap-[3px]">
          <span className="text-[21px] font-semibold">{c.name}</span>
          <span className="text-[15px] text-body">
            Grade {c.grade} · {c.schoolName}
          </span>
        </span>
        {c.needs > 0 ? (
          <span className="inline-flex flex-none items-center gap-1.5 rounded-pill bg-coral py-1.5 pr-2.5 pl-2 text-[13px] font-semibold text-ink">
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-pill bg-ink px-1.5 text-[12px] font-bold text-white">{c.needs}</span>
            Needs you
          </span>
        ) : isNew ? (
          <span className="flex-none rounded-pill bg-soft-4 px-3 py-1.5 text-[13px] font-semibold text-ink">New</span>
        ) : null}
      </span>
      <span className="flex gap-[18px] text-[15px]">
        <span className="inline-flex items-center gap-1.5">
          <PeopleIcon size={18} />
          {c.learners} {c.learners === 1 ? 'learner' : 'learners'}
          {isNew ? ' · no tests yet' : ''}
        </span>
        {isNew ? null : (
          <span className="inline-flex items-center gap-1.5">
            <ClipboardIcon size={18} />
            {c.tests} {c.tests === 1 ? 'test' : 'tests'}
          </span>
        )}
      </span>
      <span className="flex items-center justify-between gap-3 border-t border-soft pt-3">
        {isNew ? (
          <span className="text-[14px] font-semibold">Set up this class</span>
        ) : (
          <span className="text-[14px] text-body">{c.markedLine ?? `${shortName(c.name)} is set up`}</span>
        )}
        <ChevronRightIcon className="flex-none" />
      </span>
    </Link>
  )
}

export default async function TeacherClassesPage() {
  await requireRole('teacher')
  const view = await getTeacherClasses()
  return (
    <div className="min-h-dvh bg-ground">
      <Column>
        <header className="flex items-center justify-between pt-3.5 pr-3 pb-1 pl-[18px]">
          <Wordmark width={82} height={32} />
          <span className="flex items-center">
            <Link
              href={view.notificationsHref}
              aria-label={view.unread > 0 ? `Notifications, ${view.unread} new` : 'Notifications'}
              className="relative flex size-11 items-center justify-center rounded-12 text-ink"
            >
              <BellIcon />
              {view.unread > 0 ? <span aria-hidden="true" className="absolute top-[9px] right-2.5 size-2.5 rounded-pill border-2 border-ground bg-coral" /> : null}
            </Link>
            <Link href="/t/account" aria-label="Your account" className="flex size-11 items-center justify-center rounded-pill text-ink no-underline">
              <span className="flex size-9 items-center justify-center rounded-pill bg-soft-3 text-[13px] font-bold text-ink">{view.initials}</span>
            </Link>
          </span>
        </header>

        <main className="flex flex-col gap-[22px] px-5 pt-[18px] pb-7">
          <div className="flex flex-col gap-1.5">
            <p className="m-0 text-[15px] text-body">
              {view.greeting}, {view.name}
            </p>
            <Title size={27} tracking="-0.01em">
              {view.headline}
            </Title>
          </div>

          <section aria-labelledby="classes" className="flex flex-col gap-3">
            <h2 id="classes" className="m-0 text-[15px] font-semibold text-body">
              Your classes
            </h2>
            {view.classes.map((c) => (
              <Card key={c.id} c={c} />
            ))}
          </section>

          <Link href="/t/new" className="flex h-[52px] items-center justify-center gap-2 rounded-14 border-[1.5px] border-dashed border-muted-2 text-[16px] font-semibold text-ink no-underline">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Create a class
          </Link>
        </main>
      </Column>
    </div>
  )
}
