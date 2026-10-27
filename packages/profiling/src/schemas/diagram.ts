import { z } from 'zod'

export const DiagramSpecSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('fraction_bar'),
    rows: z.array(z.object({ parts: z.number(), shaded: z.number(), label: z.string().optional() })),
  }),
  z.object({
    kind: z.literal('number_line'),
    min: z.number(),
    max: z.number(),
    step: z.number(),
    marks: z.array(z.object({ value: z.number(), label: z.string() })),
  }),
  z.object({ kind: z.literal('area_model'), rows: z.number(), cols: z.number(), shaded: z.number() }),
  z.object({ kind: z.literal('place_value'), columns: z.array(z.string()), digits: z.array(z.string()) }),
  z.object({
    kind: z.literal('bar_chart'),
    bars: z.array(z.object({ label: z.string(), value: z.number() })),
    yMax: z.number(),
  }),
  z.object({
    kind: z.literal('shape_2d'),
    shape: z.enum(['square', 'rectangle', 'triangle', 'circle']),
    labels: z.array(z.string()),
  }),
  z.object({
    kind: z.literal('grid_area'),
    cols: z.number(),
    rows: z.number(),
    cells: z.array(z.tuple([z.number(), z.number()])),
  }),
])
export type DiagramSpec = z.infer<typeof DiagramSpecSchema>
