import type { DiagramSpec } from '@jemma/profiling/schemas'

export type QuestionStyle = 'area' | 'bar-graph'

/** Which Grade 6 question style draws a diagram: squared paper asks for an area, a bar graph asks to read it. */
export function questionStyleOf(spec: DiagramSpec | undefined): QuestionStyle | null {
  if (spec?.kind === 'grid_area') return 'area'
  if (spec?.kind === 'bar_chart') return 'bar-graph'
  return null
}
