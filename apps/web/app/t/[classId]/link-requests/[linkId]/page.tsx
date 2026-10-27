import { redirect } from 'next/navigation'
import { GemIcon } from '@/components/ui'
import { PeopleIcon } from '@/components/ui/icons'
import { getLinkRequest } from '@/lib/data/p21'
import { BackHeader, Column, Title } from '../../../_p21'
import { Decision } from './Decision'

export const dynamic = 'force-dynamic'

const item = 'flex gap-2.5 text-[15px] leading-[1.45]'

export default async function TeacherLinkRequestPage({ params }: { params: Promise<{ classId: string; linkId: string }> }) {
  const { classId, linkId } = await params
  const v = await getLinkRequest(classId, linkId)
  if (v.status !== 'pending') redirect(`/t/${classId}`)
  return (
    <Column bare>
      <BackHeader href={`/t/${classId}`} label="Close" sub={`${v.cls.name} · Needs you`} title="New parent" close />
      <main className="flex flex-1 flex-col gap-4 px-5 pt-3 pb-7">
        <Title>
          {v.parentName} wants to see {v.childName}&apos;s work. Is she {v.childName}&apos;s parent?
        </Title>

        <section aria-label="Who is asking" className="flex flex-col gap-3 rounded-20 border border-line bg-card p-4">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="flex size-12 flex-none items-center justify-center rounded-pill bg-coral-tint text-[16px] font-bold">
              {v.parentInitials}
            </span>
            <span className="flex flex-col gap-px leading-[1.35]">
              <span className="text-[18px] font-semibold">{v.parentName}</span>
              <span className="text-[14px] text-body">{v.parentEmail}</span>
            </span>
          </div>
          <ul className="m-0 flex list-none flex-col gap-[9px] border-t border-soft p-0 pt-3">
            <li className={item}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5D5A73" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-none">
                <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" />
                <path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />
              </svg>
              <span>
                Entered code {v.cls.joinCode} and the name {v.childName} at {v.enteredAt}
              </span>
            </li>
            <li className={item}>
              <PeopleIcon size={18} strokeWidth={1.9} className="flex-none text-body" />
              <span>{v.otherParents === 0 ? `No other parent is linked to ${v.childName}.` : `${v.otherParents} other ${v.otherParents === 1 ? 'parent is' : 'parents are'} already linked to ${v.childName}.`}</span>
            </li>
          </ul>
        </section>

        <section aria-labelledby="see" className="flex flex-col gap-2.5 rounded-20 border border-line bg-card p-4">
          <h2 id="see" className="m-0 text-[17px] font-semibold">
            She&apos;ll see
          </h2>
          <ul className="m-0 flex list-none flex-col gap-[9px] p-0">
            {[`${v.childName}'s marks and papers`, 'Her gaps and lessons', 'Your notes and attendance'].map((t) => (
              <li key={t} className={item}>
                <GemIcon size={11} className="mt-[5px] flex-none" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </section>

        <Decision classId={classId} linkId={linkId} />

        <p className="m-0 flex gap-2.5 text-[14px] leading-[1.45] text-body">
          <GemIcon size={12} className="mt-1 flex-none" />
          <span>She sees nothing until you say yes.</span>
        </p>
        <div className="flex-1" />
      </main>
    </Column>
  )
}
