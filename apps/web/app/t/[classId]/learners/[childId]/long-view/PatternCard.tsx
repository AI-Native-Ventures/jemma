'use client'

import { useState, useTransition } from 'react'
import { Button, Card, Chip, ChevronDownIcon, ChevronRightIcon, NoteIcon, Pill, ReportIcon, Sheet } from '@/components/ui'
import type { LvEvidence, LvPattern, LvSheet } from '@/lib/data/p52'
import { approvePattern, dismissPattern, markDiscussed, restorePattern, type ActionResult } from './actions'

const chipButton =
  'inline-flex leading-[normal] min-h-11 max-w-full cursor-pointer items-center gap-1.5 rounded-12 border-0 bg-soft-2 px-3 py-1.5 text-left text-[14px] font-semibold text-ink [overflow-wrap:anywhere]'

/** A pattern with more sources than this shows only its first `SOURCES_SHOWN` until the teacher asks for the rest. */
const SOURCES_FEW = 4
const SOURCES_SHOWN = 3

/** Not a source: an outline button with a chevron, as tall as a chip row's tap target. */
const showMoreButton =
  'inline-flex leading-[normal] min-h-11 cursor-pointer items-center gap-1.5 rounded-12 border-[1.5px] border-ink bg-card px-3 py-1.5 text-[14px] font-semibold text-ink'

function EvidenceChip({ e, onOpen }: { e: LvEvidence; onOpen: (s: LvSheet) => void }) {
  const icon = e.kind === 'note' ? <NoteIcon size={15} /> : <ReportIcon size={15} />
  const cls = 'max-w-full py-1.5 text-left [overflow-wrap:anywhere]'
  if (e.kind === 'result') {
    return (
      <Chip href={e.href ?? undefined} icon={icon} className={cls}>
        {e.label}
      </Chip>
    )
  }
  const sheet = e.sheet
  if (!sheet) {
    return (
      <Chip icon={icon} className={cls}>
        {e.label}
      </Chip>
    )
  }
  return (
    <button type="button" onClick={() => onOpen(sheet)} className={chipButton}>
      {icon}
      {e.label}
    </button>
  )
}

function Fact({ label, children }: { label: string; children: string }) {
  return (
    <div className="flex gap-3 text-[15px] leading-[1.4]">
      <dt className="w-32 flex-none text-body">{label}</dt>
      <dd className="m-0 min-w-0 font-semibold [overflow-wrap:anywhere]">{children}</dd>
    </div>
  )
}

function EvidenceSheet({ sheet, onClose }: { sheet: LvSheet | null; onClose: () => void }) {
  if (!sheet) return null
  return (
    <Sheet open onClose={onClose} title={sheet.title}>
      <dl className="m-0 flex flex-col gap-2">
        {sheet.teacher ? <Fact label="Teacher">{sheet.teacher}</Fact> : null}
        {sheet.grade !== null && sheet.term !== null ? <Fact label="Grade and term">{`Grade ${sheet.grade}, Term ${sheet.term}`}</Fact> : null}
        <Fact label="Date">{sheet.date}</Fact>
        {sheet.marks ? <Fact label="Marks">{sheet.marks}</Fact> : null}
      </dl>
      {sheet.text ? <p className="m-0 rounded-14 bg-soft-2 p-3 text-[15px] leading-[1.5] [overflow-wrap:anywhere]">{sheet.text}</p> : null}
      {sheet.late ? (
        <p className="m-0 flex flex-wrap items-center gap-2 text-[14px] leading-[1.4] text-body">
          <Pill tone="quiet" className="!py-1 !text-[13px]">
            Logged late
          </Pill>
          It was written into the records long after it happened. It still counts.
        </p>
      ) : null}
      <Button variant="secondary" size="sm" onClick={onClose}>
        Close
      </Button>
    </Sheet>
  )
}

/** Runs one server action and keeps the tap pending until the screen has the new state. */
function useDecision() {
  const [pending, start] = useTransition()
  const [which, setWhich] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const run = (name: string, fn: () => Promise<ActionResult>) => {
    setError(null)
    setWhich(name)
    start(async () => {
      const r = await fn()
      if (!r.ok) setError(r.reason)
    })
  }
  return { pending, which, error, run }
}

/** One pattern: what was seen, where it comes from, and what the teacher can do with it now. */
export function PatternCard({ p, parentName }: { p: LvPattern; parentName: string | null }) {
  const [open, setOpen] = useState<LvSheet | null>(null)
  const [allSources, setAllSources] = useState(false)
  const d = useDecision()
  const total = p.evidence.length
  const folded = total > SOURCES_FEW
  const shown = folded && !allSources ? p.evidence.slice(0, SOURCES_SHOWN) : p.evidence
  return (
    <Card as="article" aria-labelledby={`pattern-${p.id}`} radius={20} className="gap-3">
      <div className="flex">
        <Pill tone={p.kind === 'struggle' ? 'coral' : 'soft'}>{p.pill}</Pill>
      </div>
      <h3 id={`pattern-${p.id}`} className="m-0 text-[17px] leading-[1.3] font-semibold text-pretty">
        {p.title}
      </h3>
      <p className="m-0 text-[15px] leading-[1.45]">{p.statement}</p>
      {p.since ? <p className="m-0 text-[14px] leading-[1.4] text-body">{p.since}</p> : null}

      <section aria-label={`Where this comes from, ${p.title}`} className="flex flex-col gap-1.5">
        <h4 className="m-0 text-[13px] font-semibold text-body">Where this comes from</h4>
        <div id={`sources-${p.id}`} className="flex flex-wrap gap-1.5">
          {shown.map((e, i) => (
            <EvidenceChip key={`${e.kind}-${e.id}-${i}`} e={e} onOpen={setOpen} />
          ))}
          {folded ? (
            <button type="button" aria-expanded={allSources} aria-controls={`sources-${p.id}`} onClick={() => setAllSources((v) => !v)} className={showMoreButton}>
              {allSources ? 'Show fewer' : `Show all ${total}`}
              <ChevronDownIcon size={15} className={`flex-none ${allSources ? 'rotate-180' : ''}`} />
            </button>
          ) : null}
        </div>
      </section>

      {p.status === 'draft' ? (
        <div className="flex gap-2">
          <Button size="sm" className="flex-1" pending={d.pending && d.which === 'approve'} disabled={d.pending} onClick={() => d.run('approve', () => approvePattern(p.id))}>
            Looks right
          </Button>
          <Button variant="secondary" size="sm" className="flex-1" pending={d.pending && d.which === 'dismiss'} disabled={d.pending} onClick={() => d.run('dismiss', () => dismissPattern(p.id))}>
            Not yet
          </Button>
        </div>
      ) : null}

      {p.status === 'approved' ? (
        <>
          <p className="m-0 text-[14px] leading-[1.4] text-body">You said this looks right on {p.approvedOn}.</p>
          <div className="flex flex-col gap-2.5 rounded-14 bg-soft-2 p-3">
            {parentName ? (
              <>
                <p className="m-0 text-[15px] leading-[1.45]">
                  <strong className="font-semibold">Not shared.</strong> Talk to {parentName} first.
                </p>
                <Button variant="secondary" size="sm" pending={d.pending} disabled={d.pending} onClick={() => d.run('discuss', () => markDiscussed(p.id))}>
                  We have talked
                </Button>
              </>
            ) : (
              <p className="m-0 text-[15px] leading-[1.45]">No parent is linked yet. This stays with you.</p>
            )}
          </div>
        </>
      ) : null}

      {p.status === 'discussed' ? (
        <p className="m-0 text-[14px] leading-[1.4] text-body">
          {parentName ? `Shared with ${parentName} after your talk on ${p.discussedOn}.` : `Shared after your talk on ${p.discussedOn}.`}
        </p>
      ) : null}

      {d.error ? (
        <p role="alert" className="m-0 text-[14px] leading-[1.4] font-semibold text-coral-text">
          {d.error}
        </p>
      ) : null}
      <EvidenceSheet sheet={open} onClose={() => setOpen(null)} />
    </Card>
  )
}

/** The closed group at the bottom: patterns the teacher set aside, and ones the records no longer show. */
export function SetAside({ patterns, parentName }: { patterns: LvPattern[]; parentName: string | null }) {
  const d = useDecision()
  return (
    <details className="group rounded-18 border border-line bg-card">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-4 text-[16px] font-semibold [&::-webkit-details-marker]:hidden">
        <span>Set aside</span>
        <span className="flex items-center gap-2 text-[14px] text-body">
          {patterns.length}
          <ChevronRightIcon className="flex-none transition-transform group-open:rotate-90" />
        </span>
      </summary>
      <ul className="m-0 flex list-none flex-col px-4 pb-1">
        {patterns.map((p) => (
          <li key={p.id} className="flex flex-col gap-1 border-t border-soft py-3">
            <span className="text-[16px] leading-[1.3] font-semibold">{p.title}</span>
            {p.noLongerShows ? (
              <>
                <span className="text-[14px] leading-[1.4] text-body">This no longer shows in the results.</span>
                {p.status === 'discussed' ? (
                  <span className="text-[14px] leading-[1.4] text-body">{`It was shared with ${parentName ?? 'the parent'} on ${p.discussedOn}. They no longer see it.`}</span>
                ) : null}
              </>
            ) : (
              <>
                <span className="text-[14px] leading-[1.4] text-body">You set this aside on {p.dismissedOn}.</span>
                <Button variant="link" className="self-start" pending={d.pending && d.which === p.id} disabled={d.pending} onClick={() => d.run(p.id, () => restorePattern(p.id))}>
                  Bring back
                </Button>
              </>
            )}
          </li>
        ))}
      </ul>
      {d.error ? (
        <p role="alert" className="m-0 px-4 pb-3 text-[14px] font-semibold text-coral-text">
          {d.error}
        </p>
      ) : null}
    </details>
  )
}
