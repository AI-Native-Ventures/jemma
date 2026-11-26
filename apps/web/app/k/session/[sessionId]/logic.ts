import {
  answerCountOf,
  blankBars,
  choiceLabel,
  columnsPlaces,
  completeAnswer,
  fillMissing,
  finishAnswer,
  graphValues,
  groupsOf,
  groupsText,
  clockOf,
  clockWords,
  matchOf,
  matchText,
  checkProof,
  proofLines,
  sameExpression,
  checkFirstPrinciples,
  derivativeOf,
  firstPrinciplesLines,
  functionName,
  holdsH,
  LINE_MAX_LENGTH,
  workedLineOf,
  type FirstPrinciplesWhy,
  familiesOf,
  generalLetter,
  generalText,
  inDegreesFrom,
  graphMatchOf,
  prettyEquation,
  curveThrough,
  curveWords,
  plotPoints,
  plotReader,
  sketchName,
  tapPicks,
  linePoints,
  pinMarkOf,
  isInequalityKey,
  isListKind,
  isSeniorQuestion,
  isPairKey,
  listAnswerParts,
  LIST_MAX_LENGTH,
  missingPart,
  nextDifficulty,
  nextStage,
  paperQuestions,
  ratioPartsOf,
  readNumber,
  readTrueFalse,
  reasonKeyHasValue,
  resultCells,
  rightValues,
  showWithUnit,
  splitValues,
  timeStyleOf,
  trueFalseLabel,
  CHOICE_LETTERS,
  type ListParts,
  type MissingPart,
  type Stage,
  type TimeStyle,
} from '@jemma/profiling/logic'
import type { BlocksSpec, Choice, ClockFaceSpec, ClockSpec, ColumnsSpec, GraphMatchSpec, DataGraphSpec, FirstPrinciplesSpec, Form, GeneralSpec, GroupsSpec, LineSpec, MatchSpec, PinSpec, PlotSpec, ProofSpec, Question, SeniorDiagramSpec, ShadeSpec, TapSpec } from '@jemma/profiling/schemas'

/** Every try run starts at the middle level and adapts from there. */
export const START_LEVEL = 2
/** Same default the agent uses when it moves a gap on a finished lesson. */
export const FIX_AFTER_DAYS = 3
export const DEFAULT_TRY_COUNT = 5
/** The longest answer the server takes: the longest the marking reads (60 characters), so a fraction sum from the maths editor fits. */
export const ANSWER_MAX_LENGTH = 60
/** A list, an order or a table is several values in one answer (P150): its answer may be this long. */
export const LIST_ANSWER_MAX_LENGTH = LIST_MAX_LENGTH
/** P185: the lines of a proof (6) or of first principles (7) are lines of worked maths, each up to `LINE_MAX_LENGTH` characters: the answer may be this long. */
export const LINES_ANSWER_MAX_LENGTH = 7 * LINE_MAX_LENGTH + 20

/** P185: the longest answer a question takes: one line of maths, several values (a list, an order, a table), or the lines of a proof or of first principles. */
export function answerMaxLength(q: { answerKind: string; proof?: unknown; firstPrinciples?: unknown }): number {
  if ((q.proof || q.firstPrinciples) && q.answerKind === 'list') return LINES_ANSWER_MAX_LENGTH
  return isListKind(q.answerKind) ? LIST_ANSWER_MAX_LENGTH : ANSWER_MAX_LENGTH
}

export type Phase = 'warmup' | 'try'

/** What the child's screen may hold while a quiz runs: no answer, no why, no right way. */
export type QuestionForChild = {
  /** 1-based across warm-up then try. */
  position: number
  phase: Phase
  /** 1-based inside its phase. */
  index: number
  /** Questions in its phase. */
  of: number
  prompt: string
  render: Question['render']
  terms?: string[]
  answerKind: Question['answerKind']
  /** The options of a choice question, A to E: a plain string, or (a senior class) words and/or a picture. They are options, not the answer: the key never goes to the browser. */
  choices?: Choice[]
  /** A `reason` question that also asks for a value (a box above the list of reasons). A shape hint only: the value itself is never sent. */
  withValue?: boolean
  /** The form an expression has to be in, when the question asks for one (a senior class only). */
  form?: Form
  /** The picture the question needs, drawn between its words and the answer box: a graph or a triangle (a senior class) or, since P166, one of the seven primary pictures (Grades 1 to 6). It never holds the answer. */
  diagram?: SeniorDiagramSpec
  /**
   * An equation question only (P146): how many values its key has (2 for "x = 2 or x = 3", 1 for one value). The screen shows that many boxes. An inequality
   * ("x < -1 or x > 4") is one answer, not a list, so it has none. Only the count goes to the browser, never the values.
   */
  answerCount?: number
  /** An equation question only: the letter of the key ("x"), so a box can start with "x =". */
  answerLetter?: string
  /** P148: the unit of the answer, shown after the box ("cm²"). A number, a whole or a decimal answer of a senior class. */
  unit?: string
  /** P148: how a `time` answer is asked for (a shape hint from the key, never its value): the hours and minutes of a 24 hour clock, of a 12 hour clock with am and pm, or of a length of time. */
  timeStyle?: TimeStyle
  /** P148: how many boxes a `ratio` answer has, from its key: 2 or 3. */
  ratioParts?: 2 | 3
  /** P148: a whole or decimal question of a senior class (Grades 7 to 12): its box gets a minus key. */
  signed?: true
  /** P147: the SHAPE of the answer when its key is an inequality or an interval ('inequality') or two letters with a value each ('pair'), so the screen can say how to type it. Never the key itself. */
  answerShape?: 'inequality' | 'pair'
  /** P150, a list: how many boxes, whether the place of a value matters, whether a number pad is enough, and a label over each box. Never a value. */
  list?: ListParts['list']
  /** P150, an order: the items to put in order, shuffled (never in the right order). */
  items?: ListParts['items']
  /** P150, a table: its columns and rows with each blank cell as null. The given cells are in the question anyway. */
  table?: ListParts['table']
  /** P148 (a number, a whole or a decimal) and P150 (a list or a table): the places the answer is rounded to, when the question asks for it ("correct to 1 decimal place"). A count, so it may be sent. */
  round?: number
  /** P151: the learner is in Grade 1 to 6, so the lists, orders, tables and times are drawn bigger and worded simply. Only ever true. */
  young?: true
  /** P167: a graph the learner draws. The bars to draw have no value in it (they are the answer): the given bars are in the question anyway. */
  graph?: DataGraphSpec
  /** P168: a sum the learner works in columns. Its numbers are in the question anyway; the answer is never sent. */
  columns?: ColumnsSpec
  /** P169: the place value blocks the learner builds a number with. */
  blocks?: BlocksSpec
  /** P170: the groups and the things to sort into them, in a mixed-up order. Which thing goes where is the answer, and is never sent. */
  groups?: GroupsSpec
  /** P171: the grid to place points on, with the given points and the names of the points to place. Where they go is the answer, and is never sent. */
  plot?: PlotSpec
  /** P172: the shape the learner shades parts of. How many is the answer, and is never sent. */
  shade?: ShadeSpec
  /** P173: the shapes the learner taps to pick. Which ones is the answer, and is never sent. */
  tap?: TapSpec
  /** P174: the grid the learner draws a straight line on. The line is the answer, and is never sent. */
  line?: LineSpec
  /** P175: the number line the learner puts a pin on. Where it goes is the answer, and is never sent. */
  pin?: PinSpec
  /** P177: the clock the learner sets. The time is the answer, and is never sent. */
  clock?: ClockSpec
  /** P178: the things the learner matches in pairs. Which goes with which is the answer, and is never sent. */
  match?: MatchSpec
  /** P179: the identity the learner proves line by line (its two sides are in the prompt too). The proof is the answer, and is never sent. */
  proof?: ProofSpec
  /** P180: the frame of every solution of a trig equation (its letter). The solutions are the answer, and are never sent. */
  general?: GeneralSpec
  /** P183: a clock face to read. It shows the time, as the picture of a question must. */
  clockFace?: ClockFaceSpec
  /** P184: graphs to match to their equations. Which goes with which is the answer, and is never sent. */
  graphMatch?: GraphMatchSpec
  /** P185: the function the learner differentiates from first principles (it is in the prompt too). The lines are the answer, and are never sent. */
  firstPrinciples?: FirstPrinciplesSpec
}

/** A stored `session_items` row (question holds the whole `Question`, as the seed writes it). */
export type StoredItem = {
  phase: Phase
  position: number
  question: Question
  answer: string
  correct: boolean
  difficulty: number
  seconds: number
  /** A paper answer that could not be read: the answer is empty and it counts as missed. Kept inside the stored question, see `save_practice_answers`. */
  unread?: boolean
}

/**
 * One try question as its card on the results screen has it. The name is old: since P126 the results list holds EVERY try question (`reviewOf`), a right
 * one confirmed and explained and a missed one corrected, and `correct` tells them apart. A list of misses only (`missedOf`) carries no `correct`.
 */
export type MissedQuestion = {
  /** Number among the try questions, as the results screen titles it. */
  n: number
  /** True when the answer was right (the card confirms it and says why it works), false when it was missed. Absent in a list that only holds misses. */
  correct?: boolean
  prompt: string
  render: Question['render']
  terms?: string[]
  /** The picture of the question, drawn under its heading (a senior class, and since P166 Grades 1 to 6 too). */
  diagram?: SeniorDiagramSpec
  /** P183: the clock face of the question, drawn under its heading. */
  clockFace?: ClockFaceSpec
  wrote: string
  /** The answer on paper could not be read: the screen says so under "You wrote" instead of showing an empty answer. */
  unread?: boolean
  right: string
  why: string
  rightWay: string
  /** The maths from the question to the answer, one line each (a senior lesson, 2 to 6 lines). Absent for a question that has none: the card then shows the right way alone. */
  steps?: string[]
  /** P150, a list, an order or a table: each place of the answer with what was written, the right value (a fixed order) and whether it was right. */
  cells?: { wrote: string; right: string; ok: boolean }[]
  /** P150, a table: its columns and rows (a blank is null), so the results can draw it with the answers in. */
  table?: NonNullable<ListParts['table']>
  /** P150, a list or an order: the right answer is drawn in the same places as the answer (a fixed order), or as one list (any order). */
  ordered?: boolean
  /** P167: the graph the learner drew on, the values they drew for its empty bars (null where a value could not be read) and the right ones, in order. */
  graph?: DataGraphSpec
  graphWrote?: (number | null)[]
  graphRight?: number[]
  /** P168: the sum worked in columns, and each answer box as the learner wrote it with the right digit (the results mark a wrong digit in red pen). */
  columns?: ColumnsSpec
  columnsPlaces?: { wrote: string; right: string; ok: boolean }[]
  /** P169: the blocks the learner built a number with; the results draw the mat of the number they built (`wrote`). */
  blocks?: BlocksSpec
  /** P170: the groups, and the group the learner put each thing in (null: not read) and its right group, as numbers from 1. */
  groups?: GroupsSpec
  groupsWrote?: (number | null)[]
  groupsRight?: number[]
  /** P171: the grid, the points the learner placed (null: not read) and the right ones, in the order of the points to place. */
  plot?: PlotSpec
  plotWrote?: ({ x: number; y: number } | null)[]
  plotRight?: { x: number; y: number }[]
  /** P172: the shape the learner shaded; the results draw as many parts shaded as they shaded (`wrote`). */
  shade?: ShadeSpec
  /** P173: the shapes, the ones the learner picked and the right ones (numbers from 1). */
  tap?: TapSpec
  tapWrote?: number[]
  tapRight?: number[]
  /** P174: the grid, the two points of the learner's line (null: not read) and two points of the right line. */
  line?: LineSpec
  lineWrote?: [{ x: number; y: number }, { x: number; y: number }] | null
  lineRight?: [{ x: number; y: number }, { x: number; y: number }] | null
  /** P175: the number line, and the marks of the learner's pin (null: not on a mark) and of the right one (0 is the start). */
  pin?: PinSpec
  pinWrote?: number | null
  pinRight?: number | null
  /** P177: the clock, and the time the learner set (null: not a time) and the right time. */
  clock?: ClockSpec
  clockWrote?: { hour: number; minute: number } | null
  clockRight?: { hour: number; minute: number } | null
  /** P178: the things matched, the partner the learner gave each left one (null: none) and the right one, as indexes into `right`. */
  match?: MatchSpec
  matchWrote?: (number | null)[]
  matchRight?: number[]
  /** P184: the graphs drawn small on the left of a match of graphs and equations. */
  matchPlane?: GraphMatchSpec
  /** P179: the identity, the learner's lines, the first that does not follow (null: none) and the line it should have been. */
  proof?: ProofSpec
  proofLines?: string[]
  proofWrong?: number | null
  proofRight?: string | null
  /** P185: a derivative from first principles as the learner wrote it, checked line by line. */
  firstPrinciples?: FirstPrinciplesReview
  /**
   * P187: `wrote` and `right` are written by Jemma, the South African way (a point, a sketch said by its points, the families of every solution): the results show
   * them in the notation of the space, (2, 3) and 2.5 in the US. Any other answer is shown as it was written.
   */
  notated?: true
}

/**
 * P185: the learner's lines of a derivative from first principles, as the results draw them: each line and whether h is in it (it is then under the limit),
 * the first that does not follow (null: none) with why, and the line of the key in its place.
 */
export type FirstPrinciplesReview = {
  spec: FirstPrinciplesSpec
  lines: string[]
  under: boolean[]
  wrong: number | null
  why: FirstPrinciplesWhy | null
  rightLine: string | null
  rightUnder: boolean
}

/** The P148 fields of a question for the child. Shape hints only: how many boxes, which clock, which unit. Never the key. */
function quantityHints(q: Question): Pick<QuestionForChild, 'unit' | 'round' | 'timeStyle' | 'ratioParts' | 'signed'> {
  const unit = q.unit?.trim()
  const shown = q.answerKind === 'number' || q.answerKind === 'whole' || q.answerKind === 'decimal'
  const timeStyle = q.answerKind === 'time' ? timeStyleOf(q.answer) : null
  const ratioParts = q.answerKind === 'ratio' ? ratioPartsOf(q.answer) : null
  return {
    ...(shown && unit ? { unit } : {}),
    ...(shown && q.round !== undefined ? { round: q.round } : {}),
    ...(timeStyle ? { timeStyle } : {}),
    ...(ratioParts ? { ratioParts } : {}),
    ...((q.answerKind === 'whole' || q.answerKind === 'decimal') && isSeniorQuestion(q) ? { signed: true as const } : {}),
  }
}

/** A learner of Grade 1 to 6 (P151): the screens of the new answer kinds are drawn bigger for them. */
export const isYoungGrade = (grade: unknown): boolean => typeof grade === 'number' && Number.isInteger(grade) && grade >= 1 && grade <= 6

const withoutSign = ({ signed: _signed, ...rest }: ReturnType<typeof quantityHints>) => rest

export function stripQuestion(
  q: Question,
  at: { position: number; phase: Phase; index: number; of: number; young?: boolean },
): QuestionForChild {
  return {
    position: at.position,
    phase: at.phase,
    index: at.index,
    of: at.of,
    prompt: q.prompt,
    render: q.render,
    ...(q.terms ? { terms: q.terms } : {}),
    answerKind: q.answerKind,
    // A true or false and a reason question ignore any choices they carry (the screen shows True and False, or the list of reasons).
    ...(q.choices && q.answerKind !== 'truefalse' && q.answerKind !== 'reason' ? { choices: q.choices } : {}),
    ...(q.answerKind === 'reason' && reasonKeyHasValue(q.answer) ? { withValue: true } : {}),
    ...(q.form ? { form: q.form } : {}),
    ...(q.diagram ? { diagram: q.diagram } : {}),
    ...answerFactsOf(q),
    // A learner of Grade 1 to 6 never gets the minus key (P151), whatever the question holds: they work with whole numbers and measures.
    ...(at.young ? withoutSign(quantityHints(q)) : quantityHints(q)),
    ...(q.answerKind === 'equation' && isInequalityKey(q.answer) ? { answerShape: 'inequality' as const } : q.answerKind === 'equation' && isPairKey(q.answer) ? { answerShape: 'pair' as const } : {}),
    // P150: a count, the labels, the items to put in order (shuffled), the table with its blanks: never the key's values or order.
    ...listAnswerParts(q),
    ...(isListKind(q.answerKind) && q.round !== undefined ? { round: q.round } : {}),
    ...(at.young ? { young: true as const } : {}),
    ...(q.graph ? { graph: q.graph } : {}),
    ...(q.columns ? { columns: q.columns } : {}),
    ...(q.blocks ? { blocks: q.blocks } : {}),
    ...(q.groups ? { groups: q.groups } : {}),
    ...(q.plot ? { plot: q.plot } : {}),
    ...(q.shade ? { shade: q.shade } : {}),
    ...(q.tap ? { tap: q.tap } : {}),
    ...(q.line ? { line: q.line } : {}),
    ...(q.pin ? { pin: q.pin } : {}),
    ...(q.clock ? { clock: q.clock } : {}),
    ...(q.match ? { match: q.match } : {}),
    ...(q.proof ? { proof: q.proof } : {}),
    ...(q.general ? { general: q.general } : {}),
    ...(q.clockFace ? { clockFace: q.clockFace } : {}),
    ...(q.graphMatch ? { graphMatch: q.graphMatch } : {}),
    ...(q.firstPrinciples ? { firstPrinciples: q.firstPrinciples } : {}),
  }
}

/**
 * The count and the letter of an equation question's key (P146), the only facts about the key the browser gets. A key that is an inequality (count 0) or does
 * not read (a pair, an interval) has none: it is one answer, in one box.
 */
function answerFactsOf(q: Question): Pick<QuestionForChild, 'answerCount' | 'answerLetter'> {
  // An inequality, an interval and a pair (P147) are one answer in one box, whatever the pieces of their key look like.
  const facts = q.answerKind === 'equation' && !isInequalityKey(q.answer) && !isPairKey(q.answer) ? answerCountOf(q.answer) : null
  return facts && facts.count > 0 ? { answerCount: facts.count, ...(facts.letter ? { answerLetter: facts.letter } : {}) } : {}
}

const sorted = (items: StoredItem[], phase: Phase) =>
  items.filter((i) => i.phase === phase).sort((a, b) => a.position - b.position)

/** Next try question: the first unused one at the level `nextDifficulty` asks for, else the closest level. */
function pickTry(pool: Question[], tried: StoredItem[]): Question | null {
  const level = nextDifficulty(START_LEVEL, tried.map((t) => t.correct)).next
  const used = new Set(tried.map((t) => t.question.prompt))
  const free = pool.filter((q) => !used.has(q.prompt))
  return (
    free.find((q) => q.difficulty === level) ??
    [...free].sort((a, b) => Math.abs(a.difficulty - level) - Math.abs(b.difficulty - level))[0] ??
    null
  )
}

/** The next unanswered question in the whole run, or null when every question has an answer. */
export function nextInSequence(
  warmup: Question[],
  pool: Question[],
  tryCount: number,
  items: StoredItem[],
): { question: Question; phase: Phase; index: number; of: number; position: number } | null {
  const done = sorted(items, 'warmup')
  if (done.length < warmup.length) {
    return { question: warmup[done.length]!, phase: 'warmup', index: done.length + 1, of: warmup.length, position: done.length + 1 }
  }
  const tried = sorted(items, 'try')
  const total = Math.min(tryCount, pool.length)
  if (tried.length >= total) return null
  const question = pickTry(pool, tried)
  if (!question) return null
  return { question, phase: 'try', index: tried.length + 1, of: total, position: warmup.length + tried.length + 1 }
}

/** `easier` or `harder` when the level just changed, else null. Item k carries it when it was chosen after a change. */
export function adaptedOf(results: boolean[]): 'easier' | 'harder' | null {
  if (results.length === 0) return null
  const before = nextDifficulty(START_LEVEL, results.slice(0, -1)).next
  const now = nextDifficulty(START_LEVEL, results).next
  return now < before ? 'easier' : now > before ? 'harder' : null
}

/** What the child is asked to type for one question: it decides the boxes, the line under them and the keyboard. */
export type AnswerShape =
  | { kind: 'choice' }
  /** One number is missing from a fraction in the question ("3/5 = ?/15"): the child types it where it is missing. */
  | { kind: 'missing'; part: MissingPart }
  | { kind: 'fraction' | 'mixed' | 'money' | 'text' }
  /** P148: a number, a whole or a decimal answer may carry a unit, a round and (a whole or a decimal of a senior class) a minus key. */
  | ({ kind: 'number' | 'whole' | 'decimal' } & QuantityExtras)
  /** A point of a senior class, marked by meaning. */
  | { kind: 'point' }
  /** An equation answer. `count` is how many values its key has when the screen was told (P146, one answer: one field); `inequality` when its key is an inequality or an interval, `pair` when it is two letters with a value each (P147): they change the line under the box. */
  | { kind: 'equation'; count?: number; inequality?: true; pair?: true }
  /** An equation with 2 to 4 answers (P146): one box for each, "Answer 1", "Answer 2", sent as "x = a or x = b". */
  | { kind: 'answers'; count: number; letter?: string }
  | { kind: 'expression'; form: Form }
  /** P148: a time (the hours and minutes, and am or pm when the key needs it) and a ratio (a box for each part). */
  | { kind: 'time'; style: TimeStyle; young?: true }
  | { kind: 'ratio'; parts: 2 | 3 }
  /** P149: two big buttons, True and False. */
  | { kind: 'truefalse' }
  /** P149: the reason for a step of a geometry proof, picked from a list, with a box for the value of the step when the question asks for one. */
  | { kind: 'reason'; withValue: boolean }
  /** P150: several values. A row of boxes (a list), the chips of an order, or the empty cells of a table. */
  | { kind: 'list'; count: number; ordered: boolean; plain: boolean; labels?: string[]; round?: number; young?: true }
  | { kind: 'order'; items: string[]; young?: true }
  | { kind: 'table'; table: NonNullable<ListParts['table']>; round?: number; young?: true }
  /** P167: a graph to draw (drag a bar up, or add pictures). `typed` is the shape of the same answer typed instead: one box, or a box for each bar. */
  | { kind: 'graph'; graph: DataGraphSpec; typed: AnswerShape; young?: true }
  /** P168: a sum worked in columns: a box for each digit of the answer, written from the ones, and a small box over a column for a carry. */
  | { kind: 'columns'; columns: ColumnsSpec; young?: true }
  /** P169: a number built with place value blocks on a mat. */
  | { kind: 'blocks'; blocks: BlocksSpec; young?: true }
  /** P170: things dragged (or tapped) into groups. */
  | { kind: 'groups'; groups: GroupsSpec; young?: true }
  /** P171: points placed on a grid by tapping it. `typed` is the same answer typed instead: a box for the x and the y of each point. */
  | { kind: 'plot'; plot: PlotSpec; typed: AnswerShape }
  /** P172: parts of a shape shaded by tapping them. */
  | { kind: 'shade'; shade: ShadeSpec; young?: true }
  /** P173: shapes picked by tapping them. */
  | { kind: 'tap'; tap: TapSpec; young?: true }
  /** P174: a straight line drawn through two tapped points. `typed` is the same answer typed instead: the x and the y of two points. */
  | { kind: 'line'; line: LineSpec; typed: AnswerShape }
  /** P175: a pin dragged along a number line to a mark. `kind` is how the pin is sent (the key's kind); `typed` is the same answer typed instead. */
  | { kind: 'pin'; pin: PinSpec; as: string; typed: AnswerShape }
  /** P177: a clock set by dragging its hands, the answer the time it shows. `typed` is the same answer typed instead: the boxes of a time. */
  | { kind: 'clock'; clock: ClockSpec; typed: AnswerShape }
  /** P178: things matched in pairs by tapping, the answer the partner of each. */
  | { kind: 'match'; match: MatchSpec; young?: true; /** P184: graphs drawn on the left. */ plane?: GraphMatchSpec }
  /** P179: an identity proved line by line, each line its own maths editor. */
  | { kind: 'proof'; proof: ProofSpec }
  /** P180: every solution of a trig equation, a frame for each family: an angle and how often it comes back. */
  | { kind: 'general'; general: GeneralSpec }
  /** P185: a derivative from first principles, its first line given and each line after it its own maths editor. */
  | { kind: 'firstPrinciples'; firstPrinciples: FirstPrinciplesSpec }

/** What a unit, a round and a minus key add to the shape of a number, a whole or a decimal answer (P148). Only what the question has is set. */
export type QuantityExtras = { unit?: string; round?: number; signed?: true }
const quantityExtras = (q: QuantityExtras): QuantityExtras => ({
  ...(q.unit ? { unit: q.unit } : {}),
  ...(q.round !== undefined ? { round: q.round } : {}),
  ...(q.signed ? { signed: true as const } : {}),
})

/** The most boxes the screen gives an equation (P146). An equation with more values than this is typed in one field, with the word or between them. */
export const MAX_ANSWER_BOXES = 4

/** What `answerShape` reads besides the old four fields: the parts the server sent (a whole `Question` fits too: its table has no `plain`, so its boxes are the full keyboard). */
type ShapeParts = {
  list?: ListParts['list']
  items?: string[]
  table?: { columns: string[]; rows: (string | null)[][]; plain?: boolean }
  round?: number
  young?: true
  graph?: DataGraphSpec
  columns?: ColumnsSpec
  blocks?: BlocksSpec
  groups?: GroupsSpec
  plot?: PlotSpec
  shade?: ShadeSpec
  tap?: TapSpec
  line?: LineSpec
  pin?: PinSpec
  clock?: ClockSpec
  match?: MatchSpec
  proof?: ProofSpec
  general?: GeneralSpec
  graphMatch?: GraphMatchSpec
  firstPrinciples?: FirstPrinciplesSpec
}

export function answerShape(
  q: Pick<Question, 'prompt' | 'answerKind' | 'choices' | 'form'> &
    QuantityExtras &
    Pick<QuestionForChild, 'timeStyle' | 'ratioParts' | 'answerShape' | 'answerCount' | 'answerLetter'> &
    ShapeParts & { withValue?: boolean },
): AnswerShape {
  if (q.answerKind === 'truefalse') return { kind: 'truefalse' }
  if (q.answerKind === 'reason') return { kind: 'reason', withValue: q.withValue === true }
  if (q.choices?.length) return { kind: 'choice' }
  // P167: a graph the learner draws: its empty bars are the answer, one value (a whole) or several (a list). Typed instead, it is the shape it has without its graph.
  if (q.graph && blankBars(q.graph).length > 0 && (q.answerKind === 'whole' || q.answerKind === 'list')) {
    const { graph, ...rest } = q
    return { kind: 'graph', graph, typed: answerShape(rest), ...(q.young ? { young: true as const } : {}) }
  }
  // P168: a sum worked in columns, its answer a whole number written digit by digit.
  if (q.columns && q.answerKind === 'whole') return { kind: 'columns', columns: q.columns, ...(q.young ? { young: true as const } : {}) }
  // P169: a number built with blocks, its answer the number the blocks make.
  if (q.blocks && q.answerKind === 'whole') return { kind: 'blocks', blocks: q.blocks, ...(q.young ? { young: true as const } : {}) }
  // P171: points placed on a grid, the answer the x and the y of each. Typed instead, it is the list of numbers it is without its grid.
  if (q.plot && q.answerKind === 'list') {
    const { plot, ...rest } = q
    return { kind: 'plot', plot, typed: answerShape(rest) }
  }
  // P172: parts of a shape shaded, the answer how many. P194: a shape to finish, the answer the squares shaded.
  if (q.shade && (q.answerKind === 'whole' || (q.answerKind === 'list' && q.shade.mirror))) return { kind: 'shade', shade: q.shade, ...(q.young ? { young: true as const } : {}) }
  // P175: a pin on a number line, the answer the number of its mark (as the key's kind). Typed instead, it is the box of that kind.
  if (q.pin && ['fraction', 'mixed', 'decimal', 'whole'].includes(q.answerKind)) {
    const { pin, ...rest } = q
    return { kind: 'pin', pin, as: q.answerKind, typed: answerShape(rest) }
  }
  // P177: a clock set by dragging its hands, the answer the time it shows. Typed instead, it is the boxes of a time.
  if (q.clock && q.answerKind === 'time') {
    const { clock, ...rest } = q
    return { kind: 'clock', clock, typed: answerShape(rest) }
  }
  // P174: a straight line drawn on a grid, the answer two points on it. Typed instead, it is the list of numbers it is without its grid.
  if (q.line && q.answerKind === 'list') {
    const { line, ...rest } = q
    return { kind: 'line', line, typed: answerShape(rest) }
  }
  // P180: every solution of a trig equation, the answer the angle and the period of each family.
  if (q.general && q.answerKind === 'list') return { kind: 'general', general: q.general }
  // P179: an identity proved line by line, the answer its lines.
  if (q.proof && q.answerKind === 'list') return { kind: 'proof', proof: q.proof }
  // P185: a derivative from first principles, the answer its lines after the one Jemma gives.
  if (q.firstPrinciples && q.answerKind === 'list') return { kind: 'firstPrinciples', firstPrinciples: q.firstPrinciples }
  // P184: graphs matched to their equations, the answer the equation of each: a match whose left ones are the graphs.
  if (q.graphMatch && q.answerKind === 'list') return { kind: 'match', match: graphMatchPairs(q.graphMatch), plane: q.graphMatch }
  // P178: things matched in pairs, the answer the partner of each.
  if (q.match && q.answerKind === 'list') return { kind: 'match', match: q.match, ...(q.young ? { young: true as const } : {}) }
  // P173: shapes picked by tapping, the answer which ones.
  if (q.tap && q.answerKind === 'list') return { kind: 'tap', tap: q.tap, ...(q.young ? { young: true as const } : {}) }
  // P170: things sorted into groups, the answer the group of each.
  if (q.groups && q.answerKind === 'list') return { kind: 'groups', groups: q.groups, ...(q.young ? { young: true as const } : {}) }
  // P147: an equation whose key is an inequality or an interval, or two letters with a value each, says so in its line under the box.
  if (q.answerKind === 'equation' && q.answerShape === 'inequality') return { kind: 'equation', inequality: true }
  if (q.answerKind === 'equation' && q.answerShape === 'pair') return { kind: 'equation', pair: true }
  // P150: a list, an order and a table are drawn from the parts the server sent (a question that came without them gets the plain box below).
  const places = { ...(q.round !== undefined ? { round: q.round } : {}), ...(q.young ? { young: true as const } : {}) }
  // A shape with nothing to fill (no box, one chip, no empty cell) could never be answered, so it falls to the plain box rather than leave the learner stuck.
  if (q.answerKind === 'list' && q.list && q.list.count > 0) return { kind: 'list', ...q.list, ...places }
  if (q.answerKind === 'order' && q.items && q.items.length > 1) return { kind: 'order', items: q.items, ...(q.young ? { young: true as const } : {}) }
  if (q.answerKind === 'table' && q.table && q.table.rows.some((row) => row.includes(null))) return { kind: 'table', table: { ...q.table, plain: q.table.plain ?? false }, ...places }
  // A question marked by meaning is never a missing number in a fraction, whatever its prompt holds.
  if (q.answerKind === 'time') return { kind: 'time', style: q.timeStyle ?? 'clock24', ...(q.young ? { young: true as const } : {}) }
  if (q.answerKind === 'ratio') return { kind: 'ratio', parts: q.ratioParts ?? 2 }
  if (q.answerKind === 'expression') return { kind: 'expression', form: q.form ?? 'any' }
  if (q.answerKind === 'equation') {
    const count = q.answerCount
    if (count !== undefined && count >= 2 && count <= MAX_ANSWER_BOXES) return { kind: 'answers', count, ...(q.answerLetter ? { letter: q.answerLetter } : {}) }
    return { kind: 'equation', ...(count !== undefined ? { count } : {}) }
  }
  if (q.answerKind === 'number') return { kind: 'number', ...quantityExtras(q) }
  if (q.answerKind === 'point') return { kind: 'point' }
  const part = missingPart(q.prompt)
  if (part) return { kind: 'missing', part }
  if (q.answerKind === 'whole' || q.answerKind === 'decimal') return { kind: q.answerKind, ...quantityExtras(q) }
  return { kind: q.answerKind === 'choice' || q.answerKind === 'list' || q.answerKind === 'order' || q.answerKind === 'table' ? 'text' : q.answerKind }
}

// One rule for the screen and for paper: the agent's `save_practice_answers` finishes and marks a written answer with the same functions.
export { completeAnswer, fillMissing, finishAnswer, paperQuestions }

/** What the boxes hold. `x` and `y` are the two boxes of a point (a senior class). */
export type AnswerBoxes = { whole: string; top: string; bottom: string; text: string; x?: string; y?: string }

/** A number as the child typed it holds a digit: a minus alone, or a comma alone, is not a number yet. */
const hasDigit = (s: string) => /\d/.test(s)

/**
 * The text sent for what the boxes on screen hold, or '' while a box that is shown is still empty.
 * It is the text `markAnswer` already reads: "top/bottom", "whole top/bottom", "R12,50".
 */
export function answerValue(shape: AnswerShape, boxes: AnswerBoxes): string {
  const [whole, top, bottom] = [boxes.whole.trim(), boxes.top.trim(), boxes.bottom.trim()]
  // "12," is a number the child stopped typing: the comma at the end is not part of it.
  const text =
    shape.kind === 'missing' || shape.kind === 'text' || shape.kind === 'expression' || shape.kind === 'equation' || shape.kind === 'answers'
      ? boxes.text.trim()
      : boxes.text.trim().replace(/[.,]+$/, '')
  switch (shape.kind) {
    case 'missing':
      return text ? fillMissing(shape.part, text) : ''
    case 'fraction':
      return top && bottom ? `${top}/${bottom}` : ''
    case 'mixed':
      return whole && top && bottom ? `${whole} ${top}/${bottom}` : ''
    case 'money':
      return text ? `R${text}` : ''
    case 'whole':
    case 'decimal':
      // A minus key makes a minus alone possible (P148): a number holds a digit.
      return hasDigit(text) ? text : ''
    case 'number':
      // A number answer holds a digit, or pi (the pi key types a whole answer, like 2\u03c0 or \u03c0/2).
      return hasDigit(text) || /\u03c0|\bpi\b/i.test(text) ? text : ''
    case 'point': {
      const [x, y] = [(boxes.x ?? '').trim().replace(/[.,]+$/, ''), (boxes.y ?? '').trim().replace(/[.,]+$/, '')]
      return hasDigit(x) && hasDigit(y) ? `(${x}; ${y})` : ''
    }
    // P167: the bars drawn (or the numbers typed instead), sent as the values of the empty bars, or nothing while one is still empty.
    case 'graph':
      return hasDigit(text) ? text : ''
    // P172: how many parts are shaded, or nothing while none is. P194: a shape to finish sends the squares shaded.
    case 'shade':
      return (shape.shade.mirror ? /^\d+(; \d+)*$/ : /^\d+$/).test(text) ? text : ''
    // P168: the digits of the answer boxes, from the first one written to the ones, or nothing until they are written.
    case 'columns':
    // P169: the number the blocks on the mat make, or nothing while the mat is empty.
    case 'blocks':
      return /^\d+$/.test(text) ? text : ''
    // P170: the group of each thing, or nothing while one is not in a group.
    case 'groups':
    // P173: the numbers of the picked shapes, or nothing while fewer than 2 are picked.
    case 'tap':
    // P178: the partner of each left one, or nothing while one is not joined.
    case 'match':
      return /^\d+(; \d+)*$/.test(text) ? text : ''
    // P171: the x and the y of each point placed (or typed), or nothing while one is missing.
    case 'plot':
    // P174: two points of the line drawn (or typed), or nothing until there are two.
    case 'line':
    // P175: the number of the mark the pin is on (or what was typed instead).
    case 'pin':
    // P177: the time the clock shows (or what was typed instead), or nothing until a hand is moved.
    case 'clock':
      return hasDigit(text) ? text : ''
    // P179: the lines of a proof, or nothing until 3 hold something. P185: and the lines of first principles.
    case 'proof':
    case 'firstPrinciples':
      return text.trim()
    // P180: the angle and the period of each family, or nothing while a frame is half filled.
    case 'general':
      return hasDigit(text) ? text : ''
    default:
      return text
  }
}

/** The text of an answer: a choice letter becomes the choice itself (a picture with no words is "Picture B"), and true or false is written True or False. */
export function answerText(q: Question, value: string): string {
  if (q.answerKind === 'truefalse') {
    const side = readTrueFalse(value)
    return side === null ? value : trueFalseLabel(side)
  }
  const letter = /^\(?([a-e])\)?\.?$/i.exec(value.trim())
  const at = letter && q.answerKind !== 'reason' ? CHOICE_LETTERS.indexOf(letter[1]!.toUpperCase() as (typeof CHOICE_LETTERS)[number]) : -1
  if (q.choices && at >= 0 && q.choices[at] !== undefined) return choiceLabel(q.choices[at]!, at)
  return value
}

/**
 * The worked steps a question carries, only the lines that are words. Read defensively: the field may be missing, empty or not a list (older lessons,
 * primary classes), and then there are none.
 */
function stepsOf(q: Question): string[] {
  const raw = (q as { steps?: unknown }).steps
  return Array.isArray(raw) ? raw.filter((s): s is string => typeof s === 'string' && s.trim() !== '') : []
}

/** Every try question in order, each marked right or missed: what the results screen draws one card for. */
export function reviewOf(items: StoredItem[]): MissedQuestion[] {
  return sorted(items, 'try')
    .map((item, i) => ({ item, n: i + 1 }))
    .map(({ item, n }) => ({
      n,
      correct: item.correct,
      prompt: item.question.prompt,
      render: item.question.render,
      ...(item.question.terms ? { terms: item.question.terms } : {}),
      ...(item.question.diagram ? { diagram: item.question.diagram } : {}),
      ...(item.question.clockFace ? { clockFace: item.question.clockFace } : {}),
      // P187: a point is shown in the notation of the space.
      ...(item.question.answerKind === 'point' ? { notated: true as const } : {}),
      // An answer saved before the missing number was put back into its fraction is shown completed too.
      wrote: item.unread ? '' : showWithUnit(answerText(item.question, finishAnswer(item.question, item.answer).stored), item.question),
      ...(item.unread ? { unread: true } : {}),
      right: showWithUnit(answerText(item.question, rightText(item.question)), item.question),
      why: item.question.why,
      rightWay: item.question.rightWay,
      ...(stepsOf(item.question).length > 0 ? { steps: stepsOf(item.question) } : {}),
      ...cellsOf(item),
      ...graphOf(item),
      ...(item.question.columns ? { columns: item.question.columns, columnsPlaces: columnsPlaces(item.question.columns, item.unread ? '' : item.answer) } : {}),
      ...(item.question.blocks ? { blocks: item.question.blocks } : {}),
      ...groupsReview(item),
      ...plotReview(item),
      ...(item.question.shade ? { shade: item.question.shade } : {}),
      ...tapReview(item),
      ...lineReview(item),
      ...(item.question.pin
        ? {
            pin: item.question.pin,
            pinRight: pinMarkOf(item.question.pin, item.question.answer, readNumber),
            pinWrote: item.unread ? null : pinMarkOf(item.question.pin, item.answer, readNumber),
          }
        : {}),
      ...clockReview(item),
      ...matchReview(item),
      ...proofReview(item),
      ...generalReview(item),
      ...firstPrinciplesReview(item),
    }))
}

/** P185: why a line does not follow, in the learner's words, under it in the results; null when the line it should have been says enough. */
export function firstPrinciplesNote(why: FirstPrinciplesWhy | null, name = 'f'): string | null {
  switch (why) {
    case 'start':
      return `Start with ${name}(x + h) \u2212 ${name}(x), all over h.`
    case 'soon':
      return 'h cannot be 0 yet. Cancel the h first.'
    case 'back':
      return 'Once h is gone, it stays gone.'
    case 'letter':
      return 'Use only x and h.'
    default:
      return null
  }
}

/**
 * P185: the learner's derivative from first principles, checked line by line as it was marked: the first line that does not follow (or cannot be read), with
 * why and the line of the key in its place, said as "Line 2" and that line. Lines that stop before the limit is taken, or end on a line that can be simpler,
 * say so, and right lines say how many there were.
 */
function firstPrinciplesReview(item: StoredItem): Partial<MissedQuestion> {
  const spec = item.question.firstPrinciples
  if (!spec) return {}
  const name = functionName(spec)
  const derivative = derivativeOf(spec, item.question.answer)
  const c = checkFirstPrinciples(spec, item.unread ? '' : item.answer, workedLineOf, derivative)
  const key = firstPrinciplesLines(item.question.answer, name)
  const wrong = c.wrong ?? c.unread
  const rightLine = wrong !== null && key.length > 0 ? key[Math.min(wrong, key.length - 1)]! : null
  const last = c.lines.length - 1
  const wrote = c.ok
    ? `${c.lines.length} lines, from the limit to the derivative`
    : wrong !== null
      ? `Line ${wrong + 1}`
      : last < 0
        ? 'No lines after the first one'
        : !c.reached && c.under[last]
          ? 'It stops before the limit is taken'
          : !c.reached
            ? 'The last line can be simpler'
            : `${c.lines.length} ${c.lines.length === 1 ? 'line' : 'lines'}`
  const right = c.ok ? wrote : wrong !== null ? (rightLine ?? derivative ?? '') : !c.reached ? (derivative ?? '') : 'At least 3 different lines'
  return {
    firstPrinciples: {
      spec,
      lines: c.lines,
      under: c.under,
      wrong,
      why: c.wrong !== null ? c.why : null,
      rightLine,
      rightUnder: rightLine !== null && holdsH(rightLine, workedLineOf),
    },
    wrote: item.unread ? '' : wrote,
    right,
    cells: undefined,
    table: undefined,
    ordered: undefined,
  }
}

/**
 * P180: every solution, said as families are said ("θ = 30° + k · 360° or θ = 150° + k · 360°"); what was typed stays as typed when it is not pairs of numbers.
 * P198: in radians when the frame is ("x = π/6 + 2kπ or x = 5π/6 + 2kπ").
 */
function generalReview(item: StoredItem): Partial<MissedQuestion> {
  const g = item.question.general
  if (!g) return {}
  const letter = generalLetter(g)
  const radians = g.radians === true
  const read = radians ? inDegreesFrom(readNumber) : readNumber
  const right = familiesOf(item.question.answer, read)
  const wrote = item.unread ? null : familiesOf(item.answer, read)
  return {
    ...(right ? { right: generalText(right, letter, radians) } : {}),
    ...(wrote ? { wrote: generalText(wrote, letter, radians) } : {}),
    notated: true,
    cells: undefined,
    table: undefined,
    ordered: undefined,
  }
}

/**
 * P179: the learner's proof, checked line by line as it was marked: the first line that does not follow (or cannot be read) and the line of the key in its place,
 * said as "Line 2" and that line. A proof that stops before the right side says so, and a right one says how many lines it took.
 */
function proofReview(item: StoredItem): Partial<MissedQuestion> {
  const p = item.question.proof
  if (!p) return {}
  const c = checkProof(p, item.unread ? '' : item.answer, sameExpression)
  const key = proofLines(item.question.answer)
  const wrong = c.wrong ?? c.unread
  const rightLine = wrong !== null && key.length > 0 ? key[Math.min(wrong, key.length - 1)]! : null
  const wrote = c.ok
    ? `${c.lines.length} lines, from the left side to the right side`
    : wrong !== null
      ? `Line ${wrong + 1}`
      : !c.reached
        ? 'It stops before the right side'
        : `${c.lines.length} ${c.lines.length === 1 ? 'line' : 'lines'}`
  const right = c.ok ? wrote : wrong !== null ? rightLine! : !c.reached ? p.right : 'At least 3 different lines'
  return {
    proof: p,
    proofLines: c.lines,
    proofWrong: wrong,
    proofRight: rightLine,
    wrote: item.unread ? '' : wrote,
    right,
    cells: undefined,
    table: undefined,
    ordered: undefined,
  }
}

/** P184: graphs and their equations as things to match: "Graph 1" and so on on the left, the equations as they are shown on the right. */
export const graphMatchPairs = (g: GraphMatchSpec): MatchSpec => ({ left: g.graphs.map((_, i) => `Graph ${i + 1}`), right: g.equations.map(prettyEquation) })

/** P178: the pairs the learner joined and the right ones, said in words ("7 with seven, 12 with twelve and 20 with twenty"), or "All 3 pairs" when right. */
function matchReview(item: StoredItem): Partial<MissedQuestion> {
  // P184: graphs and equations are said and drawn as a match too.
  const plane = item.question.graphMatch
  const m = item.question.match ?? (plane ? graphMatchPairs(plane) : undefined)
  if (!m) return {}
  const right = ((plane ? graphMatchOf(item.question.answer, plane) : matchOf(item.question.answer, m)) ?? []).map((v) => v - 1)
  const values = item.unread ? [] : splitValues(item.answer).map((t) => (/^\d+$/.test(t) && Number(t) >= 1 && Number(t) <= m.right.length ? Number(t) - 1 : null))
  const wrote = m.left.map((_, i) => values[i] ?? null)
  const said = (xs: (number | null)[]) => matchText(m, xs.map((x) => (x === null ? null : x + 1)))
  const all = wrote.every((w, i) => w === right[i])
  return {
    match: m,
    ...(plane ? { matchPlane: plane } : {}),
    matchRight: right,
    matchWrote: wrote,
    wrote: item.unread ? '' : all ? `All ${m.left.length} pairs` : said(wrote),
    right: said(right),
    cells: undefined,
    table: undefined,
    ordered: undefined,
  }
}

/** P177: the clock the learner set and the right one, said as a time is said ("half past 4"); what the learner typed stays as typed when it is not a time. */
function clockReview(item: StoredItem): Partial<MissedQuestion> {
  const c = item.question.clock
  if (!c) return {}
  const right = clockOf(item.question.answer)
  const wrote = item.unread ? null : clockOf(item.answer)
  return {
    clock: c,
    clockRight: right,
    clockWrote: wrote,
    ...(right ? { right: clockWords(right) } : {}),
    ...(wrote ? { wrote: clockWords(wrote) } : {}),
  }
}

/**
 * P170: the groups of a question to sort, with the group the learner put each thing in and its right group. What was written and the right answer are said in
 * words ("Odd: 7 and 15. Even: 12, 20 and 4.") in place of the group numbers the answer is kept as, and there are no cells of a list.
 */
function groupsReview(item: StoredItem): Partial<MissedQuestion> {
  const g = item.question.groups
  if (!g) return {}
  const right = groupsOf(item.question.answer, g) ?? []
  const typed = item.unread ? [] : splitValues(item.answer)
  const wrote = g.items.map((_, i) => (/^\d+$/.test(typed[i] ?? '') ? Number(typed[i]) : null))
  return {
    groups: g,
    groupsRight: right,
    groupsWrote: wrote,
    wrote: item.unread ? '' : groupsText(g, wrote),
    right: groupsText(g, right),
    cells: undefined,
    table: undefined,
    ordered: undefined,
  }
}

/** P171: the points of a grid question, as the learner placed them and as they go, and said in words ("A' (4; 1), B' (1; 1)") with no cells of a list. */
function plotReview(item: StoredItem): Partial<MissedQuestion> {
  const p = item.question.plot
  if (!p) return {}
  // P198: on a grid marked in π an x may be written with π.
  const read = plotReader(p, readNumber)
  const right = plotPoints(item.question.answer, read) ?? []
  const values = item.unread ? [] : splitValues(item.answer).map((t) => read(t))
  const wrote = p.place.map((_, i) => {
    const [x, y] = [values[2 * i], values[2 * i + 1]]
    return x === undefined || y === undefined || x === null || y === null ? null : { x, y }
  })
  const words = (points: ({ x: number; y: number } | null)[]) =>
    p.place.map((name, i) => `${name.trim()} ${points[i] ? `(${points[i]!.x}; ${points[i]!.y})` : '(not placed)'}`).join(', ')
  if (p.curve) {
    // P176: a sketch is said by where its graph turns ("turns at (0 ; −4)"), P181: or by its asymptotes ("has asymptotes x = 0 and y = 1"); points that make no
    // curve are said as they are.
    const kind = p.curve
    const turns = (pts: ({ x: number; y: number } | null)[]) => {
      const placed = pts.filter((q): q is { x: number; y: number } => q !== null)
      const f = placed.length === p.place.length ? curveThrough(kind, placed) : null
      // P198: a grid marked in π says its points in π.
      if (f) return curveWords(f, p.radians === true)
      const list = placed.map((q) => sketchName(q, kind === 'trig', p.radians === true))
      return list.length === 0 ? '(no points)' : list.length === 1 ? list[0]! : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`
    }
    return { plot: p, plotRight: right, plotWrote: wrote, wrote: item.unread ? '' : turns(wrote), right: turns(right), notated: true, cells: undefined, table: undefined, ordered: undefined }
  }
  return { plot: p, plotRight: right, plotWrote: wrote, wrote: item.unread ? '' : words(wrote), right: words(right), notated: true, cells: undefined, table: undefined, ordered: undefined }
}

/** P173: the shapes of a question to tap, the ones picked and the right ones; what was written and the right answer are counts ("3 shapes"), with no cells. */
function tapReview(item: StoredItem): Partial<MissedQuestion> {
  const t = item.question.tap
  if (!t) return {}
  const right = tapPicks(item.question.answer, t) ?? []
  const wrote = item.unread ? [] : (tapPicks(item.answer, t) ?? [])
  const count = (n: number) => `${n} ${n === 1 ? 'shape' : 'shapes'}`
  return { tap: t, tapRight: right, tapWrote: wrote, wrote: item.unread ? '' : count(wrote.length), right: count(right.length), cells: undefined, table: undefined, ordered: undefined }
}

/** P174: the line of a question to draw, as two points of the learner's line and of the right one, said in words ("(0; 1) and (1; 3)") with no cells. */
function lineReview(item: StoredItem): Partial<MissedQuestion> {
  const g = item.question.line
  if (!g) return {}
  const right = linePoints(item.question.answer, readNumber)
  const wrote = item.unread ? null : linePoints(item.answer, readNumber)
  const words = (p: ReturnType<typeof linePoints>) => (p ? `(${p[0].x}; ${p[0].y}) and (${p[1].x}; ${p[1].y})` : '')
  return { line: g, lineRight: right, lineWrote: wrote, wrote: item.unread ? '' : words(wrote), right: words(right), notated: true, cells: undefined, table: undefined, ordered: undefined }
}

/** P167: the graph of a question to draw, with what the learner drew in each empty bar and the right values, for the results to draw side by side. */
function graphOf(item: StoredItem): Partial<Pick<MissedQuestion, 'graph' | 'graphWrote' | 'graphRight'>> {
  const g = item.question.graph
  if (!g) return {}
  const right = graphValues(item.question.answer, readNumber) ?? []
  const wrote = item.unread ? [] : splitValues(item.answer).map((t) => readNumber(t))
  return { graph: g, graphRight: right, graphWrote: blankBars(g).map((_, i) => wrote[i] ?? null) }
}

/** P150: for a list, an order or a table, each place of the answer marked right or wrong (and the table to draw them in). Nothing for any other question. */
function cellsOf(item: StoredItem): Partial<Pick<MissedQuestion, 'cells' | 'table' | 'ordered' | 'right'>> {
  const q = item.question
  if (!isListKind(q.answerKind) || item.unread) return {}
  const parts = listAnswerParts(q)
  return {
    // The right answer as the question asks for it (rounded, when it says "correct to 1 decimal place").
    right: rightValues(q, readNumber).join('; '),
    cells: resultCells(q, item.answer, readNumber),
    ordered: q.answerKind !== 'list' || parts.list?.ordered === true,
    ...(parts.table ? { table: parts.table } : {}),
  }
}

/** P148: the key of a number or a decimal question that asks for a rounded answer, shown rounded as the question asks ("3.14" for a key of 3.14159 to 2 places). Any other key as it is. */
const rightText = (q: Question): string =>
  q.round !== undefined && (q.answerKind === 'number' || q.answerKind === 'decimal') && /^-?\d[\d ]*(?:[.,]\d+)?$/.test(q.answer.trim()) ? rightValues(q, readNumber).join('; ') : q.answer

/** The try questions that were missed, numbered as in `reviewOf`. */
export function missedOf(items: StoredItem[]): MissedQuestion[] {
  return reviewOf(items)
    .filter((q) => !q.correct)
    .map(({ correct: _correct, ...q }) => q)
}

/**
 * The two lines at the top of the results: how many were right, then one kind line by the score. No ranking against anyone.
 * Every one right is praised, three fifths or more is "good work" with the number left to fix, anything less is "let's go through them together".
 */
export function scoreLines(right: number, total: number): { score: string; cheer: string } {
  const score = `You got ${right} of ${total} right.`
  if (right >= total) return { score, cheer: 'Every one right. Well done.' }
  if (right * 5 >= total * 3) {
    const left = total - right
    return { score, cheer: `Good work. Look at ${left === 1 ? 'the one' : `the ${left}`} to fix below.` }
  }
  return { score, cheer: "Let's go through them together." }
}

export type StageMove = { from: Stage; to: Stage }

/** The move `update_learner_profile` will make for this session, shown to the child straight away. */
export function stageAfter(input: { stage: Stage; right: number; firstPractisedAt: Date | null; now: Date }): StageMove {
  return { from: input.stage, to: nextStage({ ...input, fixAfterDays: FIX_AFTER_DAYS }) }
}
