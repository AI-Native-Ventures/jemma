import { clockOf } from '@jemma/profiling/logic'
import type { ClockFaceSpec, SeniorDiagramSpec } from '@jemma/profiling/schemas'
import { DiagramView } from '@/components/diagrams'
import { ClockFace } from './answers/ClockFace'

/**
 * The picture a question carries: a graph to read or a triangle with an angle to find (a senior class), and since P166 one of the seven primary pictures
 * (a fraction bar, a number line, an area model, a place value chart, a bar graph, a shape, squared paper) in Grades 1 to 6. As wide as the card, at most 300 px tall.
 * While the child answers, the spoken description says only what can be seen (never an equation or a coordinate, which may be the answer); after
 * the answer is shown, `variant` "card" gives the full description. A question without a picture draws nothing.
 */
export function QuestionPicture({ spec, face, variant = 'question' }: { spec?: SeniorDiagramSpec; face?: ClockFaceSpec; variant?: 'question' | 'card' }) {
  // P183: a clock face to read, with no handles: a learner who cannot see it hears where its hands point, never the time.
  const time = face ? clockOf(face.time) : null
  if (time)
    return (
      <div data-picture="clock" className="flex w-full justify-center">
        <div className={variant === 'card' ? 'w-[150px]' : 'w-[210px]'}>
          <ClockFace time={time} mode="results" />
        </div>
      </div>
    )
  if (!spec) return null
  return (
    <div data-picture="true" className="flex w-full justify-center [&_svg]:max-h-[300px]">
      <DiagramView spec={spec} variant={variant} />
    </div>
  )
}
