import { notFound } from 'next/navigation'
import { EmptyState } from '@/components/blocks'
import { Card } from '@/components/ui'
import { requireRole } from '@/lib/auth'
import { getLongView, type DotLevel, type LongView } from '@/lib/data/p52'
import { BackHeader } from '../../../tests/back-header'
import { PatternCard, SetAside } from './PatternCard'
import { OpenUpdate, UpdateBar } from './UpdateBar'

const DOT = 'block size-[22px] rounded-pill'

/** One dot of the grid. Full, half and empty are filled, half-filled and a ring; dashed means no results that term. */
function Dot({ level }: { level: DotLevel }) {
  if (level === 'full') return <span aria-hidden="true" className={`${DOT} bg-ink`} />
  if (level === 'half') return <span aria-hidden="true" className={`${DOT} border-[1.5px] border-ink bg-[linear-gradient(90deg,var(--color-ink)_50%,transparent_50%)]`} />
  if (level === 'empty') return <span aria-hidden="true" className={`${DOT} border-[1.5px] border-ink bg-card`} />
  return <span aria-hidden="true" className={`${DOT} border-[1.5px] border-dashed border-muted-2`} />
}

function MiniDot({ level }: { level: DotLevel }) {
  return (
    <span aria-hidden="true" className="inline-block align-[-2px] [&>span]:size-3.5">
      <Dot level={level} />
    </span>
  )
}

/** Strands down the side, terms across, grouped under their grade. The strand names stay put when the grid scrolls sideways. */
function Grid({ v }: { v: LongView }) {
  if (v.rows.length === 0) {
    return (
      <Card as="section" radius={20} aria-label="Marks by strand and term">
        <p className="m-0 text-[15px] leading-[1.45] text-body">No marked work to show yet.</p>
      </Card>
    )
  }
  return (
    <Card as="section" radius={20} aria-labelledby="lv-grid" className="gap-3">
      <h2 id="lv-grid" className="sr-only">
        Marks by strand and term
      </h2>
      <div className="-mx-1 overflow-x-auto px-1 pb-1" role="region" aria-label="Marks by strand and term, scrolls sideways" tabIndex={0}>
        <table className="min-w-max border-separate border-spacing-0 lg:w-full">
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-card p-0">
                <span className="sr-only">Strand</span>
              </th>
              {v.gradeGroups.map((g) => (
                <th key={`${g.grade}-${g.span}`} scope="colgroup" colSpan={g.span} className="relative h-5 p-0 text-left">
                  <span className="absolute top-0 left-1 text-[12px] leading-5 font-semibold whitespace-nowrap text-body">{g.span >= 2 ? `Grade ${g.grade}` : `Gr ${g.grade}`}</span>
                </th>
              ))}
            </tr>
            <tr>
              <td className="sticky left-0 z-10 bg-card p-0" />
              {v.columns.map((c) => (
                <th key={c.key} scope="col" className="relative px-[5px] pb-1 text-center text-[12px] leading-4 font-normal text-body">
                  <span aria-hidden="true">T{c.term}</span>
                  <span className="sr-only">{`Grade ${c.grade} Term ${c.term}`}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {v.rows.map((r) => (
              <tr key={r.family}>
                <th scope="row" className="sticky left-0 z-10 bg-card py-1.5 pr-3 text-left text-[14px] leading-[1.2] font-semibold whitespace-nowrap">
                  {r.name}
                </th>
                {r.cells.map((c, i) => (
                  <td key={v.columns[i]!.key} className="px-[5px] py-1.5 text-center">
                    <span role="img" aria-label={c.alt} className="inline-flex">
                      <Dot level={c.level} />
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {v.columns.length > 6 ? <p className="m-0 text-[13px] leading-[1.4] text-body lg:hidden">Swipe sideways to see every term.</p> : null}
      <p className="m-0 flex flex-wrap gap-x-3 gap-y-1 text-[13px] leading-[1.5] text-body">
        <span className="whitespace-nowrap">
          <MiniDot level="full" /> full = 80 percent or more
        </span>
        <span className="whitespace-nowrap">
          <MiniDot level="half" /> half = 50 to 79
        </span>
        <span className="whitespace-nowrap">
          <MiniDot level="empty" /> empty = below 50
        </span>
        <span className="whitespace-nowrap">
          <MiniDot level="none" /> dashed outline = no results that term
        </span>
      </p>
    </Card>
  )
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-1 p-0">
      {items.map((t) => (
        <li key={t} className="text-[15px] leading-[1.4] [overflow-wrap:anywhere]">
          {t}
        </li>
      ))}
    </ul>
  )
}

/** What the grid and the patterns leave out, said plainly. Not drawn at all when there is nothing to say. */
function CouldNotUse({ v }: { v: LongView }) {
  if (v.missing.length === 0 && v.unclear.length === 0 && v.late.length === 0) return null
  return (
    <Card as="section" radius={20} aria-labelledby="lv-skipped" className="gap-3">
      <h2 id="lv-skipped" className="m-0 text-[17px] font-semibold">
        What Jemma could not use
      </h2>
      {v.missing.length > 0 ? <List items={v.missing} /> : null}
      {v.unclear.length > 0 ? (
        <div className="flex flex-col gap-1">
          <h3 className="m-0 text-[13px] font-semibold text-body">Not counted, because the marks were hard to read</h3>
          <List items={v.unclear} />
        </div>
      ) : null}
      {v.late.length > 0 ? (
        <div className="flex flex-col gap-1">
          <h3 className="m-0 text-[13px] font-semibold text-body">Logged late, still counted</h3>
          <List items={v.late} />
        </div>
      ) : null}
    </Card>
  )
}

/**
 * The teacher's Long view of one learner: the marks across the years, then each pattern Jemma found with where it comes from.
 * The teacher checks a pattern, talks to the parent, and only then does the parent see it. The learner never does.
 * One layout for phone and laptop: the grid scrolls inside its card on a phone, and the cards sit in two columns on a laptop.
 */
export default async function LongViewPage({ params }: { params: Promise<{ classId: string; childId: string }> }) {
  const { classId, childId } = await params
  await requireRole('teacher')
  const v = await getLongView(classId, childId)
  if (!v) notFound()
  const { drafts, approved, shared, setAside } = v.groups
  const open = [...drafts, ...approved, ...shared]
  const base = `/t/${classId}`

  return (
    <div className="leading-[normal] lg:max-w-[1100px]">
      <BackHeader href={`${base}/learners/${childId}/profile`} backLabel={`Back to ${v.name}'s profile`} eyebrow={`${v.name} · ${v.className}`} title="Long view" />
      <div className="flex flex-col gap-[18px] px-5 pt-2 pb-6 lg:px-8">
        <h1 className="sr-only">{`${v.name}'s Long view`}</h1>
        {v.spanLine ? <p className="m-0 text-[14px] leading-[1.4] text-body">{v.spanLine}</p> : null}

        <Grid v={v} />

        {v.patternCount === 0 ? <EmptyState title="Too early to tell" body="A pattern needs 3 terms of clear results." /> : null}

        {open.length > 0 ? (
          <section aria-labelledby="lv-patterns" className="flex flex-col gap-3">
            <h2 id="lv-patterns" className="m-0 text-[17px] font-semibold">
              What Jemma found
            </h2>
            <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start">
              {open.map((p) => (
                <PatternCard key={p.id} p={p} parentName={v.parentName} />
              ))}
            </div>
          </section>
        ) : null}

        {setAside.length > 0 ? <SetAside patterns={setAside} parentName={v.parentName} /> : null}

        <CouldNotUse v={v} />
        <UpdateBar childId={childId} state={v.update.state} lastUpdated={v.update.lastUpdated} />
        {v.update.askOnOpen ? <OpenUpdate childId={childId} /> : null}
      </div>
    </div>
  )
}
