import type { SeniorDiagramSpec } from '@jemma/profiling/schemas'
import { DiagramView } from '@/components/diagrams'

/**
 * The picture a question carries (a senior class only: a graph to read, a triangle with an angle to find). As wide as the card, at most 300 px tall.
 * While the child answers, the spoken description says only what can be seen (never an equation or a coordinate, which may be the answer); after
 * the answer is shown, `variant` "card" gives the full description. A question without a picture draws nothing.
 */
export function QuestionPicture({ spec, variant = 'question' }: { spec?: SeniorDiagramSpec; variant?: 'question' | 'card' }) {
  if (!spec) return null
  return (
    <div data-picture="true" className="flex w-full justify-center [&_svg]:max-h-[300px]">
      <DiagramView spec={spec} variant={variant} />
    </div>
  )
}
