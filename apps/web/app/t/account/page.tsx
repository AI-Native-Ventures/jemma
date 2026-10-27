import Link from 'next/link'
import { ChevronRightIcon } from '@/components/ui/icons'
import { requireRole } from '@/lib/auth'
import { getAccount } from '@/lib/data/p21'
import { BackHeader, Column } from '../_p21'
import { ComingRow, DeleteAccount, EditDetails, SignOutButton } from './AccountClient'

export const dynamic = 'force-dynamic'

const detail = 'text-[14px] leading-[1.4] text-body [overflow-wrap:anywhere]'
const link = 'flex min-h-14 items-center gap-3 border-t border-soft py-1.5 text-ink no-underline'

export default async function TeacherAccountPage() {
  await requireRole('teacher')
  const a = await getAccount()
  const home = a.firstClassId ? `/t/${a.firstClassId}/notifications` : '/t'
  return (
    <div className="min-h-dvh bg-ground">
      <Column>
        <BackHeader href="/t" label="Back to your classes" title="Your account" />
        <main className="flex flex-1 flex-col gap-4 px-5 pt-3 pb-7">
          <section className="flex items-start gap-3.5 rounded-20 border border-line bg-card p-4">
            <span aria-hidden="true" className="flex size-14 flex-none items-center justify-center rounded-pill bg-soft-3 text-[19px] font-bold">
              {a.initials}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-0.5">
              <h1 className="m-0 text-[22px] leading-[1.2] font-bold tracking-[-0.01em]">{a.name}</h1>
              <span className={detail}>{a.email}</span>
              {a.schoolName ? <span className={detail}>{a.schoolName}</span> : null}
              {a.teaches ? <span className={detail}>{a.teaches}</span> : null}
              <EditDetails name={a.name} />
            </div>
          </section>

          <section aria-label="Settings" className="flex flex-col rounded-20 border border-line bg-card px-4 py-1.5">
            <Link href={home} className="flex min-h-14 items-center gap-3 py-1.5 text-ink no-underline">
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[16px] font-medium">Notifications</span>
                <span className="text-[13px] leading-[1.35] text-body">In the app only · Needs you and finished lessons</span>
              </span>
              <ChevronRightIcon className="flex-none" />
            </Link>
            <ComingRow title="School plan" sub={`Free · ${a.people} of 10 people`} />
            <ComingRow title="Messages from parents" />
            <Link href="/privacy" className={link}>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[16px] font-medium">Privacy and your data</span>
              </span>
              <ChevronRightIcon className="flex-none" />
            </Link>
            <Link href="/help" className={link}>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[16px] font-medium">Help</span>
              </span>
              <ChevronRightIcon className="flex-none" />
            </Link>
          </section>

          <SignOutButton />
          <div className="flex flex-col items-start gap-0.5">
            <DeleteAccount />
            <p className="m-0 text-[14px] leading-[1.45] text-body">Your classes move to another teacher at your school first.</p>
          </div>
          <div className="flex-1" />
        </main>
      </Column>
    </div>
  )
}
