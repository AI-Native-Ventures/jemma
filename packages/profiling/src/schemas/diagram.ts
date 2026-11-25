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

/**
 * Two more pictures for a senior class (Mathematics, Grades 7 to 12): graphs on a grid and triangles with angles.
 *
 * The model gives a few numbers (the frame, the graphs by their constants, the angles); code does the drawing. A coordinate plane never holds
 * a list of points of a curve: code samples each graph itself. `DiagramSpecSchema` above, the one the demo class was recorded with, does not
 * change, and its JSON text is pinned by a test: these kinds live only in `SeniorDiagramSpecSchema`.
 */

const Label = z.string().optional()

/**
 * One graph on a coordinate plane. x is in degrees for `trig`.
 * line: y = m·x + c. parabola: y = a(x - p)^2 + q. hyperbola: y = a/(x - p) + q. exponential: y = a·b^(x - p) + q.
 * trig: y = a·fn(b·x) + q (a and b default to 1, q to 0).
 */
export const GraphSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('line'), m: z.number(), c: z.number(), label: Label }),
  z.object({ type: z.literal('parabola'), a: z.number(), p: z.number().optional(), q: z.number().optional(), label: Label }),
  z.object({ type: z.literal('hyperbola'), a: z.number(), p: z.number().optional(), q: z.number().optional(), label: Label }),
  z.object({ type: z.literal('exponential'), a: z.number(), b: z.number(), p: z.number().optional(), q: z.number().optional(), label: Label }),
  z.object({
    type: z.literal('trig'),
    fn: z.enum(['sin', 'cos', 'tan']),
    a: z.number().optional(),
    b: z.number().optional(),
    q: z.number().optional(),
    label: Label,
  }),
])
export type Graph = z.infer<typeof GraphSchema>

const CoordinatePlaneSchema = z.object({
  kind: z.literal('coordinate_plane'),
  xMin: z.number(),
  xMax: z.number(),
  yMin: z.number(),
  yMax: z.number(),
  step: z.number().optional(),
  points: z.array(z.object({ x: z.number(), y: z.number(), label: Label })).optional(),
  graphs: z.array(GraphSchema).optional(),
})

/** `vertices`, `angles`, `sides` and `angleLabels` are lists of three: the save gate checks it, so a slip costs one question and not the whole lesson. */
const TriangleSchema = z.object({
  kind: z.literal('triangle'),
  vertices: z.array(z.string()),
  angles: z.array(z.number()).optional(),
  sides: z.array(z.string()).optional(),
  angleLabels: z.array(z.string()).optional(),
  rightAngleAt: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
})

/** P165: a box and whisker plot of one set of data on a scale: its five-number summary, read off the scale (no value is written on the plot). */
const BoxPlotSchema = z.object({
  kind: z.literal('box_plot'),
  min: z.number(),
  q1: z.number(),
  median: z.number(),
  q3: z.number(),
  max: z.number(),
  scaleMin: z.number(),
  scaleMax: z.number(),
  step: z.number().optional(),
  title: z.string().optional(),
})

/** One branch of a probability tree: its event and its probability ("0,4", "2/5"), or "?" for a blank the learner fills in a `list` answer. */
const TreeBranchSchema = z.object({ label: z.string(), p: z.string() })

/** P165: a probability tree of one or two stages: 2 or 3 first branches, and after each of them 2 or 3 more (`second`, one list for each first branch). */
const TreeSchema = z.object({
  kind: z.literal('tree'),
  first: z.array(TreeBranchSchema),
  second: z.array(z.array(TreeBranchSchema)).optional(),
})

/** P165: a time line of financial maths: the periods from `from` to `to`, the same payment at each period of `every`, and labels at some points. */
const TimelineSchema = z.object({
  kind: z.literal('timeline'),
  from: z.number().int(),
  to: z.number().int(),
  unit: z.enum(['month', 'year']),
  every: z.object({ from: z.number().int(), to: z.number().int(), label: z.string() }).optional(),
  marks: z.array(z.object({ at: z.number().int(), label: z.string() })).optional(),
})

export const SeniorDiagramSpecSchema = z.discriminatedUnion('kind', [
  ...DiagramSpecSchema.options,
  CoordinatePlaneSchema,
  TriangleSchema,
  BoxPlotSchema,
  TreeSchema,
  TimelineSchema,
])
export type SeniorDiagramSpec = z.infer<typeof SeniorDiagramSpecSchema>
export type CoordinatePlaneSpec = z.infer<typeof CoordinatePlaneSchema>
export type TriangleSpec = z.infer<typeof TriangleSchema>
export type BoxPlotSpec = z.infer<typeof BoxPlotSchema>
export type TreeSpec = z.infer<typeof TreeSchema>
export type TimelineSpec = z.infer<typeof TimelineSchema>
