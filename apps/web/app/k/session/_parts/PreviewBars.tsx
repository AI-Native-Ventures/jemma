import type { SeniorDiagramSpec } from '@jemma/profiling/schemas'
import { DiagramView } from '@/components/diagrams'
import { Bar, rowFills } from './Bars'

/** The small picture on the Today card: the lesson's first bars, or its first picture of another kind. */
export function PreviewBars({ spec }: { spec: SeniorDiagramSpec }) {
  if (spec.kind !== 'fraction_bar') {
    return (
      <div aria-hidden="true" className="rounded-[16px] bg-[#F7F6FB] p-3.5 [border-radius:16px]">
        <DiagramView spec={spec} />
      </div>
    )
  }
  const fills = rowFills(spec.rows)
  return (
    <div aria-hidden="true" className="flex flex-col gap-1.5 bg-[#F7F6FB] p-3.5 [border-radius:16px]">
      {fills.map((f, i) => (
        <span key={i} className="flex">
          <Bar fills={f} height={22} radius={6} />
        </span>
      ))}
    </div>
  )
}
