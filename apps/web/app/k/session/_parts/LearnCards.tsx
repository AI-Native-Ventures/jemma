'use client'

import type { DiagramSpec, SeniorDiagramSpec } from '@jemma/profiling/schemas'
import { DiagramView } from '@/components/diagrams'
import type { LessonForChild } from '../[sessionId]/types'
import { BarRows, rowFills } from './Bars'
import { FractionText } from './Frac'

export function LearnBadge({ children, icon }: { children: string; icon: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-pill bg-soft-4 px-[11px] py-[5px] text-[13px] font-semibold">
      {icon}
      {children}
    </span>
  )
}

const svg = { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const

export const CARDS_ICON = (
  <svg {...svg}><rect x="6" y="3.5" width="12" height="15" rx="2" /><path d="M9 8h6M9 11.5h6M9 15h3" /></svg>
)
export const DIAGRAM_ICON = (
  <svg {...svg}><rect x="3.5" y="5" width="17" height="5" rx="1" /><rect x="3.5" y="14" width="17" height="5" rx="1" /><path d="M12 5v5M8 14v5M12 14v5M16 14v5" /></svg>
)
export const AUDIO_ICON = (
  <svg {...svg}><path d="M4 14v-2a8 8 0 0 1 16 0v2" /><rect x="3.5" y="14" width="4" height="6" rx="1.5" /><rect x="16.5" y="14" width="4" height="6" rx="1.5" /></svg>
)

const PIECES: Record<number, string> = { 2: 'halves', 3: 'thirds', 4: 'quarters', 5: 'fifths', 6: 'sixths', 8: 'eighths', 10: 'tenths' }

/** Two rows showing one amount cut two ways get the board's caption. */
function sameAmountCaption(spec: Extract<DiagramSpec, { kind: 'fraction_bar' }>): string | null {
  const [a, b] = spec.rows
  if (spec.rows.length !== 2 || !a || !b || a.parts === b.parts || a.shaded * b.parts !== b.shaded * a.parts) return null
  const name = PIECES[Math.max(a.parts, b.parts)]
  return name ? `Same amount. Now it's in ${name}.` : null
}

function CardPicture({ spec }: { spec: SeniorDiagramSpec }) {
  if (spec.kind !== 'fraction_bar') return <DiagramView spec={spec} variant="learn" />
  return (
    <div aria-hidden="true" className="flex flex-col gap-2.5 bg-[#F7F6FB] p-4 [border-radius:18px]">
      <BarRows
        rows={spec.rows}
        fills={rowFills(spec.rows)}
        height={30}
        radius={7}
        labelWidth={40}
        labelSize={20}
        labelRule={2.5}
        labelGap={2}
        labelSide={3}
        gap={12}
      />
      {sameAmountCaption(spec) ? <span className="text-center text-[15px] font-semibold text-ink">{sameAmountCaption(spec)}</span> : null}
    </div>
  )
}

/** Body text with `a/b = c/d` style sums shown bold, as the cards do. */
function CardBody({ text }: { text: string }) {
  const m = /^(.*?:\s*)(\d+\/\d+(?:\s*[+=]\s*\d+\/\d+)+)\s*$/.exec(text)
  if (m) {
    return (
      <p className="m-0 text-[19px] leading-[1.5]">
        {m[1]}
        <strong className="font-bold whitespace-nowrap">
          <FractionText text={m[2]!} size={26} rule={2.5} gap={3} side={3} />
        </strong>
      </p>
    )
  }
  return (
    <p className="m-0 text-[19px] leading-[1.5]">
      <FractionText text={text} size={26} rule={2.5} gap={3} side={3} />
    </p>
  )
}

export type LearnCardsProps = { lesson: LessonForChild; card: number; onBack: () => void; onNext: () => void }

export function LearnCards({ lesson, card, onBack, onNext }: LearnCardsProps) {
  const cards = lesson.cards ?? []
  const current = cards[card]!
  const last = card === cards.length - 1
  return (
    <main className="flex flex-1 flex-col gap-[18px] px-5 pt-5 pb-7">
      <div className="flex items-center justify-between">
        <p className="m-0 text-[15px] font-semibold text-body">Learn · card {card + 1} of {cards.length}</p>
        <LearnBadge icon={CARDS_ICON}>Reading cards</LearnBadge>
      </div>
      <article className="flex flex-1 flex-col gap-[18px] rounded-[28px] border border-line bg-card px-[22px] py-6 shadow-[0_10px_30px_rgba(31,29,54,0.07)]">
        <h1 className="m-0 text-[28px] leading-[1.15] font-bold tracking-[-0.015em]">
          <FractionText text={current.heading} size={34} rule={3} gap={4} side={4} />
        </h1>
        <CardBody text={current.body} />
        {current.diagram ? <CardPicture spec={current.diagram} /> : null}
      </article>
      <div aria-hidden="true" className="flex justify-center gap-2">
        {cards.map((_, i) => (
          <span key={i} className={`h-2 rounded-pill ${i === card ? 'w-6 bg-coral' : i < card ? 'w-2 bg-ink' : 'w-2 bg-edge'}`} />
        ))}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-2.5">
        <button type="button" onClick={onBack} disabled={card === 0} className="min-h-[60px] cursor-pointer rounded-18 border-2 border-ink bg-card px-5 py-3 text-center text-[18px] font-semibold text-balance text-ink disabled:opacity-40">
          Back
        </button>
        <button type="button" onClick={onNext} className="min-h-[60px] cursor-pointer rounded-18 border-0 bg-ink px-5 py-3 text-center text-[19px] font-bold text-balance text-white">
          {last ? "I'm ready" : 'Next card'}
        </button>
      </div>
    </main>
  )
}
