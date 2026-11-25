import type { SeniorDiagramSpec } from '@jemma/profiling/schemas'
import { DiagramView } from '@/components/diagrams'
import { Bar, rowFills } from './Bars'

/** The small picture on tonight's lesson card (My maths): the lesson's first bars, or its first picture of another kind. */
export function PreviewBars({ spec }: { spec: SeniorDiagramSpec }) {
  if (spec.kind !== 'fraction_bar') {
    // A graph on a grid or a triangle (a senior class) is a big picture: on tonight's lesson card it is kept small. The other kinds keep the classes they had.
    const big = spec.kind === 'coordinate_plane' || spec.kind === 'triangle' || spec.kind === 'box_plot' || spec.kind === 'tree' || spec.kind === 'timeline'
    return (
      <div aria-hidden="true" className={`rounded-[16px] bg-[#F8F6F1] p-3.5 [border-radius:16px]${big ? ' [&_svg]:mx-auto [&_svg]:max-h-[180px]' : ''}`}>
        <DiagramView spec={spec} />
      </div>
    )
  }
  const fills = rowFills(spec.rows)
  return (
    <div aria-hidden="true" className="flex flex-col gap-1.5 bg-[#F8F6F1] p-3.5 [border-radius:16px]">
      {fills.map((f, i) => (
        <span key={i} className="flex">
          <Bar fills={f} height={22} radius={6} />
        </span>
      ))}
    </div>
  )
}
