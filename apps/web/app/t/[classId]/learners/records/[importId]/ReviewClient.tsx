'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { SelectBox } from '@/app/t/new/SelectBox'
import { Button, Card, Pill, RetryIcon } from '@/components/ui'
import type { ProblemRow, ReviewView } from '@/lib/data/p66'
import { Poller } from '../../../snap/Poller'
import { Lead } from '../../../tests/back-header'
import { addToRecords, discardRecords, fixRow, retryRead } from '../actions'

type Outcome = { ok: true } | { ok: false; reason: string }

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many)

/** Runs one server action, keeps the tap pending until the screen has the new state, and holds what went wrong. */
function useRun() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState('')
  const [which, setWhich] = useState('')
  const run = (name: string, fn: () => Promise<Outcome>) => {
    setError('')
    setWhich(name)
    start(async () => {
      const r = await fn()
      if (r.ok) router.refresh()
      else setError(r.reason)
    })
  }
  return { pending, error, which, run }
}

function Problem({ text }: { text: string }) {
  return (
    <p role="alert" className="m-0 rounded-14 bg-[#FFEDE8] px-3.5 py-2.5 text-[15px] leading-[1.4] text-coral-text">
      {text}
    </p>
  )
}

const stat = 'flex min-w-0 flex-col gap-0.5 rounded-14 bg-soft-2 px-3 py-2.5'

export function ReviewClient({ view }: { view: ReviewView }) {
  return (
    <>
      <Poller active={view.state === 'reading'} />
      {view.state === 'reading' ? <Reading view={view} /> : null}
      {view.state === 'failed' ? <Failed view={view} /> : null}
      {view.state === 'ready' ? <Ready view={view} /> : null}
      {view.state === 'added' ? <Added view={view} /> : null}
      {view.state === 'discarded' ? <Discarded view={view} /> : null}
    </>
  )
}

function Reading({ view }: { view: ReviewView }) {
  return (
    <>
      <Lead>{`Jemma is reading ${view.fileName}.`}</Lead>
      <Card as="section" radius={20} aria-labelledby="reading" className="gap-2 lg:max-w-[720px]">
        <h2 id="reading" className="m-0 text-[17px] font-semibold">
          Working out the columns
        </h2>
        <p role="status" className="m-0 text-[15px] leading-[1.45] text-body">
          Jemma looks at the column names and the first rows, then reads every row. This can take a minute. You can leave this page: a Check item will wait on your home screen when it is ready.
        </p>
      </Card>
    </>
  )
}

function Failed({ view }: { view: ReviewView }) {
  const { pending, error, run } = useRun()
  return (
    <>
      <Lead>{`Jemma could not read ${view.fileName}.`}</Lead>
      <Card as="section" radius={20} aria-labelledby="failed" className="gap-3 lg:max-w-[720px]">
        <h2 id="failed" className="m-0 text-[17px] font-semibold">
          It did not work
        </h2>
        <p className="m-0 text-[15px] leading-[1.45]">{view.failure}</p>
        {error ? <Problem text={error} /> : null}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button icon={<RetryIcon size={18} />} pending={pending} onClick={() => run('retry', () => retryRead(view.id))}>
            Try again
          </Button>
          <Button variant="secondary" href={`/t/${view.classId}/learners/records`}>
            Add a different file
          </Button>
        </div>
      </Card>
    </>
  )
}

function Discarded({ view }: { view: ReviewView }) {
  return (
    <>
      <Lead>{`You discarded ${view.fileName}. Nothing was added.`}</Lead>
      <Button variant="secondary" href={`/t/${view.classId}/learners/records`} className="lg:max-w-[320px]">
        Add past records
      </Button>
    </>
  )
}

function Added({ view }: { view: ReviewView }) {
  const { pending, error, run } = useRun()
  const written = view.written
  const none = !written || written.records === 0
  return (
    <>
      <Lead>
        {none ? `You said yes to ${view.fileName}, but nothing was added yet.` : `Added ${written.records} past ${plural(written.records, 'record')} from ${view.fileName}.`}
      </Lead>
      <Card as="section" radius={20} aria-labelledby="added" className="gap-3 lg:max-w-[720px]" tone="coral">
        <h2 id="added" className="m-0 text-[17px] font-semibold">
          {none ? 'Add them now' : `${written.learners.length} ${plural(written.learners.length, 'learner')} got new records`}
        </h2>
        <p className="m-0 text-[15px] leading-[1.45]">
          {view.approvedBy ? `You said yes on ${view.approvedOn}, and it is logged with your name. ` : ''}
          {none
            ? 'Tap the button to add the records you approved.'
            : 'Each record shows that it came from this file, which row, and who added it. Their Long views are updating. Nothing is shared with a parent or a learner until you have talked to the family.'}
        </p>
        {error ? <Problem text={error} /> : null}
        {none ? (
          <Button pending={pending} onClick={() => run('add', () => addToRecords(view.id))}>
            Add to records
          </Button>
        ) : (
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0" aria-label="Open a Long view">
            {written.learners.map((l) => (
              <li key={l.id}>
                <Link href={`/t/${view.classId}/learners/${l.id}/long-view`} className="inline-flex min-h-11 items-center rounded-12 border-[1.5px] border-ink bg-card px-3.5 text-[15px] font-semibold text-ink no-underline">
                  {`${l.name}'s Long view`}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Button variant="secondary" href={`/t/${view.classId}/learners`} className="lg:max-w-[320px]">
        Back to learners
      </Button>
    </>
  )
}

function Ready({ view }: { view: ReviewView }) {
  const c = view.counts
  const results = c.rows - c.empty
  const gate = useRun()
  return (
    <>
      <Lead>{`Jemma read ${view.fileName}. Check ${results} past ${plural(results, 'result')} before they are added.`}</Lead>

      <div className="flex flex-col gap-[18px] lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <Card as="section" radius={20} aria-labelledby="what" className="gap-3">
          <h2 id="what" className="m-0 text-[17px] font-semibold">
            What Jemma understood
          </h2>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {view.lines.map((l) => (
              <li key={l} className="text-[15px] leading-[1.45]">
                {l}
              </li>
            ))}
          </ul>
          {view.assumptions.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <h3 className="m-0 text-[13px] font-semibold text-body">What Jemma assumed</h3>
              {view.assumptions.map((a) => (
                <p key={a} className="m-0 text-[14px] leading-[1.45] text-body">
                  {a}
                </p>
              ))}
            </div>
          ) : null}
          {view.warnings.map((w) => (
            <p key={w} className="m-0 rounded-14 bg-[#FFEDE8] px-3 py-2 text-[14px] leading-[1.4] text-coral-text">
              {w}
            </p>
          ))}
        </Card>

        <Card as="section" radius={20} aria-labelledby="counts" className="gap-3">
          <h2 id="counts" className="m-0 text-[17px] font-semibold">
            What is in the file
          </h2>
          <dl className="m-0 grid grid-cols-2 gap-2">
            <div className={stat}>
              <dt className="text-[13px] text-body">Rows read</dt>
              <dd className="m-0 text-[22px] font-bold tabular-nums">{c.rows}</dd>
            </div>
            <div className={stat}>
              <dt className="text-[13px] text-body">Ready to add</dt>
              <dd className="m-0 text-[22px] font-bold tabular-nums">{c.ready}</dd>
            </div>
            <div className={stat}>
              <dt className="text-[13px] text-body">Need a look</dt>
              <dd className="m-0 text-[22px] font-bold tabular-nums">{c.withProblems}</dd>
            </div>
            <div className={stat}>
              <dt className="text-[13px] text-body">Skipped by you</dt>
              <dd className="m-0 text-[22px] font-bold tabular-nums">{c.skipped}</dd>
            </div>
          </dl>
          <p className="m-0 text-[13px] leading-[1.4] text-body">
            Row numbers are as in your file: the first line, with the column names, is row 1.
            {c.empty > 0 ? ` ${c.empty} ${plural(c.empty, 'row has', 'rows have')} nothing to add.` : ''}
          </p>
        </Card>
      </div>

      {view.problemRows.length > 0 ? (
        <section aria-labelledby="look" className="flex flex-col gap-3">
          <h2 id="look" className="m-0 text-[17px] font-semibold">
            {`Rows to look at (${view.problemRows.length})`}
          </h2>
          <p className="m-0 text-[14px] leading-[1.4] text-body">A row with a problem is left out until you fix it or skip it.</p>
          <ul className="m-0 flex list-none flex-col gap-3 p-0 lg:grid lg:grid-cols-2 lg:items-start">
            {view.problemRows.map((r) => (
              <li key={r.n}>
                <ProblemCard view={view} row={r} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {view.sample.length > 0 ? (
        <Card as="section" radius={20} aria-labelledby="sample" className="gap-2">
          <h2 id="sample" className="m-0 text-[17px] font-semibold">
            {`A sample of the rows that are ready (${view.sample.length} of ${c.ready})`}
          </h2>
          <ul className="m-0 flex list-none flex-col p-0">
            {view.sample.map((s, i) => (
              <li key={s.n} className={`flex flex-col gap-0.5 py-2 ${i > 0 ? 'border-t border-soft' : ''}`}>
                <span className="text-[15px] font-semibold">{`${s.who} · ${s.title}`}</span>
                <span className="text-[14px] text-body">{[s.mark, s.when, s.strand].filter(Boolean).join(' · ')}</span>
                <span className="text-[12px] text-body">{`Row ${s.n}`}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card as="section" radius={20} aria-labelledby="gate" tone="coral" className="gap-3 lg:max-w-[720px]">
        <h2 id="gate" className="m-0 text-[17px] font-semibold">
          Add to the learners' records
        </h2>
        <p className="m-0 text-[15px] leading-[1.45]">
          {c.ready === 0
            ? 'Nothing is ready to add yet. Fix or skip the rows with a problem above.'
            : `Jemma will add ${c.records} ${plural(c.records, 'record')} for ${view.readyLearners} ${plural(view.readyLearners, 'learner')}. Each one shows that it came from ${view.fileName}, which row, and that you added it.${c.withProblems > 0 ? ` ${c.withProblems} ${plural(c.withProblems, 'row')} with a problem will be left out.` : ''}`}
        </p>
        <p className="m-0 text-[14px] leading-[1.4] text-body">Nothing reaches a parent or a learner. A pattern is only shared after you have talked to the family.</p>
        {gate.error ? <Problem text={gate.error} /> : null}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button size="lg" disabled={c.ready === 0 || gate.pending} pending={gate.pending && gate.which === 'add'} onClick={() => gate.run('add', () => addToRecords(view.id))}>
            Add to records
          </Button>
          <Button size="lg" variant="secondary" disabled={gate.pending} pending={gate.pending && gate.which === 'discard'} onClick={() => gate.run('discard', () => discardRecords(view.id))}>
            Discard
          </Button>
        </div>
      </Card>
    </>
  )
}

function ProblemCard({ view, row }: { view: ReviewView; row: ProblemRow }) {
  const { pending, error, which, run } = useRun()
  const [learner, setLearner] = useState('')
  const [strand, setStrand] = useState('')
  const busy = (name: string) => pending && which === name
  const smallBtn = 'min-h-11 !h-auto !py-2'
  return (
    <Card as="article" radius={18} aria-label={`Row ${row.n}`} className="gap-3">
      <div className="flex flex-col gap-1">
        <h3 className="m-0 flex flex-wrap items-center gap-2 text-[16px] font-semibold">
          {`Row ${row.n}`}
          <Pill tone="danger" className="!py-0.5 !text-[12px]">
            Needs a look
          </Pill>
        </h3>
        <p className="m-0 text-[14px] leading-[1.4] text-body [overflow-wrap:anywhere]">{row.summary}</p>
      </div>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {row.problems.map((p) => (
          <li key={p.kind} className="text-[15px] leading-[1.4]">
            {p.text}
          </li>
        ))}
      </ul>
      {row.pickLearner ? (
        <div className="flex flex-col gap-2">
          <label htmlFor={`learner-${row.n}`} className="text-[14px] font-medium">{`Which learner is row ${row.n}?`}</label>
          <SelectBox id={`learner-${row.n}`} value={learner} onChange={setLearner}>
            <option value="">Pick a learner</option>
            {row.learnerOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </SelectBox>
          <Button size="sm" className={smallBtn} aria-label={`Use this learner for row ${row.n}`} disabled={learner === '' || pending} pending={busy('learner')} onClick={() => run('learner', () => fixRow(view.id, { row: row.n, childId: learner }))}>
            Use this learner
          </Button>
        </div>
      ) : null}
      {row.pickStrand ? (
        <div className="flex flex-col gap-2">
          <label htmlFor={`strand-${row.n}`} className="text-[14px] font-medium">{`Which strand is row ${row.n}?`}</label>
          {view.families ? (
            <SelectBox id={`strand-${row.n}`} value={strand} onChange={setStrand}>
              <option value="">Pick a strand</option>
              {view.families.map((f) => (
                <option key={f.family} value={f.family}>
                  {f.label}
                </option>
              ))}
            </SelectBox>
          ) : (
            <input id={`strand-${row.n}`} type="text" value={strand} onChange={(e) => setStrand(e.target.value)} placeholder="A short word, like fractions" className="h-[52px] rounded-14 border border-muted-2 bg-card px-3.5 text-[17px] text-ink" />
          )}
          <Button size="sm" className={smallBtn} aria-label={`Use this strand for row ${row.n}`} disabled={strand.trim() === '' || pending} pending={busy('strand')} onClick={() => run('strand', () => fixRow(view.id, { row: row.n, family: strand }))}>
            Use this strand
          </Button>
        </div>
      ) : null}
      {error ? <Problem text={error} /> : null}
      <div className="flex flex-wrap gap-2">
        {row.canKeep ? (
          <Button size="sm" variant="secondary" className={smallBtn} aria-label={`Keep row ${row.n}`} disabled={pending} pending={busy('keep')} onClick={() => run('keep', () => fixRow(view.id, { row: row.n, keep: true }))}>
            Keep this row
          </Button>
        ) : null}
        <Button size="sm" variant="secondary" className={smallBtn} aria-label={`Skip row ${row.n}`} disabled={pending} pending={busy('skip')} onClick={() => run('skip', () => fixRow(view.id, { row: row.n, skip: true }))}>
          Skip this row
        </Button>
      </div>
    </Card>
  )
}
