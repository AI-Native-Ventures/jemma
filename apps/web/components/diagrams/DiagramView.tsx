import { pictureProblem } from '@jemma/profiling/logic'
import { SeniorDiagramSpecSchema } from '@jemma/profiling/schemas'
import { AreaModel } from './AreaModel'
import { BarChart } from './BarChart'
import { CoordinatePlane } from './CoordinatePlane'
import { FractionBar } from './FractionBar'
import { GridArea } from './GridArea'
import { NumberLine } from './NumberLine'
import { PlaceValue } from './PlaceValue'
import { Shape2D } from './Shape2D'
import { Triangle } from './Triangle'
import type { Variant } from './shared'

export type DiagramViewProps = {
  /** Anything: model output is data. Invalid or unknown specs draw the "picture missing" box. */
  spec: unknown
  variant?: Variant | 'learn'
  highlight?: string[]
  className?: string
}

export function PictureMissing({ className }: { className?: string }) {
  return (
    <div
      role="img"
      aria-label="Picture missing"
      className={`flex min-h-[120px] w-full items-center justify-center rounded-12 border border-dashed border-edge bg-soft-2 px-4 py-6 text-center text-[14px] font-medium text-muted ${className ?? ''}`}
    >
      Picture missing
    </div>
  )
}

export function DiagramView({ spec, variant, highlight, className }: DiagramViewProps) {
  // The wide schema: a lesson of a senior class (Mathematics, Grades 7 to 12) may hold two more kinds. It reads the seven old kinds exactly as
  // the primary schema does, so a lesson of the demo class draws what it always drew.
  const parsed = SeniorDiagramSpecSchema.safeParse(spec)
  if (!parsed.success) return <PictureMissing className={className} />
  const s = parsed.data
  // A graph or a triangle that makes no sense (a grid upside down, angles that do not add up) is a missing picture, never a broken page.
  if (pictureProblem(s)) return <PictureMissing className={className} />
  try {
    switch (s.kind) {
      case 'fraction_bar':
        return <FractionBar {...s} variant={variant} />
      case 'number_line':
        return <NumberLine {...s} />
      case 'area_model':
        return <AreaModel {...s} />
      case 'place_value':
        return <PlaceValue {...s} />
      case 'bar_chart':
        return <BarChart {...s} variant={variant === 'learn' ? undefined : variant} highlight={highlight} />
      case 'shape_2d':
        return <Shape2D {...s} />
      case 'grid_area':
        return <GridArea {...s} variant={variant === 'learn' ? undefined : variant} />
      case 'coordinate_plane':
        return <CoordinatePlane {...s} variant={variant === 'question' ? 'question' : 'card'} />
      case 'triangle':
        return <Triangle {...s} />
      default:
        return <PictureMissing className={className} />
    }
  } catch {
    return <PictureMissing className={className} />
  }
}
