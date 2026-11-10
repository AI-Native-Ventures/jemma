import { notFound } from 'next/navigation'
import { Button, ChevronRightIcon, GemIcon } from '@/components/ui'
import { getLogView, type LogEntry } from '@/lib/data/p50'
import { BackHeader } from '../tests/back-header'

type Entry<K extends LogEntry['kind']> = Extract<LogEntry, { kind: K }>

const WrenchIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1F1D36" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5.5l-3 13" />
  </svg>
)

const json =
  'm-0 max-h-72 overflow-auto rounded-12 bg-soft-2 p-3 font-mono text-[12px] leading-[1.5] whitespace-pre-wrap text-ink [overflow-wrap:anywhere]'

function ToolRow({ e }: { e: Entry<'tool'> }) {
  return (
    <li className="flex flex-col rounded-18 border border-line bg-card px-4 py-3.5">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="flex size-[38px] flex-none items-center justify-center rounded-12 bg-soft-4">
          <WrenchIcon />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[16px] leading-[1.3] font-semibold [overflow-wrap:anywhere]">{e.label}</span>
            {e.failed ? <span className="rounded-pill bg-[#FFEDE8] px-2 py-0.5 text-[12px] font-bold text-coral-text">Failed</span> : null}
          </span>
          <span className="text-[14px] leading-[1.4] text-body">
            {e.at} · {e.who}
          </span>
        </span>
      </div>
      <details className="group mt-1">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 text-[14px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
          <ChevronRightIcon className="flex-none transition-transform group-open:rotate-90" />
          What went in and what came out
        </summary>
        <div className="flex flex-col gap-3 pt-1 pb-1">
          <section aria-label="What went in" className="flex flex-col gap-1.5">
            <h3 className="m-0 text-[13px] font-semibold text-body">What went in</h3>
            <pre className={json}>{e.input}</pre>
          </section>
          <section aria-label="What came out" className="flex flex-col gap-1.5">
            <h3 className="m-0 text-[13px] font-semibold text-body">What came out</h3>
            <pre className={json}>{e.output}</pre>
          </section>
        </div>
      </details>
    </li>
  )
}

function ApprovalRow({ e }: { e: Entry<'approval'> }) {
  return (
    <li className="flex items-start gap-3 rounded-18 border border-[#FFC9BB] bg-coral-wash py-3.5 pr-4 pl-3.5">
      <span aria-hidden="true" className="flex size-[38px] flex-none items-center justify-center rounded-pill bg-coral-soft text-[14px] font-bold">
        {e.name.slice(0, 1).toUpperCase()}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="text-[16px] leading-[1.3] font-semibold [overflow-wrap:anywhere]">{e.text}</span>
        <span className="text-[14px] leading-[1.4] text-body">{e.at}</span>
      </span>
    </li>
  )
}

export default async function TeacherLogPage({
  params,
  searchParams,
}: {
  params: Promise<{ classId: string }>
  searchParams: Promise<{ before?: string }>
}) {
  const { classId } = await params
  const { before } = await searchParams
  const view = await getLogView(classId, before)
  if (!view) notFound()
  const base = `/t/${classId}`
  const { entries, olderCursor } = view.page

  return (
    <div className="leading-[normal] lg:max-w-[860px]">
      <BackHeader href={base} backLabel="Back to class" eyebrow={view.className} title="The full log" />
      <div className="flex flex-col gap-[18px] px-5 pt-3.5 pb-6">
        <div className="flex items-start gap-2.5">
          <GemIcon size={14} className="mt-2.5 flex-none" />
          <h1 className="m-0 text-[26px] leading-[1.18] font-semibold tracking-[-0.015em] text-pretty">What Jemma did, in full</h1>
        </div>
        <p className="m-0 text-[15px] leading-[1.45] text-body">
          Every tool Jemma used, with what went in and what came out. Every approval, with the name of the person who gave it. Newest first.
        </p>

        {entries.length === 0 ? (
          <p className="m-0 rounded-18 border border-line bg-card p-4 text-[15px] leading-[1.45] text-body">
            Nothing here yet. Each tool Jemma uses and each approval will show up in this list.
          </p>
        ) : (
          <ol aria-label="Everything Jemma did, newest first" className="m-0 flex list-none flex-col gap-2 p-0">
            {entries.map((e) => (e.kind === 'tool' ? <ToolRow key={e.id} e={e} /> : <ApprovalRow key={e.id} e={e} />))}
          </ol>
        )}

        {olderCursor || view.older ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            {olderCursor ? (
              <Button href={`${base}/log?before=${encodeURIComponent(olderCursor)}`} variant="secondary" size="sm" className="flex-1">
                Show older
              </Button>
            ) : null}
            {view.older ? (
              <Button href={`${base}/log`} variant="link" className="flex-1">
                Back to the newest
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
