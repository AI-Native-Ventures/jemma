'use client'

import { useState } from 'react'
import type { DiagramSpec } from '@jemma/profiling/schemas'
import { DiagramView } from '@/components/diagrams'
import { IconLabel } from '@/components/ui/IconLabel'
import type { LessonForChild } from '../[sessionId]/types'
import { BarRows, rowFills, type Fill, type RowSpec } from './Bars'
import { FractionText } from './Frac'
import { DIAGRAM_ICON, LearnBadge } from './LearnCards'

type Step = NonNullable<LessonForChild['diagram']>['steps'][number]

const rowsOf = (spec: DiagramSpec): RowSpec[] | null => (spec.kind === 'fraction_bar' ? spec.rows : null)

/** What one step draws. Rows that only restate the amount above them are folded into one cut-up row. */
function stepRows(step: Step, previous?: Step) {
  const rows = rowsOf(step.diagram)
  if (!rows) return null
  const value = (r: RowSpec) => r.shaded / r.parts
  const last = rows[rows.length - 1]!
  const first = rows[0]!
  const restated = rows.length === 2 && Math.abs(value(first) - value(last)) < 1e-9 && first.parts !== last.parts
  if (restated) {
    const ratio = last.parts / first.parts
    const dashed = Array.from({ length: last.parts }, (_, i) => i).filter((i) => Number.isInteger(ratio) && i < last.shaded && (i + 1) % ratio !== 0)
    return { rows: [last], fills: rowFills([last]), dashed: { 0: dashed } }
  }
  const prevRows = previous ? rowsOf(previous.diagram) : null
  const prevLast = prevRows ? prevRows[prevRows.length - 1] : undefined
  const carry = prevLast && rows.length === 1 ? { parts: prevLast.parts, coral: prevLast.shaded } : undefined
  return { rows, fills: rowFills(rows, carry), dashed: undefined }
}

function Picture({ step, previous }: { step: Step; previous?: Step }) {
  const drawn = stepRows(step, previous)
  if (!drawn) return <DiagramView spec={step.diagram} variant="learn" />
  return (
    <BarRows
      rows={drawn.rows}
      fills={drawn.fills as Fill[][]}
      dashed={drawn.dashed}
      height={34}
      radius={7}
      labelWidth={34}
      labelSize={17}
      labelRule={2}
      labelGap={2}
      labelSide={3}
      gap={10}
    />
  )
}

export type LearnDiagramProps = { lesson: LessonForChild; onReady: () => void }

export function LearnDiagram({ lesson, onReady }: LearnDiagramProps) {
  const d = lesson.diagram!
  const [plays, setPlays] = useState(0)
  const contrastRows = d.contrast ? rowsOf(d.contrast.diagram) : null
  const contrastLast = contrastRows?.[contrastRows.length - 1]
  const contrastName = contrastLast?.label ?? (contrastLast ? `${contrastLast.shaded}/${contrastLast.parts}` : null)
  return (
    <main className="flex flex-1 flex-col gap-4 px-5 pt-[18px] pb-[26px]">
      <style>{`@keyframes p27-step{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}`}</style>
      <div className="flex items-center justify-between">
        <p className="m-0 text-[15px] font-semibold text-body">Learn</p>
        <LearnBadge icon={DIAGRAM_ICON}>Diagram</LearnBadge>
      </div>
      <h1 className="m-0 text-[28px] leading-[1.15] font-bold tracking-[-0.015em]">
        <FractionText text={lesson.title} size={34} rule={3} gap={4} side={4} />
      </h1>
      <figure key={plays} className="m-0 flex flex-col gap-3.5 rounded-[24px] border border-line bg-card px-4 py-[18px]">
        <figcaption className="sr-only">{d.caption}</figcaption>
        {d.steps.map((step, i) => (
          <div
            key={i}
            className={`flex flex-col gap-2 ${i > 0 ? 'border-t border-dashed border-edge pt-3.5' : ''}`}
            style={plays > 0 ? { animation: `p27-step 400ms ease-out ${i * 450}ms both` } : undefined}
          >
            <span className="flex gap-2 text-[15px] font-semibold">
              <span className="flex size-[22px] flex-none items-center justify-center rounded-pill bg-ink text-[12px] text-white">{i + 1}</span>
              <FractionText text={step.caption} size={20} rule={2} gap={3} side={3} />
            </span>
            <Picture step={step} previous={d.steps[i - 1]} />
          </div>
        ))}
      </figure>
      {d.contrast ? (
        <aside
          aria-label={contrastName ? `Why not ${contrastName}` : 'Why not'}
          className="flex flex-col gap-2.5 rounded-20 border border-[#FFC9BB] bg-coral-wash p-4"
        >
          <span className="text-[16px] font-bold">{contrastName ? `Why not ${contrastName}?` : 'Why not?'}</span>
          {contrastLast ? (
            <BarRows
              rows={[contrastLast]}
              fills={[Array.from({ length: contrastLast.parts }, (_, i): Fill => (i < contrastLast.shaded ? 'grey' : 'none'))]}
              height={28}
              white
              radius={7}
              labelWidth={34}
              labelSize={17}
              labelRule={2}
              labelGap={2}
              labelSide={3}
              gap={10}
            />
          ) : (
            <DiagramView spec={d.contrast.diagram} variant="learn" />
          )}
          <span className="text-[15px] leading-[1.45]">{d.contrast.caption}</span>
        </aside>
      ) : null}
      <div className="flex-1" />
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2.5">
        <button
          type="button"
          onClick={() => setPlays((n) => n + 1)}
          className="flex min-h-[60px] cursor-pointer items-center justify-center gap-2 rounded-18 border-2 border-ink bg-card px-5 py-3 text-center text-[17px] font-semibold text-balance text-ink"
        >
          <IconLabel
            gap={8}
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 12a8 8 0 1 0 2.34-5.66" />
                <path d="M4 4v4.5h4.5" />
              </svg>
            }
          >
            Again
          </IconLabel>
        </button>
        <button type="button" onClick={onReady} className="min-h-[60px] cursor-pointer rounded-18 border-0 bg-ink px-5 py-3 text-center text-[19px] font-bold text-balance text-white">
          I&apos;m ready
        </button>
      </div>
    </main>
  )
}
