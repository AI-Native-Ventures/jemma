import type { SeniorDiagramSpec } from '../schemas/diagram'
import { balanceSolution, daysIn, factorTreeOf, flowOutput, MONEY_VALUES, percentPart, tilesOf } from './question-pictures'

/**
 * Does a picture of the two senior kinds make sense? `null` when it does, else a short plain reason.
 *
 * Used by the save gate (a question whose picture makes no sense is a bad question, handled as a bad answer is) and by the screen that draws
 * the picture (a lesson card with a picture that makes no sense shows "Picture missing" and never breaks the page). The seven old kinds are not
 * looked at here: they are drawn as they always were. A question's picture of those kinds is checked by `primaryPictureProblem` (P166).
 */

const MAX_POINTS = 12
const MAX_GRAPHS = 3
const MAX_RANGE = 200
/** A trig graph takes x in degrees, and one turn is 360 of them: a plane that holds one may be wider across (two turns). */
const MAX_TRIG_RANGE = 720
/** An angle counts as a right angle, and the three angles as 180, when they are this close (in degrees). */
export const ANGLE_TOLERANCE = 0.5

const numbersIn = (value: unknown): number[] =>
  typeof value === 'number' ? [value] : Array.isArray(value) ? value.flatMap(numbersIn) : value && typeof value === 'object' ? Object.values(value).flatMap(numbersIn) : []

const isRight = (angle: number) => Math.abs(angle - 90) <= ANGLE_TOLERANCE

type Plane = Extract<SeniorDiagramSpec, { kind: 'coordinate_plane' }>
type Triangle = Extract<SeniorDiagramSpec, { kind: 'triangle' }>

function planeProblem(s: Plane): string | null {
  if (!numbersIn(s).every(Number.isFinite)) return 'every number on the grid must be finite'
  if (!(s.xMin < s.xMax)) return 'the grid needs xMin below xMax'
  if (!(s.yMin < s.yMax)) return 'the grid needs yMin below yMax'
  const across = s.graphs?.some((g) => g.type === 'trig') ? MAX_TRIG_RANGE : MAX_RANGE
  if (s.xMax - s.xMin > across || s.yMax - s.yMin > MAX_RANGE) return `the grid is at most ${s.xMax - s.xMin > across ? across : MAX_RANGE} wide`
  if ((s.points?.length ?? 0) > MAX_POINTS) return `the grid has at most ${MAX_POINTS} points`
  if ((s.graphs?.length ?? 0) > MAX_GRAPHS) return `the grid has at most ${MAX_GRAPHS} graphs`
  if (s.step !== undefined && !(s.step > 0)) return 'the grid step must be above 0'
  if (s.graphs?.some((g) => g.type === 'exponential' && !(g.b > 0))) return 'an exponential graph needs a base above 0'
  return null
}

function triangleProblem(s: Triangle): string | null {
  if (s.vertices.length !== 3 || s.vertices.some((v) => !v.trim())) return 'the triangle needs three names'
  if (s.angles) {
    if (s.angles.length !== 3) return 'the triangle needs three angles'
    if (!s.angles.every((a) => Number.isFinite(a) && a > 0)) return 'every angle of the triangle must be above 0'
    if (Math.abs(s.angles[0]! + s.angles[1]! + s.angles[2]! - 180) > ANGLE_TOLERANCE) return 'the angles of the triangle must add up to 180'
    if (s.angles.filter(isRight).length > 1) return 'the triangle has at most one right angle'
    if (s.rightAngleAt !== undefined && !isRight(s.angles[s.rightAngleAt]!)) return 'the right angle must be where an angle is 90'
  }
  if (s.sides && s.sides.length !== 3) return 'the triangle needs three side labels'
  if (s.angleLabels && s.angleLabels.length !== 3) return 'the triangle needs three angle labels'
  return null
}

type BoxPlot = Extract<SeniorDiagramSpec, { kind: 'box_plot' }>
type Tree = Extract<SeniorDiagramSpec, { kind: 'tree' }>
type Timeline = Extract<SeniorDiagramSpec, { kind: 'timeline' }>

/** P165: the most ticks on the scale of a box plot, branches after one branch of a tree, blanks in a tree, and periods and labels of a time line. */
const MAX_TICKS = 20
const MAX_BLANKS = 6
const MAX_PERIODS = 600
const MAX_MARKS = 6
const MAX_LABEL = 16

function boxPlotProblem(s: BoxPlot): string | null {
  const five = [s.min, s.q1, s.median, s.q3, s.max]
  if (!(s.scaleMin < s.scaleMax)) return 'the scale must go from a smaller number to a bigger one'
  if (five.some((v, i) => i > 0 && v < five[i - 1]!)) return 'the five numbers must go up: min, q1, median, q3, max'
  if (five.some((v) => v < s.scaleMin || v > s.scaleMax)) return 'the five numbers must be on the scale'
  const step = s.step ?? (s.scaleMax - s.scaleMin) / 10
  if (!(step > 0) || (s.scaleMax - s.scaleMin) / step > MAX_TICKS) return `the scale may have at most ${MAX_TICKS} ticks`
  return null
}

/** A probability as a tree writes it: a decimal (with a comma or a point) or a fraction, from 0 to 1. */
export function treeProbability(p: string): number | null {
  const t = p.trim().replace(',', '.')
  const frac = /^(\d+)\s*\/\s*(\d+)$/.exec(t)
  const value = frac ? Number(frac[1]) / Number(frac[2]) : /^(0|1)?(\.\d+)?$/.test(t) && t !== '' && t !== '.' ? Number(t) : NaN
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : null
}

function treeProblem(s: Tree): string | null {
  const groups = [s.first, ...(s.second ?? [])]
  if (groups.some((g) => g.length < 2 || g.length > 3)) return 'each split of a tree has 2 or 3 branches'
  if (s.second && s.second.length !== s.first.length) return 'a tree has one list of second branches for each first branch'
  const branches = groups.flat()
  if (branches.some((b) => !b.label.trim() || b.label.trim().length > MAX_LABEL)) return `each branch has a short label (at most ${MAX_LABEL} letters)`
  if (branches.some((b) => b.p.trim() !== '?' && treeProbability(b.p) === null)) return 'each probability is a decimal or a fraction from 0 to 1, or ? for a blank'
  if (branches.filter((b) => b.p.trim() === '?').length > MAX_BLANKS) return `a tree has at most ${MAX_BLANKS} blanks`
  return null
}

type FractionBar = Extract<SeniorDiagramSpec, { kind: 'fraction_bar' }>
type NumberLine = Extract<SeniorDiagramSpec, { kind: 'number_line' }>
type AreaModel = Extract<SeniorDiagramSpec, { kind: 'area_model' }>
type PlaceValue = Extract<SeniorDiagramSpec, { kind: 'place_value' }>
type BarChart = Extract<SeniorDiagramSpec, { kind: 'bar_chart' }>
type GridArea = Extract<SeniorDiagramSpec, { kind: 'grid_area' }>

/** P166: the most a primary picture of a question may hold, so it stays small and readable on a phone. */
const MAX_FRACTION_BARS = 4
const MAX_PARTS = 24
const MAX_SIDE = 12
const MAX_LINE_STEPS = 40
const MAX_COLUMNS = 10
const MAX_CHART_BARS = 8
const MAX_SHAPE_LABELS = 4

const whole = (v: number, lo: number, hi: number) => Number.isInteger(v) && v >= lo && v <= hi

function fractionBarProblem(s: FractionBar): string | null {
  if (s.rows.length < 1 || s.rows.length > MAX_FRACTION_BARS) return `fraction bars come 1 to ${MAX_FRACTION_BARS} at a time`
  if (s.rows.some((r) => !whole(r.parts, 1, MAX_PARTS))) return `each bar is cut into 1 to ${MAX_PARTS} equal parts`
  if (s.rows.some((r) => !whole(r.shaded, 0, r.parts))) return 'a bar shades from none to all of its parts'
  return null
}

function numberLineProblem(s: NumberLine): string | null {
  if (!(s.min < s.max)) return 'a number line goes from a smaller number to a bigger one'
  if (!(s.step > 0) || (s.max - s.min) / s.step > MAX_LINE_STEPS) return `a number line has at most ${MAX_LINE_STEPS} steps`
  if (s.marks.some((m) => m.value < s.min || m.value > s.max)) return 'each mark is on the number line'
  return null
}

function areaModelProblem(s: AreaModel): string | null {
  if (!whole(s.rows, 1, MAX_SIDE) || !whole(s.cols, 1, MAX_SIDE)) return `an area model has 1 to ${MAX_SIDE} rows and columns`
  if (!whole(s.shaded, 0, s.rows * s.cols)) return 'an area model shades from none to all of its squares'
  return null
}

function placeValueProblem(s: PlaceValue): string | null {
  if (s.columns.length < 1 || s.columns.length > MAX_COLUMNS) return `a place value chart has 1 to ${MAX_COLUMNS} columns`
  if (s.digits.length > s.columns.length) return 'a place value chart has at most one digit in each column'
  if (s.digits.some((d) => !/^(\d|,|\?)?$/.test(d.trim()))) return 'each place holds one digit, or ? for a blank'
  return null
}

function barChartProblem(s: BarChart): string | null {
  if (s.bars.length < 1 || s.bars.length > MAX_CHART_BARS) return `a bar graph has 1 to ${MAX_CHART_BARS} bars`
  if (!(s.yMax > 0)) return 'a bar graph needs a scale that goes above 0'
  if (s.bars.some((b) => !b.label.trim())) return 'each bar has a label'
  if (s.bars.some((b) => b.value < 0 || b.value > s.yMax)) return 'each bar is on the scale, from 0 to yMax'
  return null
}

function gridAreaProblem(s: GridArea): string | null {
  if (!whole(s.cols, 1, MAX_SIDE) || !whole(s.rows, 1, MAX_SIDE)) return `squared paper has 1 to ${MAX_SIDE} squares across and down`
  if (!s.cells.length) return 'the shape on squared paper covers at least one square'
  if (s.cells.some(([c, r]) => !Number.isInteger(c) || !Number.isInteger(r) || c < 0 || r < 0 || c >= s.cols || r >= s.rows)) return 'each square of the shape is on the paper'
  if (new Set(s.cells.map(([c, r]) => `${c},${r}`)).size !== s.cells.length) return 'each square of the shape is given once'
  return null
}

/**
 * P166: does one of the seven primary pictures make sense as the picture of a QUESTION? `null` when it does, else a short plain reason. A lesson card keeps
 * drawing these as it always did (`pictureProblem` does not look at them); the save gate holds a question's picture to this.
 */
export function primaryPictureProblem(spec: SeniorDiagramSpec): string | null {
  if (!numbersIn(spec).every(Number.isFinite)) return 'every number of the picture must be finite'
  switch (spec.kind) {
    case 'fraction_bar':
      return fractionBarProblem(spec)
    case 'number_line':
      return numberLineProblem(spec)
    case 'area_model':
      return areaModelProblem(spec)
    case 'place_value':
      return placeValueProblem(spec)
    case 'bar_chart':
      return barChartProblem(spec)
    case 'shape_2d':
      return spec.labels.length > MAX_SHAPE_LABELS ? `a shape has at most ${MAX_SHAPE_LABELS} labels` : null
    case 'grid_area':
      return gridAreaProblem(spec)
    default:
      return null
  }
}

/** The picture of a question: a senior picture as `pictureProblem` checks it, and a primary one as `primaryPictureProblem` does (P166). */
export function questionPictureProblem(spec: SeniorDiagramSpec): string | null {
  return pictureProblem(spec) ?? primaryPictureProblem(spec)
}

function timelineProblem(s: Timeline): string | null {
  if (!(s.from < s.to) || s.to - s.from > MAX_PERIODS) return `a time line goes forward, at most ${MAX_PERIODS} periods`
  if (s.every && !(s.every.from >= s.from && s.every.to <= s.to && s.every.from <= s.every.to)) return 'the payments must be on the time line'
  if (s.every && (!s.every.label.trim() || s.every.label.trim().length > MAX_LABEL)) return `a payment has a short label (at most ${MAX_LABEL} letters)`
  const marks = s.marks ?? []
  if (marks.length > MAX_MARKS) return `a time line has at most ${MAX_MARKS} labels`
  if (marks.some((m) => m.at < s.from || m.at > s.to || !m.label.trim() || m.label.trim().length > MAX_LABEL)) return 'each label is short and on the time line'
  return null
}

// ---- P188: counting and place value ---------------------------------------------------------------------------------------------

type Objects = Extract<SeniorDiagramSpec, { kind: 'objects' }>
type TenFrame = Extract<SeniorDiagramSpec, { kind: 'ten_frame' }>
type BaseTen = Extract<SeniorDiagramSpec, { kind: 'base_ten' }>
type HundredChart = Extract<SeniorDiagramSpec, { kind: 'hundred_chart' }>
type DotArray = Extract<SeniorDiagramSpec, { kind: 'dot_array' }>
type Compare = Extract<SeniorDiagramSpec, { kind: 'compare' }>

/** P188: the most a counting picture holds, so a young learner can count it on a phone. */
export const MAX_OBJECT_GROUPS = 10
export const MAX_IN_A_GROUP = 10
export const MAX_OBJECTS = 30
const MAX_HUNDREDS = 5
const MAX_TENS = 12
const MAX_ONES = 15
const MAX_CHART_ROWS = 5
const MAX_CHART_BLANKS = 8
const MAX_DOTS_SIDE = 10
const MAX_COMPARE = 10

function objectsProblem(s: Objects): string | null {
  if (s.groups.length < 1 || s.groups.length > MAX_OBJECT_GROUPS) return `objects come in 1 to ${MAX_OBJECT_GROUPS} rows or groups`
  if (s.groups.some((n) => !whole(n, 1, MAX_IN_A_GROUP))) return `each row or group holds 1 to ${MAX_IN_A_GROUP} objects`
  if (s.groups.reduce((a, n) => a + n, 0) > MAX_OBJECTS) return `a picture holds at most ${MAX_OBJECTS} objects`
  // P189: gold groups are a fraction of a set, so they are rings of objects.
  if (s.gold !== undefined && (s.layout !== 'groups' || !whole(s.gold, 1, s.groups.length))) return 'gold groups are 1 or more of the groups, with the layout groups'
  return null
}

function tenFrameProblem(s: TenFrame): string | null {
  const frames = s.frames ?? 1
  if (frames !== 1 && frames !== 2) return 'a ten-frame picture has 1 frame, or 2 for twenty'
  if (!whole(s.filled, 0, frames * 10)) return `the frames hold 0 to ${frames * 10} counters`
  if (s.bond && (!whole(s.bond.whole, 1, 20) || !whole(s.bond.part, 0, s.bond.whole))) return 'a number bond has a whole from 1 to 20 and a part from 0 to the whole'
  return null
}

function baseTenProblem(s: BaseTen): string | null {
  const hundreds = s.hundreds ?? 0
  if (!whole(hundreds, 0, MAX_HUNDREDS) || !whole(s.tens, 0, MAX_TENS) || !whole(s.ones, 0, MAX_ONES)) return `blocks are 0 to ${MAX_HUNDREDS} hundreds, 0 to ${MAX_TENS} tens and 0 to ${MAX_ONES} ones`
  if (hundreds + s.tens + s.ones === 0) return 'the picture shows at least one block'
  return null
}

/** P188: the last number of a part of a hundred chart. */
export const chartLast = (s: { from: number; rows: number }): number => s.from + s.rows * 10 - 1

function hundredChartProblem(s: HundredChart): string | null {
  if (!whole(s.from, 1, 111) || (s.from - 1) % 10 !== 0) return 'a part of a hundred chart starts a row: from 1, 11, 21 and so on'
  if (!whole(s.rows, 1, MAX_CHART_ROWS) || chartLast(s) > 120) return `a part of a hundred chart has 1 to ${MAX_CHART_ROWS} rows, up to 120`
  if (s.blanks.length < 1 || s.blanks.length > MAX_CHART_BLANKS) return `a hundred chart has 1 to ${MAX_CHART_BLANKS} empty boxes`
  if (s.blanks.some((n) => !whole(n, s.from, chartLast(s)))) return 'each empty box is on the chart'
  if (new Set(s.blanks).size !== s.blanks.length) return 'each empty box is named once'
  if (s.gold !== undefined && !s.blanks.includes(s.gold)) return 'the gold box is one of the empty boxes'
  return null
}

function dotArrayProblem(s: DotArray): string | null {
  return whole(s.rows, 1, MAX_DOTS_SIDE) && whole(s.cols, 1, MAX_DOTS_SIDE) ? null : `a dot array has 1 to ${MAX_DOTS_SIDE} rows and 1 to ${MAX_DOTS_SIDE} dots in a row`
}

function compareProblem(s: Compare): string | null {
  const ok = (t: string) => t.trim().length > 0 && t.trim().length <= MAX_COMPARE
  return ok(s.left) && ok(s.right) ? null : `each side of a comparison is 1 to ${MAX_COMPARE} characters`
}

// ---- P189: fractions, percentages, time and money -----------------------------------------------------------------------------------

type FactorTree = Extract<SeniorDiagramSpec, { kind: 'factor_tree' }>
type FractionCircle = Extract<SeniorDiagramSpec, { kind: 'fraction_circle' }>
type PercentBar = Extract<SeniorDiagramSpec, { kind: 'percent_bar' }>
type Calendar = Extract<SeniorDiagramSpec, { kind: 'calendar' }>
type Money = Extract<SeniorDiagramSpec, { kind: 'money' }>

/** P189: the most a picture of these boards holds, so it fits a phone. */
const MAX_TREE_ROOT = 1000
const MAX_SPLITS = 5
const MAX_TREE_LEAVES = 6
const MAX_TREE_ROWS = 5
const MAX_CIRCLE_PARTS = 12
const MAX_CIRCLES = 3
const MAX_PERCENT_WHOLE = 10_000_000
const MAX_BAR_PARTS = 10
const MAX_CIRCLED = 3
const MAX_MONEY_ITEMS = 10

function factorTreeProblem(s: FactorTree): string | null {
  if (!whole(s.root, 4, MAX_TREE_ROOT)) return `a factor tree starts with a whole number from 4 to ${MAX_TREE_ROOT}`
  if (s.splits.length < 1 || s.splits.length > MAX_SPLITS) return `a factor tree has 1 to ${MAX_SPLITS} splits`
  for (const split of s.splits) {
    if (split.into.length !== 2 || split.into.some((n) => !whole(n, 2, MAX_TREE_ROOT))) return 'each split is into two whole numbers, each 2 or more'
    if (split.into[0]! * split.into[1]! !== split.of) return `${split.into[0]} × ${split.into[1]} is not ${split.of}`
  }
  const tree = factorTreeOf(s)
  if (tree.unused > 0) return 'each split is of a number on the tree that has not split yet'
  if (tree.leaves.length > MAX_TREE_LEAVES || tree.rows > MAX_TREE_ROWS) return `a factor tree has at most ${MAX_TREE_LEAVES} numbers at the bottom and ${MAX_TREE_ROWS} rows`
  if (s.gold !== undefined && !hasBelow(tree.root, s.gold)) return 'the gold number is on the tree, below the top'
  return null
}

/** True when a number below the top of a tree has this value. */
const hasBelow = (root: ReturnType<typeof factorTreeOf>['root'], value: number): boolean => {
  const walk = (n: typeof root): boolean => n.kids.some((k) => k.value === value || walk(k))
  return walk(root)
}

function fractionCircleProblem(s: FractionCircle): string | null {
  const circles = s.circles ?? 1
  if (!whole(s.parts, 2, MAX_CIRCLE_PARTS)) return `a fraction circle is cut into 2 to ${MAX_CIRCLE_PARTS} equal parts`
  if (!whole(circles, 1, MAX_CIRCLES)) return `a picture has 1 to ${MAX_CIRCLES} fraction circles`
  if (!whole(s.shaded, 0, s.parts * circles)) return `the circles have 0 to ${s.parts * circles} gold parts`
  return null
}

function percentBarProblem(s: PercentBar): string | null {
  if (!(s.whole > 0 && s.whole <= MAX_PERCENT_WHOLE)) return 'the whole of a percentage bar is more than 0'
  if (!(s.percent > 0 && s.percent <= 100)) return 'the shaded part of a percentage bar is more than 0% and at most 100%'
  if (s.parts !== undefined && !whole(s.parts, 2, MAX_BAR_PARTS)) return `a percentage bar is cut into 2 to ${MAX_BAR_PARTS} equal parts`
  return null
}

function calendarProblem(s: Calendar): string | null {
  if (!whole(s.year, 1900, 2100) || !whole(s.month, 1, 12)) return 'a calendar is a month from 1 to 12 of a year from 1900 to 2100'
  const circled = s.circled ?? []
  if (circled.length > MAX_CIRCLED) return `a calendar has at most ${MAX_CIRCLED} days circled`
  if (circled.some((d) => !whole(d, 1, daysIn(s.year, s.month)))) return 'each circled day is a day of the month'
  if (new Set(circled).size !== circled.length) return 'each circled day is named once'
  return null
}

function moneyProblem(s: Money): string | null {
  if (s.items.length < 1 || s.items.length > MAX_MONEY_ITEMS) return `a picture of money has 1 to ${MAX_MONEY_ITEMS} coins and notes`
  if (s.items.some((c) => !(MONEY_VALUES as readonly number[]).includes(c))) return 'each coin or note is a real one, in cents: 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000 or 20000 (1, 5, 10, 25, 50, 100, 500, 1000 or 2000 in the US)'
  return null
}

// ---- P190: measuring ------------------------------------------------------------------------------------------------------------------

type Ruler = Extract<SeniorDiagramSpec, { kind: 'ruler' }>
type ScaleDial = Extract<SeniorDiagramSpec, { kind: 'scale_dial' }>
type Jug = Extract<SeniorDiagramSpec, { kind: 'jug' }>
type Thermometer = Extract<SeniorDiagramSpec, { kind: 'thermometer' }>
type Cubes = Extract<SeniorDiagramSpec, { kind: 'cubes' }>
type BoxNet = Extract<SeniorDiagramSpec, { kind: 'box_net' }>

/** P190: the dials and jugs Jemma draws: a dial is cut into 20 steps and a jug into 10, so each step is a round number. */
export const SCALE_MAXES = { g: [500, 1000, 2000, 5000], kg: [1, 2, 5, 10] } as const
export const JUG_MAXES = { ml: [250, 500, 1000, 2000], l: [1, 2, 5] } as const
export const SCALE_STEPS = 20
export const JUG_STEPS = 10
/** P190: how many degrees one step of a thermometer is, by how far it runs: every degree up to 30, every 2 up to 60, every 5 up to 120. */
export const thermometerStep = (s: { min: number; max: number }): number => (s.max - s.min <= 30 ? 1 : s.max - s.min <= 60 ? 2 : 5)

/** True when `v` is a whole number of `step`s (to within a rounding slip). */
const onStep = (v: number, step: number) => Math.abs(v / step - Math.round(v / step)) < 1e-6

function rulerProblem(s: Ruler): string | null {
  const inches = s.unit === 'in'
  const step = inches ? 0.25 : 0.5
  const from = s.from ?? 0
  if (inches ? !whole(s.to, 3, 12) : !whole(s.to, 5, 15)) return inches ? 'a ruler in inches runs to 3 to 12 inches' : 'a ruler in centimetres runs to 5 to 15 cm'
  if (from < 0 || !onStep(from, step) || !(s.length > 0) || !onStep(s.length, step)) return inches ? 'the thing starts and ends on a quarter inch' : 'the thing starts and ends on a whole or half centimetre'
  if (from + s.length > s.to) return 'the thing ends on the ruler'
  return null
}

function scaleDialProblem(s: ScaleDial): string | null {
  if (!(SCALE_MAXES[s.unit] as readonly number[]).includes(s.max)) return `a scale in ${s.unit} goes up to ${SCALE_MAXES[s.unit].join(', ')}`
  if (s.value < 0 || s.value > s.max || !onStep(s.value, s.max / SCALE_STEPS)) return `the needle points to a mark of the dial: a step of ${s.max / SCALE_STEPS} ${s.unit}`
  return null
}

function jugProblem(s: Jug): string | null {
  if (!(JUG_MAXES[s.unit] as readonly number[]).includes(s.max)) return `a jug in ${s.unit} goes up to ${JUG_MAXES[s.unit].join(', ')}`
  if (!(s.value > 0) || s.value > s.max || !onStep(s.value, s.max / JUG_STEPS)) return `the water is at a mark of the jug: a step of ${s.max / JUG_STEPS} ${s.unit}`
  return null
}

function thermometerProblem(s: Thermometer): string | null {
  if (!Number.isInteger(s.min / 10) || !Number.isInteger(s.max / 10) || s.max - s.min < 20 || s.max - s.min > 120) return 'a thermometer runs from one ten to another, 20 to 120 degrees apart'
  // The red line may stop halfway between two marks (23 between 22 and 24), at a whole number of degrees.
  if (s.value < s.min || s.value > s.max || !Number.isInteger(s.value) || !onStep(s.value - s.min, thermometerStep(s) / 2))
    return `the red line is at a whole number of degrees, on a mark of the thermometer or halfway between two (a mark every ${thermometerStep(s)})`
  return null
}

function cubesProblem(s: Cubes): string | null {
  return whole(s.long, 1, 6) && whole(s.wide, 1, 6) && whole(s.high, 1, 6) ? null : 'a box of cubes is 1 to 6 cubes long, wide and high'
}

function boxNetProblem(s: BoxNet): string | null {
  return whole(s.long, 1, 12) && whole(s.wide, 1, 12) && whole(s.high, 1, 12) ? null : 'the net of a box is 1 to 12 long, wide and high, in whole units'
}

// ---- P191: patterns, algebra and graphs ------------------------------------------------------------------------------------------------

type TilePattern = Extract<SeniorDiagramSpec, { kind: 'tile_pattern' }>
type FlowDiagram = Extract<SeniorDiagramSpec, { kind: 'flow_diagram' }>
type Balance = Extract<SeniorDiagramSpec, { kind: 'balance' }>
type TravelGraph = Extract<SeniorDiagramSpec, { kind: 'travel_graph' }>

const MAX_PATTERN_TILES = 30
const MAX_PATTERNS_SHOWN = 4

function tilePatternProblem(s: TilePattern): string | null {
  const from = s.from ?? 1
  if (!whole(from, 1, 5) || !whole(s.show, 2, MAX_PATTERNS_SHOWN)) return `a tile pattern shows 2 to ${MAX_PATTERNS_SHOWN} patterns, from pattern 1 to 5`
  if (tilesOf(s.shape, from + s.show - 1).length > MAX_PATTERN_TILES) return `each pattern has at most ${MAX_PATTERN_TILES} tiles`
  return null
}

/** The blanks of a flow diagram: the places of the outputs and the inputs drawn as gold blanks, each on the diagram and named once. */
const placesOk = (places: readonly number[] | undefined, n: number) => !places || (places.every((p) => whole(p, 1, n)) && new Set(places).size === places.length)

function flowDiagramProblem(s: FlowDiagram): string | null {
  if (s.rule.length < 1 || s.rule.length > 3) return 'a flow diagram has 1 to 3 steps'
  if (s.rule.some((r) => (r.op === 'multiply' || r.op === 'divide') && r.by === 0)) return 'a flow diagram never multiplies or divides by 0'
  if (s.inputs.length < 1 || s.inputs.length > 4) return 'a flow diagram has 1 to 4 inputs'
  if (s.inputs.some((v) => !whole(v, 0, 1000))) return 'each input is a whole number from 0 to 1000'
  if (s.inputs.map((v) => flowOutput(s.rule, v)).some((v) => !Number.isInteger(Math.round(v * 1e9) / 1e9) || Math.abs(v) > 100_000)) return 'each output is a whole number'
  if (!placesOk(s.blanks, s.inputs.length) || !placesOk(s.blankInputs, s.inputs.length)) return 'each blank is the place of an output or an input, from 1, named once'
  return null
}

function balanceProblem(s: Balance): string | null {
  const pans = [s.left, s.right]
  if (pans.some((p) => !whole(p.x, 0, 4) || !whole(p.n, 0, 99))) return 'each pan holds 0 to 4 bags and weights of 0 to 99'
  if (s.left.x === s.right.x) return 'the two pans hold a different number of bags'
  const x = balanceSolution(s)
  if (!whole(x, 1, 99)) return 'a bag weighs a whole number from 1 to 99, so the scale can balance'
  if (s.letter !== undefined && !/^[a-z]$/.test(s.letter)) return 'the letter of a bag is one small letter'
  return null
}

function travelGraphProblem(s: TravelGraph): string | null {
  if (s.points.length < 2 || s.points.length > 8) return 'a graph of a trip has 2 to 8 points'
  if (s.points[0]!.t !== 0) return 'a graph of a trip starts at time 0'
  if (s.points.some((p, i) => i > 0 && !(p.t > s.points[i - 1]!.t))) return 'the times of a trip go up from one point to the next'
  if (!(s.tMax > 0) || !(s.dMax > 0) || s.points.some((p) => p.t > s.tMax || p.d < 0 || p.d > s.dMax)) return 'every point is on the graph, from 0 to tMax and 0 to dMax'
  const lines = (max: number, step?: number) => (step === undefined ? 6 : max / step)
  if (![lines(s.tMax, s.tStep), lines(s.dMax, s.dStep)].every((n) => whole(Math.round(n * 1e9) / 1e9, 2, 12))) return 'the grid of a trip has 2 to 12 lines each way'
  return null
}

/** The values of the gold blanks of a flow diagram, in order: the outputs first, then the inputs. */
const flowBlanks = (s: FlowDiagram): number[] => [...(s.blanks ?? []).map((p) => flowOutput(s.rule, s.inputs[p - 1]!)), ...(s.blankInputs ?? []).map((p) => s.inputs[p - 1]!)]

/** P190: the reading of a measuring picture, and the same reading in the unit a thousand times bigger or smaller (700 ml is 0,7 l), or null for none. */
function readingsOf(d: SeniorDiagramSpec): number[] | null {
  if (d.kind === 'ruler') return d.unit === 'in' ? [d.length] : [d.length, d.length * 10, d.length / 100]
  if (d.kind === 'scale_dial' || d.kind === 'jug') return [d.value, d.value * 1000, d.value / 1000]
  if (d.kind === 'thermometer') return [d.value]
  return null
}

const near = (a: number, b: number) => Math.abs(a - b) < 0.005

/**
 * P188: why the key of a question does not fit its picture, or null. A hundred chart with a gold box asks for the number in it, so a whole answer is that number.
 * P189: and so does a factor tree with a gold number. The question mark of a percentage bar is the amount of its shaded part, its whole or its percent, so a
 * number key is that number (`read` reads it, the way the key is written). P190: a measuring picture is read, so a number key is its reading.
 */
export function pictureKeyProblem(q: { answer: string; answerKind: string; diagram?: SeniorDiagramSpec }, read?: (text: string) => number | null): string | null {
  const d = q.diagram
  if (d?.kind === 'hundred_chart' && d.gold !== undefined && q.answerKind === 'whole' && q.answer.trim() !== String(d.gold)) return `the answer is the number in the gold box of the hundred chart, ${d.gold}`
  if (d?.kind === 'factor_tree' && d.gold !== undefined && q.answerKind === 'whole' && q.answer.trim() !== String(d.gold)) return `the answer is the gold number of the factor tree, ${d.gold}`
  if (d?.kind === 'percent_bar' && read && ['whole', 'decimal', 'money'].includes(q.answerKind)) {
    const ask = d.ask ?? 'part'
    const want = ask === 'whole' ? d.whole : ask === 'percent' ? d.percent : percentPart(d)
    const got = read(q.answer)
    if (got !== null && !near(got, want)) return `the answer is what the question mark of the percentage bar stands for, ${Math.round(want * 100) / 100}`
  }
  // P191: the blanks of a flow diagram are its key: one blank for a number key, every blank (the outputs first) for a list; a balance scale asks what a bag weighs.
  if (d?.kind === 'flow_diagram' && read) {
    const want = flowBlanks(d)
    if (['whole', 'decimal'].includes(q.answerKind) && want.length === 1) {
      const got = read(q.answer)
      if (got !== null && !near(got, want[0]!)) return `the answer is the blank of the flow diagram, ${want[0]}`
    }
    if (q.answerKind === 'list' && want.length > 1) {
      const got = q.answer.split(';').map((p) => read(p.trim()))
      if (got.length !== want.length || got.some((g, i) => g !== null && !near(g, want[i]!))) return `the answer is the blanks of the flow diagram, the outputs first: ${want.join('; ')}`
    }
  }
  if (d?.kind === 'balance' && read && ['whole', 'decimal'].includes(q.answerKind)) {
    const got = read(q.answer.replace(/^\s*[a-z]\s*=\s*/i, ''))
    if (got !== null && !near(got, balanceSolution(d))) return `the answer is what a bag weighs, ${balanceSolution(d)}`
  }
  // P190: a ruler, a scale, a jug and a thermometer are read, so a number key is the reading (in its unit, or one a thousand times bigger or smaller).
  const readings = d ? readingsOf(d) : null
  if (readings && read && ['whole', 'decimal'].includes(q.answerKind)) {
    const got = read(q.answer)
    if (got !== null && !readings.some((r) => near(got, r))) return `the answer is the reading of the picture, ${Math.round(readings[0]! * 1000) / 1000}`
  }
  return null
}

export function pictureProblem(spec: SeniorDiagramSpec): string | null {
  if (spec.kind === 'coordinate_plane') return planeProblem(spec)
  if (spec.kind === 'triangle') return triangleProblem(spec)
  if (spec.kind === 'box_plot') return boxPlotProblem(spec)
  if (spec.kind === 'tree') return treeProblem(spec)
  if (spec.kind === 'timeline') return timelineProblem(spec)
  // P188: the pictures of the question type boards are checked wherever they are drawn.
  const finite = numbersIn(spec).every(Number.isFinite) ? null : 'every number of the picture must be finite'
  switch (spec.kind) {
    case 'objects':
      return finite ?? objectsProblem(spec)
    case 'ten_frame':
      return finite ?? tenFrameProblem(spec)
    case 'base_ten':
      return finite ?? baseTenProblem(spec)
    case 'hundred_chart':
      return finite ?? hundredChartProblem(spec)
    case 'dot_array':
      return finite ?? dotArrayProblem(spec)
    case 'compare':
      return compareProblem(spec)
    // P189
    case 'factor_tree':
      return finite ?? factorTreeProblem(spec)
    case 'fraction_circle':
      return finite ?? fractionCircleProblem(spec)
    case 'percent_bar':
      return finite ?? percentBarProblem(spec)
    case 'calendar':
      return finite ?? calendarProblem(spec)
    case 'money':
      return finite ?? moneyProblem(spec)
    // P190
    case 'ruler':
      return finite ?? rulerProblem(spec)
    case 'scale_dial':
      return finite ?? scaleDialProblem(spec)
    case 'jug':
      return finite ?? jugProblem(spec)
    case 'thermometer':
      return finite ?? thermometerProblem(spec)
    case 'cubes':
      return finite ?? cubesProblem(spec)
    case 'box_net':
      return finite ?? boxNetProblem(spec)
    // P191
    case 'tile_pattern':
      return finite ?? tilePatternProblem(spec)
    case 'flow_diagram':
      return finite ?? flowDiagramProblem(spec)
    case 'balance':
      return finite ?? balanceProblem(spec)
    case 'travel_graph':
      return finite ?? travelGraphProblem(spec)
    default:
      return null
  }
}
