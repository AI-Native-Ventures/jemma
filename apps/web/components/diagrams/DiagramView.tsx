import { pictureProblem, type Notation } from '@jemma/profiling/logic'
import { SeniorDiagramSpecSchema } from '@jemma/profiling/schemas'
import { AreaModel } from './AreaModel'
import { BarChart } from './BarChart'
import { BoxPlot } from './BoxPlot'
import { CoordinatePlane } from './CoordinatePlane'
import { FractionBar } from './FractionBar'
import { GridArea } from './GridArea'
import { NumberLine } from './NumberLine'
import { PlaceValue } from './PlaceValue'
import { ProbabilityTree } from './ProbabilityTree'
import { Shape2D } from './Shape2D'
import { Timeline } from './Timeline'
import { Triangle } from './Triangle'
import { Objects } from './Objects'
import { TenFrame } from './TenFrame'
import { BaseTen } from './BaseTen'
import { HundredChart } from './HundredChart'
import { DotArray } from './DotArray'
import { Compare } from './Compare'
import { FactorTree } from './FactorTree'
import { FractionCircle } from './FractionCircle'
import { PercentBar } from './PercentBar'
import { Calendar } from './Calendar'
import { Money } from './Money'
import { Ruler } from './Ruler'
import { ScaleDial } from './ScaleDial'
import { Jug } from './Jug'
import { Thermometer } from './Thermometer'
import { Cubes } from './Cubes'
import { BoxNet } from './BoxNet'
import type { Variant } from './shared'

export type DiagramViewProps = {
  /** Anything: model output is data. Invalid or unknown specs draw the "picture missing" box. */
  spec: unknown
  variant?: Variant | 'learn'
  highlight?: string[]
  className?: string
  /** P145: the caption of the step the picture is in, and whether the lesson is a senior one. Only a number line reads them. */
  caption?: string
  senior?: boolean
  /** P187: how the numbers Jemma writes on the picture look: a decimal comma, or (in the US) a decimal point and (2, 3) for a point. */
  notation?: Notation
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

export function DiagramView({ spec, variant, highlight, className, caption, senior, notation }: DiagramViewProps) {
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
        return <NumberLine {...s} caption={caption} senior={senior} notation={notation} />
      case 'area_model':
        return <AreaModel {...s} variant={variant === 'learn' ? undefined : variant} />
      case 'place_value':
        return <PlaceValue {...s} />
      case 'bar_chart':
        return <BarChart {...s} variant={variant === 'learn' ? undefined : variant} highlight={highlight} notation={notation} />
      case 'shape_2d':
        return <Shape2D {...s} />
      case 'grid_area':
        return <GridArea {...s} variant={variant === 'learn' ? undefined : variant} />
      case 'coordinate_plane':
        return <CoordinatePlane {...s} variant={variant === 'question' ? 'question' : 'card'} notation={notation} />
      case 'triangle':
        return <Triangle {...s} />
      case 'box_plot':
        return <BoxPlot {...s} notation={notation} />
      case 'tree':
        return <ProbabilityTree {...s} />
      case 'timeline':
        return <Timeline {...s} />
      // P188: the counting pictures of a question (objects, a ten-frame, blocks to read, a hundred chart, a dot array, two numbers to compare).
      case 'objects':
        return <Objects {...s} variant={variant === 'question' ? 'question' : 'card'} />
      case 'ten_frame':
        return <TenFrame {...s} variant={variant === 'question' ? 'question' : 'card'} />
      case 'base_ten':
        return <BaseTen {...s} variant={variant === 'question' ? 'question' : 'card'} />
      case 'hundred_chart':
        return <HundredChart {...s} variant={variant === 'question' ? 'question' : 'card'} />
      case 'dot_array':
        return <DotArray {...s} variant={variant === 'question' ? 'question' : 'card'} />
      case 'compare':
        return <Compare {...s} />
      // P189: a factor tree, fraction circles, a percentage bar, a calendar, and coins and notes (the last three in the notation of the space).
      case 'factor_tree':
        return <FactorTree {...s} variant={variant === 'question' ? 'question' : 'card'} />
      case 'fraction_circle':
        return <FractionCircle {...s} variant={variant === 'question' ? 'question' : 'card'} />
      case 'percent_bar':
        return <PercentBar {...s} variant={variant === 'question' ? 'question' : 'card'} notation={notation} />
      case 'calendar':
        return <Calendar {...s} variant={variant === 'question' ? 'question' : 'card'} notation={notation} />
      case 'money':
        return <Money {...s} variant={variant === 'question' ? 'question' : 'card'} notation={notation} />
      // P190: measuring (a ruler, a kitchen scale, a jug, a thermometer, a box of cubes, the net of a box).
      case 'ruler':
        return <Ruler {...s} variant={variant === 'question' ? 'question' : 'card'} notation={notation} />
      case 'scale_dial':
        return <ScaleDial {...s} variant={variant === 'question' ? 'question' : 'card'} notation={notation} />
      case 'jug':
        return <Jug {...s} variant={variant === 'question' ? 'question' : 'card'} notation={notation} />
      case 'thermometer':
        return <Thermometer {...s} variant={variant === 'question' ? 'question' : 'card'} />
      case 'cubes':
        return <Cubes {...s} variant={variant === 'question' ? 'question' : 'card'} />
      case 'box_net':
        return <BoxNet {...s} variant={variant === 'question' ? 'question' : 'card'} />
      default:
        return <PictureMissing className={className} />
    }
  } catch {
    return <PictureMissing className={className} />
  }
}
