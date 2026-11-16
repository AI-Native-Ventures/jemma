import { redirect } from 'next/navigation'
import { GemIcon } from '@/components/ui'
import { getJoinRequest } from '@/lib/data/class-join'
import { BackHeader, Column, Title } from '../../../_p21'
import { Decision } from './Decision'

export const dynamic = 'force-dynamic'

const item = 'flex gap-2.5 text-[15px] leading-[1.45]'

/** A learner who signed up alone typed this class's code. The teacher says who the learner is and yes or no. */
export default async function TeacherJoinRequestPage({ params }: { params: Promise<{ classId: string; requestId: string }> }) {
  const { classId, requestId } = await params
  const v = await getJoinRequest(classId, requestId)
  if (v.status !== 'pending') redirect(`/t/${classId}`)
  return (
    <Column bare>
      <BackHeader href={`/t/${classId}`} label="Close" sub={`${v.className} · Needs you`} title="New learner" close />
      <main className="flex flex-1 flex-col gap-4 px-5 pt-3 pb-7">
        <Title>
          {v.name} wants to join {v.className}. Who is {v.name}?
        </Title>

        <section aria-label="Who is asking" className="flex flex-col gap-2.5 rounded-20 border border-line bg-card p-4">
          <ul className="m-0 flex list-none flex-col gap-[9px] p-0">
            <li className={item}>
              <GemIcon size={11} className="mt-[5px] flex-none" />
              <span>
                Signed up on their own, then typed code {v.joinCode} at {v.askedAt}
              </span>
            </li>
            <li className={item}>
              <GemIcon size={11} className="mt-[5px] flex-none" />
              <span>{v.candidates.length === 0 ? 'Every learner in your class already has a login, so this can only be a new learner.' : 'Pick the learner in your class this is, or add a new learner.'}</span>
            </li>
          </ul>
        </section>

        <Decision classId={classId} requestId={requestId} name={v.name} candidates={v.candidates} match={v.match} />

        <p className="m-0 flex gap-2.5 text-[14px] leading-[1.45] text-body">
          <GemIcon size={12} className="mt-1 flex-none" />
          <span>They keep their own practice. They join your class only after you say yes.</span>
        </p>
        <div className="flex-1" />
      </main>
    </Column>
  )
}
