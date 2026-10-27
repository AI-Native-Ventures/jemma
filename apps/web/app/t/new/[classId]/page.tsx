import Link from 'next/link'
import { CheckIcon, ChevronRightIcon } from '@/components/ui/icons'
import { getEmptyClass, numberWord, shortName } from '@/lib/data/p21'
import { Column, Title } from '../../_p21'
import { ShareButton } from '../../_p21-client'

export const dynamic = 'force-dynamic'

const num = 'flex size-[30px] flex-none items-center justify-center rounded-pill border-2 border-ink text-[14px] font-bold'
const rowCls = 'flex items-center gap-3.5 border-t border-soft text-ink no-underline'

function Step({ n, href, title, sub, done }: { n: number; href: string; title: string; sub: string; done?: boolean }) {
  return (
    <li>
      <Link href={href} className={`${rowCls} min-h-[76px]`}>
        {done ? (
          <span className="flex size-[30px] flex-none items-center justify-center rounded-pill bg-ink">
            <CheckIcon size={16} className="text-white" />
          </span>
        ) : (
          <span className={num}>{n}</span>
        )}
        <span className="flex flex-1 flex-col gap-0.5">
          <span className="text-[16px] font-semibold">{title}</span>
          <span className="text-[14px] leading-[1.35] text-body">{sub}</span>
        </span>
        <ChevronRightIcon className="flex-none" />
      </Link>
    </li>
  )
}

export default async function EmptyClassPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params
  const v = await getEmptyClass(classId)
  const short = shortName(v.cls.name)
  const left = 4 - v.done
  const base = `/t/${classId}`
  return (
    <Column>
      <main className="flex flex-1 flex-col gap-5 px-5 pt-3.5 pb-5">
        <Title size={28} gemTop={11}>
          {short} is set up. {numberWord(left)} more {left === 1 ? 'step' : 'steps'} and I can start marking for you.
        </Title>

        <section aria-labelledby="needs" className="flex items-center gap-3 rounded-18 border border-line bg-card px-4 py-3.5">
          <span aria-hidden="true" className="flex size-9 flex-none items-center justify-center rounded-pill bg-soft-4">
            <CheckIcon size={18} />
          </span>
          <div className="flex flex-col gap-px">
            <h2 id="needs" className="m-0 text-[16px] font-semibold">
              Needs you
            </h2>
            <p className="m-0 text-[14px] text-body">{v.openNeeds > 0 ? `${v.openNeeds} waiting for you.` : "Nothing yet. Things I'm unsure about land here."}</p>
          </div>
        </section>

        <section aria-labelledby="setup" className="flex flex-col rounded-[22px] border border-line bg-card pt-4 pr-3 pb-2 pl-4">
          <div className="mb-1.5 flex items-baseline justify-between pr-1">
            <h2 id="setup" className="m-0 text-[18px] font-semibold">
              Set up {short}
            </h2>
            <span className="text-[14px] text-body">{v.done} of 4 done</span>
          </div>
          <ol className="m-0 flex list-none flex-col p-0">
            <Step n={1} href={`${base}/curriculum`} title="Upload your curriculum" sub="I draft the topic map, you approve it" done={v.steps.curriculumDone} />
            <Step n={2} href={`${base}/learners`} title="Add your learners" sub={v.steps.learnersDone ? `Done · ${v.learners} ${v.learners === 1 ? 'learner' : 'learners'}. Tap to edit` : 'Type their names or snap your register'} done={v.steps.learnersDone} />
            <li className={`${rowCls} min-h-[84px]`}>
              <span className={num}>3</span>
              <span className="flex flex-1 flex-col gap-0.5">
                <span className="text-[16px] font-semibold">Share the class code</span>
                <span className="text-[14px] leading-[1.35] text-body">
                  Parents link with <strong className="font-bold tracking-[0.06em] text-ink">{v.cls.joinCode}</strong>
                </span>
              </span>
              <ShareButton code={v.cls.joinCode} className="h-11 flex-none rounded-12 border-[1.5px] border-ink bg-card px-4 text-[14px] font-semibold text-ink">
                Share
              </ShareButton>
            </li>
            <Step n={4} href={`${base}/snap`} title="Snap your first test" sub="Then I show you what the class doesn't get yet" done={v.steps.testDone} />
          </ol>
        </section>
        <p className="m-0 text-center text-[14px] text-body">Any order works. Class gaps show up here after the first test.</p>
        <div className="flex-1" />
      </main>
    </Column>
  )
}
