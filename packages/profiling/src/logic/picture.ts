import type { SeniorDiagramSpec } from '../schemas/diagram'

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

export function pictureProblem(spec: SeniorDiagramSpec): string | null {
  if (spec.kind === 'coordinate_plane') return planeProblem(spec)
  if (spec.kind === 'triangle') return triangleProblem(spec)
  if (spec.kind === 'box_plot') return boxPlotProblem(spec)
  if (spec.kind === 'tree') return treeProblem(spec)
  if (spec.kind === 'timeline') return timelineProblem(spec)
  return null
}
