import Link from 'next/link'
import { getSettings } from '@/lib/data/p21'
import { BackHeader, Column, Section, Title } from '../../_p21'
import { ShareButton } from '../../_p21-client'
import { AddLearnerRow, GradeRow, NameRow, NewCodeButton, ParentToggle, RemoveParentButton, SubjectRow } from './SettingsClient'
import { ChevronRightIcon } from '@/components/ui/icons'

export const dynamic = 'force-dynamic'

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export default async function TeacherClassSettingsPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params
  const { cls, learners, parents } = await getSettings(classId)
  const short = cls.name.split(/\s+/)[0]
  return (
    <Column bare>
      <BackHeader href={`/t/${classId}`} label="Back to class" sub={cls.name} title="Class settings" />
      <main className="flex flex-1 flex-col gap-4 px-5 pt-3 pb-7">
        <Title size={25}>
          {short} has {plural(learners.length, 'learner')} and {plural(parents.length, 'linked parent')}.
        </Title>

        <Section id="cls" title="Class" gap={2}>
          <NameRow classId={classId} name={cls.name} />
          <GradeRow classId={classId} grade={cls.grade} />
          <SubjectRow subject={cls.subject} />
        </Section>

        <Section id="code" title="Class code for parents" gap={10}>
          <div className="flex items-center gap-2.5">
            <span className="flex h-[52px] flex-1 items-center rounded-12 bg-soft-2 px-3.5 text-[22px] font-bold tracking-[0.14em]">{cls.joinCode}</span>
            <ShareButton code={cls.joinCode} className="flex h-[52px] items-center gap-1.5 rounded-12 border-[1.5px] border-ink bg-card px-4 text-[15px] font-semibold text-ink">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 15V3.5M7.5 8 12 3.5 16.5 8" />
                <path d="M5 12.5v6a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-6" />
              </svg>
              Share
            </ShareButton>
          </div>
          <NewCodeButton classId={classId} />
          <p className="m-0 text-[14px] leading-[1.45] text-body">The old code stops working. Parents already linked stay linked.</p>
        </Section>

        <Section id="par" title="Parents" gap={2}>
          <ParentToggle />
          {parents.map((p) => (
            <div key={`${p.parentId}-${p.childId}`} className="flex min-h-16 items-center gap-3 border-t border-soft py-1.5">
              <span aria-hidden="true" className="flex size-[38px] flex-none items-center justify-center rounded-pill bg-coral-tint text-[13px] font-bold">
                {p.initials}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-px leading-[1.35]">
                <span className="text-[16px] font-semibold">{p.name}</span>
                <span className="text-[13px] text-body">{p.relationLine}</span>
                <span className="text-[13px] text-body">{p.linkedOn}</span>
              </span>
              <RemoveParentButton classId={classId} parentId={p.parentId} childId={p.childId} name={p.name} />
            </div>
          ))}
        </Section>

        <Section id="lrn" title="Learners" gap={2}>
          <Link href={`/t/${classId}/learners`} className="flex min-h-14 items-center gap-3 py-1.5 text-ink no-underline">
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[16px] font-medium">{plural(learners.length, 'learner')}</span>
              <span className="text-[13px] leading-[1.35] text-body">{learners.join(', ')}</span>
            </span>
            <ChevronRightIcon className="flex-none" />
          </Link>
          <AddLearnerRow classId={classId} />
        </Section>

        <Section id="ai" title="Where Jemma's AI runs" gap={2}>
          <Link href={`/t/${classId}/settings/ai-runner`} className="flex min-h-14 items-center gap-3 py-1.5 text-ink no-underline">
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[16px] font-medium">Jemma cloud or my Jemma Desktop</span>
              <span className="text-[13px] leading-[1.35] text-body">Uses the plan you already pay for. Nothing extra.</span>
            </span>
            <ChevronRightIcon className="flex-none" />
          </Link>
        </Section>

        <Section id="year" title="End of the year" gap={2}>
          <Link href={`/t/${classId}/year-end`} className="flex min-h-14 items-center gap-3 py-1.5 text-ink no-underline">
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[16px] font-medium">Move {short} up or archive it</span>
              <span className="text-[13px] leading-[1.35] text-body">After the last day of Term 4</span>
            </span>
            <ChevronRightIcon className="flex-none" />
          </Link>
        </Section>
        <div className="flex-1" />
      </main>
    </Column>
  )
}
