import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { CSSProperties } from 'react'
import { EmptyState } from '@/components/blocks'
import { Card } from '@/components/ui'
import { requireRole } from '@/lib/auth'
import { getLongView, subjectLinkOf, type DotLevel, type LongView, type LvPattern } from '@/lib/data/p52'
import { BackHeader } from '../../../tests/back-header'
import { PatternCard, SetAside } from './PatternCard'
import { OpenUpdate, UpdateBar } from './UpdateBar'

const DOT = 'block size-[22px] rounded-pill'
/** A crowded grid on a phone: the dot is 16 px, and never wider than its column less 3 px, so two dots never touch. From a laptop up it is the usual 22 px. */
const DOT_CROWDED = 'block rounded-pill max-lg:mx-auto max-lg:aspect-square max-lg:w-[calc(100%-3px)] max-lg:max-w-4 lg:size-[22px]'

/** One dot of the grid. Full, half and empty are filled, half-filled and a ring; dashed means no results that term. */
function Dot({ level, crowded = false }: { level: DotLevel; crowded?: boolean }) {
  const size = crowded ? DOT_CROWDED : DOT
  if (level === 'full') return <span aria-hidden="true" className={`${size} bg-ink`} />
  if (level === 'half') return <span aria-hidden="true" className={`${size} border-[1.5px] border-ink bg-[linear-gradient(90deg,var(--color-ink)_50%,transparent_50%)]`} />
  if (level === 'empty') return <span aria-hidden="true" className={`${size} border-[1.5px] border-ink bg-card`} />
  return <span aria-hidden="true" className={`${size} border-[1.5px] border-dashed border-muted-2`} />
}

function MiniDot({ level }: { level: DotLevel }) {
  return (
    <span aria-hidden="true" className="inline-block align-[-2px] [&>span]:size-3.5">
      <Dot level={level} />
    </span>
  )
}

/** Up to this many term columns a phone fits the whole grid in its card. More than this, or a window under 360 px, and the grid scrolls inside the card as before. */
const PHONE_FITS = 12
/** A phone column is never narrower than this, and the strand names get 96 px. */
const PHONE_COLUMN_MIN = 15
const PHONE_STRAND_WIDTH = 96
/** In a 320 px window the card is 254 px wide, so from this many terms the grid has to scroll inside it, and says so. */
const SCROLLS_UNDER_360_FROM = 11

/** Strands down the side, terms across, grouped under their grade. The strand names stay put when the grid scrolls sideways. */
function Grid({ v }: { v: LongView }) {
  if (v.rows.length === 0) {
    return (
      <Card as="section" radius={20} aria-label="Marks by strand and term">
        <p className="m-0 text-[15px] leading-[1.45] text-body">No marked work to show yet.</p>
      </Card>
    )
  }
  const terms = v.columns.length
  // From a laptop up nothing here changes. On a phone a grid of 12 terms or fewer is laid out in the card's width (strand names wrap onto two lines, the
  // terms share the rest, and 7 or more terms get smaller dots). Anything bigger keeps the sideways scroll.
  const fits = terms <= PHONE_FITS
  const crowded = fits && terms > 6
  const table = fits
    ? 'w-full table-fixed min-w-[var(--grid-min)] border-separate border-spacing-0 lg:w-full lg:table-auto lg:min-w-max'
    : 'min-w-max border-separate border-spacing-0 lg:w-full'
  const strand = fits ? 'max-lg:pr-2 max-lg:text-[13px] max-lg:whitespace-normal lg:whitespace-nowrap' : 'whitespace-nowrap'
  const cell = fits ? 'max-lg:px-0 lg:px-[5px]' : 'px-[5px]'
  const termLabel = crowded ? 'text-[12px] max-lg:text-[11px]' : 'text-[12px]'
  return (
    <Card as="section" radius={20} aria-labelledby="lv-grid" className={`gap-3 ${fits ? 'max-lg:p-3' : ''}`}>
      <h2 id="lv-grid" className="sr-only">
        Marks by strand and term
      </h2>
      <div className="-mx-1 overflow-x-auto px-1 pb-1" role="region" aria-label="Marks by strand and term, scrolls sideways" tabIndex={0}>
        <table className={table} style={fits ? ({ '--grid-min': `${PHONE_STRAND_WIDTH + terms * PHONE_COLUMN_MIN}px` } as CSSProperties) : undefined}>
          {fits ? (
            <colgroup>
              <col className="max-lg:w-24" />
              {v.columns.map((c) => (
                <col key={c.key} />
              ))}
            </colgroup>
          ) : null}
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-card p-0">
                <span className="sr-only">Strand</span>
              </th>
              {v.gradeGroups.map((g) => (
                <th key={`${g.grade}-${g.span}`} scope="colgroup" colSpan={g.span} className="relative h-5 p-0 text-left">
                  <span className="absolute top-0 left-1 text-[12px] leading-5 font-semibold whitespace-nowrap text-body max-lg:text-[11px]">
                    {/* "Grade 4" when it has room: on a crowded phone grid that takes 3 terms, elsewhere 2. */}
                    {crowded && g.span === 2 ? (
                      <>
                        <span className="lg:hidden">{`Gr ${g.grade}`}</span>
                        <span className="max-lg:hidden">{`Grade ${g.grade}`}</span>
                      </>
                    ) : g.span >= 2 ? (
                      `Grade ${g.grade}`
                    ) : (
                      `Gr ${g.grade}`
                    )}
                  </span>
                </th>
              ))}
            </tr>
            <tr>
              <td className="sticky left-0 z-10 bg-card p-0" />
              {v.columns.map((c) => (
                <th key={c.key} scope="col" className={`relative ${cell} pb-1 text-center ${termLabel} leading-4 font-normal text-body`}>
                  <span aria-hidden="true">T{c.term}</span>
                  <span className="sr-only">{`Grade ${c.grade} Term ${c.term}`}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {v.rows.map((r) => (
              <tr key={r.family}>
                <th scope="row" className={`sticky left-0 z-10 bg-card py-1.5 pr-3 text-left text-[14px] leading-[1.2] font-semibold ${strand}`}>
                  {r.name}
                </th>
                {r.cells.map((c, i) => (
                  <td key={v.columns[i]!.key} className={`${cell} py-1.5 text-center`}>
                    <span role="img" aria-label={c.alt} className={fits ? 'flex max-lg:justify-center lg:inline-flex' : 'inline-flex'}>
                      <Dot level={c.level} crowded={crowded} />
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {terms > PHONE_FITS ? (
        <p className="m-0 text-[13px] leading-[1.4] text-body lg:hidden">Swipe sideways to see every term.</p>
      ) : terms >= SCROLLS_UNDER_360_FROM ? (
        <p className="m-0 hidden text-[13px] leading-[1.4] text-body max-[359px]:block">Swipe sideways to see every term.</p>
      ) : null}
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

/** One subject: its name over the grid. With more than one subject the names are chips, and the one on the screen is dark. */
function SubjectBar({ v, path }: { v: LongView; path: string }) {
  if (v.subjects.length < 2) {
    return (
      <h2 className="m-0 text-[15px] leading-[1.3] font-semibold" data-subject-heading>
        {v.subject}
      </h2>
    )
  }
  return (
    <nav aria-label="Subjects">
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {v.subjects.map((s) => (
          <li key={s.name}>
            <Link
              href={subjectLinkOf(path, s.name)}
              scroll={false}
              aria-current={s.selected ? 'page' : undefined}
              className={`inline-flex min-h-11 items-center rounded-pill px-4 text-[15px] font-semibold no-underline ${s.selected ? 'bg-ink text-white' : 'bg-soft-2 text-ink'}`}
            >
              {s.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

function Cards({ patterns, parentName }: { patterns: LvPattern[]; parentName: string | null }) {
  return (
    <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start">
      {patterns.map((p) => (
        <PatternCard key={p.id} p={p} parentName={parentName} />
      ))}
    </div>
  )
}

/**
 * The teacher's Long view of one learner: the marks across the years, then each pattern Jemma found with where it comes from.
 * The teacher checks a pattern, talks to the parent, and only then does the parent see it. The learner never does.
 * One layout for phone and laptop: the grid scrolls inside its card on a phone, and the cards sit in two columns on a laptop.
 */
export default async function LongViewPage({
  params,
  searchParams,
}: {
  params: Promise<{ classId: string; childId: string }>
  searchParams: Promise<{ subject?: string | string[] }>
}) {
  const { classId, childId } = await params
  const { subject: asked } = await searchParams
  await requireRole('teacher')
  const v = await getLongView(classId, childId, typeof asked === 'string' ? asked : (asked?.[0] ?? null))
  if (!v) notFound()
  const { setAside } = v.groups
  const base = `/t/${classId}`
  const many = v.subjects.length > 1

  return (
    <div className="leading-[normal] lg:max-w-[1100px]">
      <BackHeader href={`${base}/learners/${childId}/profile`} backLabel={`Back to ${v.name}'s profile`} eyebrow={`${v.name} · ${v.className}`} title="Long view" />
      <div className="flex flex-col gap-[18px] px-5 pt-2 pb-6 lg:px-8">
        <h1 className="sr-only">{`${v.name}'s Long view`}</h1>
        {v.spanLine ? <p className="m-0 text-[14px] leading-[1.4] text-body">{v.spanLine}</p> : null}

        <SubjectBar v={v} path={`${base}/learners/${childId}/long-view`} />

        <Grid v={v} />

        {v.subjectPatternCount === 0 ? <EmptyState title="Too early to tell" body="A pattern needs 3 terms of clear results." /> : null}

        {v.bySubject.length > 0 ? (
          <section aria-labelledby="lv-patterns" className="flex flex-col gap-3">
            <h2 id="lv-patterns" className="m-0 text-[17px] font-semibold">
              What Jemma found
            </h2>
            {many ? (
              v.bySubject.map((g) => (
                <div key={g.subject} className="flex flex-col gap-3">
                  <h3 className="m-0 text-[15px] leading-[1.3] font-semibold text-body">{g.subject}</h3>
                  <Cards patterns={g.open} parentName={v.parentName} />
                </div>
              ))
            ) : (
              <Cards patterns={v.bySubject[0]!.open} parentName={v.parentName} />
            )}
          </section>
        ) : null}

        {setAside.length > 0 ? <SetAside patterns={setAside} parentName={v.parentName} withSubject={many} /> : null}

        <CouldNotUse v={v} />
        <UpdateBar childId={childId} state={v.update.state} lastUpdated={v.update.lastUpdated} />
        {v.update.askOnOpen ? <OpenUpdate childId={childId} /> : null}
      </div>
    </div>
  )
}
