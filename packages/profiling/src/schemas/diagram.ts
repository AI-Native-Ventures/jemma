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

// ---- P188: the pictures of a question of Grades 1 to 3: counting and place value ----------------------------------------------

/** The things a picture of objects draws. */
export const OBJECT_THINGS = ['apple', 'star', 'ball', 'flower', 'fish', 'car', 'cookie', 'heart'] as const

/**
 * P188: things to count, share or see in equal groups: how many are in each row or group (`[5, 5, 3]`), lined up in `rows` to count (the default) or each group
 * in a ring of its own (`groups`: equal groups, sharing, a fraction of a set).
 */
const ObjectsSchema = z.object({
  kind: z.literal('objects'),
  thing: z.enum(OBJECT_THINGS),
  groups: z.array(z.number()),
  layout: z.enum(['rows', 'groups']).optional(),
  // P189: how many of the groups, from the first, are gold (a fraction of a set: 1 of 3 groups). Groups only.
  gold: z.number().optional(),
})

/** P188: a ten-frame (`frames` 2 for twenty) with `filled` counters, and a number bond under it when `bond` is given: the whole on top, one part and a blank. */
const TenFrameSchema = z.object({
  kind: z.literal('ten_frame'),
  frames: z.number().optional(),
  filled: z.number(),
  bond: z.object({ whole: z.number(), part: z.number() }).optional(),
})

/** P188: place value blocks to read: flats of a hundred, rods of ten and single ones. */
const BaseTenSchema = z.object({ kind: z.literal('base_ten'), hundreds: z.number().optional(), tens: z.number(), ones: z.number() })

/** P188: part of a hundred chart: `rows` rows of ten from `from` (1, 11, 21, ...), the numbers in `blanks` left empty, and `gold` the empty box the question is about. */
const HundredChartSchema = z.object({ kind: z.literal('hundred_chart'), from: z.number(), rows: z.number(), blanks: z.array(z.number()), gold: z.number().optional() })

/** P188: dots in `rows` and `cols`, for multiplication. */
const DotArraySchema = z.object({ kind: z.literal('dot_array'), rows: z.number(), cols: z.number() })

/** P188: two numbers with a blank sign between them, for which sign makes it true (<, > or =). */
const CompareSchema = z.object({ kind: z.literal('compare'), left: z.string(), right: z.string() })

// ---- P189: fractions, percentages, time and money ------------------------------------------------------------------------------

/**
 * P189: a factor tree. `root` is the number at the top and `splits` says how a number splits into two factors, from the top down: each split hangs under the first
 * number on the tree with its `of` that has not split yet. `gold` is the one number the question asks for, drawn as a gold blank.
 */
const FactorTreeSchema = z.object({
  kind: z.literal('factor_tree'),
  root: z.number(),
  splits: z.array(z.object({ of: z.number(), into: z.array(z.number()) })),
  gold: z.number().optional(),
})

/** P189: a circle cut into `parts` equal slices with `shaded` of them gold; `circles` 2 or 3 for a mixed number, shaded one after another. */
const FractionCircleSchema = z.object({ kind: z.literal('fraction_circle'), parts: z.number(), shaded: z.number(), circles: z.number().optional() })

/**
 * P189: a bar from 0% to 100%. `whole` is the amount at 100% and `percent` the shaded part; `parts` cuts the bar into equal pieces. `money` writes the amounts as
 * money (rand, or dollars in the US). `ask` says what the question mark stands for: the amount of the shaded part (the default), the whole, or the percent.
 */
const PercentBarSchema = z.object({
  kind: z.literal('percent_bar'),
  whole: z.number(),
  percent: z.number(),
  parts: z.number().optional(),
  money: z.boolean().optional(),
  ask: z.enum(['part', 'whole', 'percent']).optional(),
})

/** P189: one month of a calendar (`month` 1 to 12), with up to three days in `circled`. */
const CalendarSchema = z.object({ kind: z.literal('calendar'), year: z.number(), month: z.number(), circled: z.array(z.number()).optional() })

/** P189: coins and notes to count: the value of each one in cents (`[1000, 500, 200, 200, 50]` is a R10 note, a R5 coin, two R2 coins and a 50c coin). */
const MoneySchema = z.object({ kind: z.literal('money'), items: z.array(z.number()) })

// ---- P190: measuring --------------------------------------------------------------------------------------------------------------

/** The things a ruler measures. */
export const RULER_THINGS = ['pencil', 'crayon', 'ribbon'] as const

/**
 * P190: a thing above a ruler that runs from 0 to `to` (centimetres, or inches in the US). The thing starts at `from` (0 when left out) and is `length` long:
 * whole or half centimetres, or quarter inches.
 */
const RulerSchema = z.object({
  kind: z.literal('ruler'),
  unit: z.enum(['cm', 'in']).optional(),
  to: z.number(),
  from: z.number().optional(),
  length: z.number(),
  thing: z.enum(RULER_THINGS).optional(),
})

/** P190: a kitchen scale with a dial from 0 to `max` grams or kilograms, cut into 20 steps, and its needle at `value`. */
const ScaleDialSchema = z.object({ kind: z.literal('scale_dial'), max: z.number(), value: z.number(), unit: z.enum(['g', 'kg']) })

/** P190: a measuring jug marked from 0 to `max` millilitres or litres in 10 steps, with water up to `value`. */
const JugSchema = z.object({ kind: z.literal('jug'), max: z.number(), value: z.number(), unit: z.enum(['ml', 'l']) })

/** P190: a thermometer from `min` to `max` degrees Celsius (`C`, the default) or Fahrenheit (`F`), with its red line at `value`. */
const ThermometerSchema = z.object({ kind: z.literal('thermometer'), min: z.number(), max: z.number(), value: z.number(), unit: z.enum(['C', 'F']).optional() })

/** P190: a box built from cubes, `long` by `wide` by `high`, drawn in 3D. */
const CubesSchema = z.object({ kind: z.literal('cubes'), long: z.number(), wide: z.number(), high: z.number() })

/** P190: the net of a box, `long` by `wide` by `high`, drawn to scale with each size on an edge it measures. */
const BoxNetSchema = z.object({ kind: z.literal('box_net'), long: z.number(), wide: z.number(), high: z.number(), unit: z.enum(['mm', 'cm', 'm', 'in']).optional() })

// ---- P191: patterns, algebra and graphs ------------------------------------------------------------------------------------------

/**
 * The shapes a growing tile pattern makes. Pattern n of `row` is a row of n tiles; `L` a column of n + 1 with n more to its right (2n + 1); `T` a row of 2n + 1
 * with n under its middle (3n + 1); `cross` a middle tile with an arm of n on each side (4n + 1); `square` n by n; `rectangle` n rows of n + 1; `stairs` steps of
 * 1 to n (n(n + 1)/2).
 */
export const TILE_SHAPES = ['row', 'L', 'T', 'cross', 'square', 'rectangle', 'stairs'] as const

/** P191: a growing pattern of tiles: `show` patterns of a `shape`, from pattern `from` (1 when left out). */
const TilePatternSchema = z.object({ kind: z.literal('tile_pattern'), shape: z.enum(TILE_SHAPES), from: z.number().optional(), show: z.number() })

/** P191: a flow diagram: each input goes through the steps of `rule` in turn to its output. The outputs (and inputs) at the places in `blanks` (and `blankInputs`), from 1, are gold blanks. */
const FlowDiagramSchema = z.object({
  kind: z.literal('flow_diagram'),
  rule: z.array(z.object({ op: z.enum(['add', 'subtract', 'multiply', 'divide']), by: z.number() })),
  inputs: z.array(z.number()),
  blanks: z.array(z.number()).optional(),
  blankInputs: z.array(z.number()).optional(),
})

/** P191: a balance scale that balances: each pan holds `x` bags of the unknown (`letter`, x when left out) and weights that make `n`. */
const BalanceSchema = z.object({
  kind: z.literal('balance'),
  left: z.object({ x: z.number(), n: z.number() }),
  right: z.object({ x: z.number(), n: z.number() }),
  letter: z.string().optional(),
})

/** P191: a graph of a trip: distance from the start against time, a straight line from each point to the next, from time 0. */
const TravelGraphSchema = z.object({
  kind: z.literal('travel_graph'),
  points: z.array(z.object({ t: z.number(), d: z.number() })),
  tMax: z.number(),
  dMax: z.number(),
  tStep: z.number().optional(),
  dStep: z.number().optional(),
  tUnit: z.enum(['s', 'min', 'h']),
  dUnit: z.enum(['m', 'km']),
})

// ---- P192: shapes and position --------------------------------------------------------------------------------------------------

/** P192: a map on a grid of squares: each place has a `name`, a square (`col` from the left and `row` from the bottom, both from 0) and a `house` may stand for one. */
const MapGridSchema = z.object({
  kind: z.literal('map_grid'),
  cols: z.number(),
  rows: z.number(),
  places: z.array(z.object({ name: z.string(), col: z.number(), row: z.number(), house: z.boolean().optional() })),
})

/** The 3D objects a picture draws. */
export const SOLIDS = ['cube', 'cuboid', 'square_pyramid', 'triangular_pyramid', 'triangular_prism', 'cylinder', 'cone', 'sphere'] as const

/** P192: a 3D object, its hidden edges dashed. */
const SolidSchema = z.object({ kind: z.literal('solid'), shape: z.enum(SOLIDS) })

/** P192: a shape built from cubes, drawn in 3D: `heights` is how many cubes stand on each square, a row of numbers for each row from the back to the front. */
const CubeStackSchema = z.object({ kind: z.literal('cube_stack'), heights: z.array(z.array(z.number())) })

/** The shapes a symmetry picture draws, and the lines that may cross them. */
export const SYMMETRY_SHAPES = ['heart', 'star', 'rectangle', 'square', 'triangle', 'circle', 'house', 'arrow', 'kite'] as const
export const SYMMETRY_LINES = ['vertical', 'horizontal', 'diagonal', 'other_diagonal'] as const

/** P192: a shape with 2 to 4 dashed lines across it, named A, B, C and D in order: a choice question asks which line is a line of symmetry. */
const SymmetryLinesSchema = z.object({ kind: z.literal('symmetry_lines'), shape: z.enum(SYMMETRY_SHAPES), lines: z.array(z.enum(SYMMETRY_LINES)) })

// ---- P193: angles and transformations ---------------------------------------------------------------------------------------------

/** P193: an angle of `degrees` (1 to 359) between two arms, with an arc on the side it is measured; a right angle has a small square. `label` is written in it. */
const AngleSchema = z.object({ kind: z.literal('angle'), degrees: z.number(), label: z.string().optional() })

/** P193: a protractor over an angle: one arm on its 0 and the other crossing its scale at `degrees` (on a mark every 5 degrees). */
const ProtractorSchema = z.object({ kind: z.literal('protractor'), degrees: z.number() })

/** The four angles where a slanted line crosses a straight one. */
export const CORNERS = ['above_right', 'above_left', 'below_left', 'below_right'] as const

/**
 * P193: two parallel lines, AB above CD, cut by a slanted line that makes the angle `acute` (30 to 80 degrees) with them above and to the right of each crossing.
 * Each of `marks` writes a `label` (an angle like `65°`, or a letter like `x`) in a `corner` of the crossing on `line` AB or CD.
 */
const ParallelLinesSchema = z.object({
  kind: z.literal('parallel_lines'),
  acute: z.number(),
  marks: z.array(z.object({ line: z.enum(['AB', 'CD']), corner: z.enum(CORNERS), label: z.string() })),
})

/** P193: a shape and its enlargement on a grid of squares: a `rectangle` or a right `triangle` `w` squares wide and `h` tall, and the same shape `factor` times bigger. */
const EnlargementSchema = z.object({
  kind: z.literal('enlargement'),
  shape: z.enum(['rectangle', 'triangle']),
  w: z.number(),
  h: z.number(),
  factor: z.number(),
  sizes: z.boolean().optional(),
})

/** P188: the pictures of a question of Grades 1 to 6 that only a question carries (a lesson card keeps the seven of `DiagramSpecSchema`). P189: and five more. P190: and six for measuring. P191: and four for patterns, algebra and graphs. P192: and four for shapes and position. P193: and four for angles and transformations. */
const QUESTION_PICTURES = [
  ObjectsSchema,
  TenFrameSchema,
  BaseTenSchema,
  HundredChartSchema,
  DotArraySchema,
  CompareSchema,
  FactorTreeSchema,
  FractionCircleSchema,
  PercentBarSchema,
  CalendarSchema,
  MoneySchema,
  RulerSchema,
  ScaleDialSchema,
  JugSchema,
  ThermometerSchema,
  CubesSchema,
  BoxNetSchema,
  TilePatternSchema,
  FlowDiagramSchema,
  BalanceSchema,
  TravelGraphSchema,
  MapGridSchema,
  SolidSchema,
  CubeStackSchema,
  SymmetryLinesSchema,
  AngleSchema,
  ProtractorSchema,
  ParallelLinesSchema,
  EnlargementSchema,
] as const

/**
 * P188: the pictures a question of a gated Grade 1 to 6 topic may carry: the seven Jemma draws for every grade and the ones of the question type boards. The demo
 * schema (`DiagramSpecSchema`, pinned) does not change.
 */
export const PrimaryPictureSpecSchema = z.discriminatedUnion('kind', [...DiagramSpecSchema.options, ...QUESTION_PICTURES])
export type PrimaryPictureSpec = z.infer<typeof PrimaryPictureSpecSchema>

export const SeniorDiagramSpecSchema = z.discriminatedUnion('kind', [
  ...DiagramSpecSchema.options,
  CoordinatePlaneSchema,
  TriangleSchema,
  BoxPlotSchema,
  TreeSchema,
  TimelineSchema,
  // P188: every picture is read and drawn by the one wide schema, the question pictures of Grades 1 to 6 too.
  ...QUESTION_PICTURES,
])
export type SeniorDiagramSpec = z.infer<typeof SeniorDiagramSpecSchema>
export type CoordinatePlaneSpec = z.infer<typeof CoordinatePlaneSchema>
export type TriangleSpec = z.infer<typeof TriangleSchema>
export type BoxPlotSpec = z.infer<typeof BoxPlotSchema>
export type TreeSpec = z.infer<typeof TreeSchema>
export type TimelineSpec = z.infer<typeof TimelineSchema>
export type ObjectsSpec = z.infer<typeof ObjectsSchema>
export type TenFrameSpec = z.infer<typeof TenFrameSchema>
export type BaseTenSpec = z.infer<typeof BaseTenSchema>
export type HundredChartSpec = z.infer<typeof HundredChartSchema>
export type DotArraySpec = z.infer<typeof DotArraySchema>
export type CompareSpec = z.infer<typeof CompareSchema>
export type FactorTreeSpec = z.infer<typeof FactorTreeSchema>
export type FractionCircleSpec = z.infer<typeof FractionCircleSchema>
export type PercentBarSpec = z.infer<typeof PercentBarSchema>
export type CalendarSpec = z.infer<typeof CalendarSchema>
export type MoneySpec = z.infer<typeof MoneySchema>
export type RulerSpec = z.infer<typeof RulerSchema>
export type ScaleDialSpec = z.infer<typeof ScaleDialSchema>
export type JugSpec = z.infer<typeof JugSchema>
export type ThermometerSpec = z.infer<typeof ThermometerSchema>
export type CubesSpec = z.infer<typeof CubesSchema>
export type BoxNetSpec = z.infer<typeof BoxNetSchema>
export type TilePatternSpec = z.infer<typeof TilePatternSchema>
export type FlowDiagramSpec = z.infer<typeof FlowDiagramSchema>
export type BalanceSpec = z.infer<typeof BalanceSchema>
export type TravelGraphSpec = z.infer<typeof TravelGraphSchema>
export type MapGridSpec = z.infer<typeof MapGridSchema>
export type SolidSpec = z.infer<typeof SolidSchema>
export type CubeStackSpec = z.infer<typeof CubeStackSchema>
export type SymmetryLinesSpec = z.infer<typeof SymmetryLinesSchema>
export type AngleSpec = z.infer<typeof AngleSchema>
export type ProtractorSpec = z.infer<typeof ProtractorSchema>
export type ParallelLinesSpec = z.infer<typeof ParallelLinesSchema>
export type EnlargementSpec = z.infer<typeof EnlargementSchema>
