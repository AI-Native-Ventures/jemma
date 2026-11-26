import { z } from 'zod'
import { DiagramSpecSchema, SeniorDiagramSpecSchema } from './diagram'

// Same union as logic/types.ts Format; the coordinator unifies them.
export const FormatSchema = z.enum(['reading', 'diagram', 'audio'])
export type Format = z.infer<typeof FormatSchema>

const Difficulty = z.union([z.literal(1), z.literal(2), z.literal(3)])

/**
 * Two shapes of a lesson, and one of them is the one the demo class was recorded with.
 *
 * `PrimaryLessonSchema` is the lesson exactly as it was (six answer kinds). It is the schema the lesson writer hands to the model for every
 * class that is not a senior one, and the JSON text of it is part of the hash that finds a recorded answer: not one character of it may change
 * (a test pins its sha256). `SeniorLessonSchema` is the same lesson with four more answer kinds (`number`, `expression`, `equation`, `point`)
 * that code marks by meaning, one optional question field, `form`, and (P127) a required `steps` on every question: 2 to 6 short lines of maths from
 * the question to the answer. It is handed to the model for a senior class only (Mathematics, Grades 7 to 12).
 *
 * Everything that WRITES a lesson (the model's output once it is read, the `save_lesson` input, the seed) uses the wide one, `LessonSchema`, which is the
 * senior shape with `steps` optional: a lesson written under the primary shape is a lesson of the wide shape too, so no stored or recorded lesson stops
 * parsing, and a model that leaves `steps` out of one question never refuses a lesson (the question is saved without them).
 * Everything that READS a saved lesson (the learner's screens, the home, the parent's page) uses `StoredLessonSchema`, the same shape with the
 * counts a save can leave (see below).
 *
 * P149 widened the senior shape again: a `choices` entry may be a picture (`ChoiceSchema`), and `truefalse` and `reason` are two more answer kinds that a
 * learner answers by tapping (`PICK_ANSWER_KINDS`). The primary shape has none of this.
 */

export const PRIMARY_ANSWER_KINDS = ['fraction', 'mixed', 'decimal', 'whole', 'money', 'choice'] as const
/** The kinds of a senior class that code marks by meaning (logic/meaning.ts): four from P86, and `time` and `ratio` (P148). */
export const MEANING_ANSWER_KINDS = ['number', 'expression', 'equation', 'point', 'time', 'ratio'] as const
/** The two kinds a senior learner answers by tapping (P149): `truefalse` (the key is `true` or `false`) and `reason` (a reason for a step of a geometry proof, from a fixed list). */
export const PICK_ANSWER_KINDS = ['truefalse', 'reason'] as const
/** P150: the three kinds that are several values (logic/answers/lists.ts): a list, an order the learner puts items in, and a table with empty cells. */
export const LIST_ANSWER_KINDS = ['list', 'order', 'table'] as const
export const ANSWER_KINDS = [...PRIMARY_ANSWER_KINDS, ...MEANING_ANSWER_KINDS, ...PICK_ANSWER_KINDS, ...LIST_ANSWER_KINDS] as const
export type AnswerKind = (typeof ANSWER_KINDS)[number]
export type MeaningKind = (typeof MEANING_ANSWER_KINDS)[number]
export type PickKind = (typeof PICK_ANSWER_KINDS)[number]
export type ListKind = (typeof LIST_ANSWER_KINDS)[number]

/**
 * One option of a senior `choice` question (P149): plain text (as it always was), or an object with `text`, a `diagram`, or both, so the learner can pick
 * the right graph or shape ("Which graph is y = x^2 - 4?"). A picture never holds the answer: the key is the letter of the option, A to E.
 */
export const ChoiceSchema = z.union([z.string(), z.object({ text: z.string().optional(), diagram: SeniorDiagramSpecSchema.optional() })])
export type Choice = z.infer<typeof ChoiceSchema>

/** The form an `expression` answer must be in: `factorised` (a product of brackets), `expanded` (no brackets, like terms gathered) or `any` (the same value is enough). */
export const FORMS = ['any', 'factorised', 'expanded'] as const
export const FormSchema = z.enum(FORMS)
export type Form = z.infer<typeof FormSchema>

/** A small table of a question (P150): `null` is a cell the learner fills. The key of the question holds the filled values, left to right and top to bottom. */
export const TableSchema = z.object({ columns: z.array(z.string()), rows: z.array(z.array(z.string().nullable())) })
export type TableSpec = z.infer<typeof TableSchema>

export const PrimaryQuestionSchema = z.object({
  prompt: z.string(),
  render: z.enum(['text', 'fraction_sum']),
  terms: z.array(z.string()).optional(),
  answer: z.string(),
  answerKind: z.enum(['fraction', 'mixed', 'decimal', 'whole', 'money', 'choice']),
  choices: z.array(z.string()).optional(),
  difficulty: Difficulty,
  why: z.string(),
  rightWay: z.string(),
})

/**
 * P167: a graph the learner draws (Grades 1 to 6). A bar graph (`bars`: a scale from 0 to `yMax` with a line every `step`, 1 when left out) or a picture graph
 * (`pictures`: each picture stands for `per`, 1 when left out). Each entry of `bars` is a bar, or a row of pictures; one whose `value` is `null` is one the
 * learner draws. The key of the question holds the values of those, in order: one value is a `whole` answer, more are an ordered `list`. A graph holds no
 * answer: the bars the learner draws have no value in it.
 */
export const DataGraphSchema = z.object({
  kind: z.enum(['bars', 'pictures']),
  /** What is counted ("children", "cars"), written over the scale or after the key of the pictures. */
  counts: z.string().optional(),
  bars: z.array(z.object({ label: z.string(), value: z.number().nullable() })),
  yMax: z.number().optional(),
  step: z.number().optional(),
  per: z.number().optional(),
})
export type DataGraphSpec = z.infer<typeof DataGraphSchema>

/**
 * P168: a sum the learner works in columns (Grades 2 to 6): two or three whole numbers added (`+`), or the second taken from the first (`-`). The numbers are
 * written as digits only (`347`). The learner writes the answer digit by digit, from the ones; the key is the answer as a `whole` number (`632`).
 */
export const ColumnsSchema = z.object({ op: z.enum(['+', '-']), numbers: z.array(z.string()) })
export type ColumnsSpec = z.infer<typeof ColumnsSchema>

/**
 * P169: a number the learner builds with place value blocks (Grades 1 to 3): flats of a hundred, rods of ten and single ones. `places` are the blocks the
 * learner may use. At most 9 of each go on the mat, so a number has one way to be built; the key is the number as a `whole` answer.
 */
export const BlocksSchema = z.object({ places: z.array(z.enum(['hundreds', 'tens', 'ones'])) })
export type BlocksSpec = z.infer<typeof BlocksSchema>

/**
 * P170: things the learner sorts into groups (Grades 1 to 6): 2 to 4 groups (`names`, like `Odd` and `Even`) and 3 to 8 `items` (numbers or short words),
 * in a mixed-up order. The key is an ordered `list` of the group of each item, as a number from 1 (the first group), in the order of the items.
 */
export const GroupsSchema = z.object({ names: z.array(z.string()), items: z.array(z.string()) })
export type GroupsSpec = z.infer<typeof GroupsSchema>

/**
 * P172: a shape the learner shades parts of by tapping them (Grades 1 to 6): a circle or a bar cut into `parts` equal parts, or a grid of `rows` by `cols`
 * squares (a hundred square is 10 by 10). The key is how many parts to shade, as a `whole` number: which parts are shaded does not matter.
 */
export const ShadeSchema = z.object({ shape: z.enum(['circle', 'bar', 'grid']), parts: z.number().optional(), rows: z.number().optional(), cols: z.number().optional() })
export type ShadeSpec = z.infer<typeof ShadeSchema>

/**
 * P175: a number line the learner puts a pin on by dragging it (Grades 2 to 6): from `min` to `max` (whole numbers), with a mark at every 1/`parts` (quarters
 * when `parts` is 4) or, without `parts`, every `step` (a whole number, 1 when left out). Only the two ends are numbered. The key is the number the pin goes on,
 * a `fraction`, `mixed`, `decimal` or `whole` answer.
 */
export const PinSchema = z.object({ min: z.number(), max: z.number(), parts: z.number().optional(), step: z.number().optional() })
export type PinSpec = z.infer<typeof PinSchema>

/**
 * P177: a clock the learner sets by dragging its hands (Grades 1 to 6): it starts at 12 o'clock, and the long hand stops every `step` minutes (1, 5, 15 or 30;
 * 5 when left out). The short hand stops on the hours and sits between them by itself, as far as the minutes have gone. The key is the time on the clock face, a
 * `time` from 1:00 to 12:59 with no am or pm (`4:30`).
 */
export const ClockSchema = z.object({ step: z.number().optional() })
export type ClockSpec = z.infer<typeof ClockSchema>

/**
 * P178: things the learner matches in pairs by tapping one on the left, then the one it goes with on the right (Grades 1 to 6): `left` and `right`, 2 to 5
 * short things each (numbers, words, times), the right ones in a mixed-up order. With `pictures`, the left ones are shapes (one of `TAP_SHAPES` each), drawn
 * and not named. The key is an ordered `list` of the place in `right` of the partner of each left one, from 1 (`3; 1; 2`).
 */
export const MatchSchema = z.object({ left: z.array(z.string()), right: z.array(z.string()), pictures: z.boolean().optional() })
export type MatchSpec = z.infer<typeof MatchSchema>

/** P173: the shapes a picture to tap may hold. */
export const TAP_SHAPES = ['triangle', 'right_triangle', 'square', 'rectangle', 'circle', 'oval', 'pentagon', 'hexagon', 'rhombus', 'kite', 'trapezium'] as const
/**
 * P173: shapes the learner taps to pick (Grades 1 to 7): 4 to 9 `shapes`, each one of `TAP_SHAPES`, turned by `turn` degrees (0, 90, 180 or 270). The key is
 * the numbers of the shapes to pick, from 1, in any order: an unordered `list` (`1; 3; 6; 8`).
 */
export const TapSchema = z.object({ shapes: z.array(z.object({ shape: z.enum(TAP_SHAPES), turn: z.number().optional() })) })
export type TapSpec = z.infer<typeof TapSchema>

/**
 * P171: points the learner places on a grid by tapping it (Grades 7 to 10): where a shape lands after a reflection or a translation, or points from a table.
 * The grid goes from `xMin` to `xMax` and `yMin` to `yMax` in whole steps; `given` are points already on it (`shape` joins them, as the corners of a shape);
 * `place` are the names of the points to place, in order. The key is an ordered `list` of the x and the y of each of them (`4; 1; 1; 1; 1; 4`).
 */
export const PlotSchema = z.object({
  xMin: z.number(),
  xMax: z.number(),
  yMin: z.number(),
  yMax: z.number(),
  given: z.array(z.object({ x: z.number(), y: z.number(), label: z.string() })).optional(),
  shape: z.boolean().optional(),
  place: z.array(z.string()),
  /**
   * P176: a sketch of the graph in the question: the points to place are its key points (where it cuts the x-axis, its turning point) and Jemma joins them into
   * the curve. An answer is right when its points make the same graph, whichever points of it they are.
   */
  curve: z.enum(['parabola']).optional(),
})
export type PlotSpec = z.infer<typeof PlotSchema>

/**
 * P174: a straight line the learner draws on a grid by tapping two points on it (Grades 7 to 9): the graph of y = 2x - 1, a line of symmetry. The grid goes from
 * `xMin` to `xMax` and `yMin` to `yMax` in whole steps. The key is an ordered `list` of two points on the line (`0; -1; 2; 3`); any two points on the same line
 * are right.
 */
export const LineSchema = z.object({ xMin: z.number(), xMax: z.number(), yMin: z.number(), yMax: z.number() })

/**
 * P179: an identity the learner proves line by line (Grades 10 to 12): `left` and `right` are its two sides as maths (`sin^2 x/(1 - cos x)` and `1 + cos x`).
 * The learner starts from the left side and changes it one line at a time into the right side, and each line must equal the one before it. The key is a proof
 * of the same kind: 3 to 6 lines, maths only, as an ordered `list`.
 */
export const ProofSchema = z.object({ left: z.string(), right: z.string() })
export type ProofSpec = z.infer<typeof ProofSchema>

/**
 * P180: every solution of a trig equation, typed as families (Grades 11 and 12): each an angle in degrees and how often it comes back (θ = 30° + k · 360°).
 * `letter` is the letter of the equation (θ when left out). The key is an ordered `list` of the angle and the period of each family, in degrees
 * (`30; 360; 150; 360`); families that give the same angles are right.
 */
export const GeneralSchema = z.object({ letter: z.string().optional() })
export type GeneralSpec = z.infer<typeof GeneralSchema>
export type LineSpec = z.infer<typeof LineSchema>

/** The most and the fewest lines of the worked steps of a question (P127). */
export const MIN_STEPS = 2
export const MAX_STEPS = 6

/**
 * A senior question. `steps` is a line of maths for each move from the question to the answer (`["x/2 + 6 = 10", "x/2 = 4", "x = 8"]`), written before the
 * answer so the model works the maths first. Two questions only differ in `steps`: the one the senior model is handed has it required (2 to 6 lines), the
 * wide one every reader and writer uses has it optional (see `cleanSteps` for what is kept when a lesson is saved).
 */
const seniorQuestion = <Steps extends z.ZodType>(steps: Steps) =>
  z.object({
    prompt: z.string(),
    render: z.enum(['text', 'fraction_sum']),
    terms: z.array(z.string()).optional(),
    steps,
    answer: z.string(),
    answerKind: z.enum(ANSWER_KINDS),
    choices: z.array(ChoiceSchema).optional(),
    form: FormSchema.optional(),
    /** The unit of the answer ("cm²", "ml", "km/h", "°C", "kg"), shown after the box. The `answer` is the number alone. Senior classes only (P148). */
    unit: z.string().optional(),
    /** A `list` question: true when the order of the values matters (the next three terms), false or left out when it does not (all the factors of 24). Labels make it true. */
    ordered: z.boolean().optional(),
    /** A `list` question: a short label over each box (`["min", "Q1", "median", "Q3", "max"]`), one for each value of the answer. */
    labels: z.array(z.string()).optional(),
    /** How many decimal places the question asks the answer to be rounded to ("correct to 1 decimal place" is 1): a value that rounds to the key's there is right. 0 to 6, checked by the save gate. */
    round: z.number().int().optional(),
    /** A `table` question: the table, with `null` in each cell the learner fills. */
    table: TableSchema.optional(),
    /** A picture the question needs (a graph to read, a triangle with an angle to find). It never holds the answer. Senior classes only. */
    diagram: SeniorDiagramSpecSchema.optional(),
    /** P171: points the learner places on a grid by tapping it. Senior classes only. */
    plot: PlotSchema.optional(),
    /** P174: a straight line the learner draws on a grid through two points. Senior classes only. */
    line: LineSchema.optional(),
    /** P179: an identity the learner proves line by line. Senior classes only. */
    proof: ProofSchema.optional(),
    /** P180: every solution of a trig equation, typed as families. Senior classes only. */
    general: GeneralSchema.optional(),
    difficulty: Difficulty,
    why: z.string(),
    rightWay: z.string(),
  })

/** The question the senior model is handed: `steps` required, 2 to 6 lines. */
export const SeniorQuestionSchema = seniorQuestion(z.array(z.string()).min(MIN_STEPS).max(MAX_STEPS))

/**
 * The question as every reader sees it: the wide, senior shape, with `steps` optional (an old lesson has none, and a save may leave them out). P167: and a
 * `graph` to draw, (P168) a sum to work in `columns`, (P169) a number to build with `blocks` and (P170) things to sort into `groups`, which only a Grade 1 to 6
 * lesson is asked for (the senior model is handed `SeniorQuestionSchema`, which has none of them).
 */
export const QuestionSchema = seniorQuestion(z.array(z.string()).optional()).extend({
  graph: DataGraphSchema.optional(),
  columns: ColumnsSchema.optional(),
  blocks: BlocksSchema.optional(),
  groups: GroupsSchema.optional(),
  shade: ShadeSchema.optional(),
  tap: TapSchema.optional(),
  pin: PinSchema.optional(),
  clock: ClockSchema.optional(),
  match: MatchSchema.optional(),
})
export type Question = z.infer<typeof QuestionSchema>
export type PrimaryQuestion = z.infer<typeof PrimaryQuestionSchema>

/** One lesson around one kind of question and one set of pictures. The fields, their order and the two rules are the same for both shapes. */
export const lessonAround = <Q extends z.ZodType<{ difficulty: 1 | 2 | 3 }>, D extends z.ZodType>(question: Q, picture: D) =>
  z
    .object({
      format: FormatSchema,
      title: z.string(),
      minutes: z.number(),
      cards: z
        .array(z.object({ heading: z.string(), body: z.string(), diagram: picture.optional() }))
        .optional(),
      diagram: z
        .object({
          title: z.string(),
          caption: z.string(),
          steps: z.array(z.object({ caption: z.string(), diagram: picture })),
          contrast: z.object({ caption: z.string(), diagram: picture }).optional(),
        })
        .optional(),
      audio: z.object({ script: z.string() }).optional(),
      warmup: z.array(question),
      questions: z.array(question),
    })
    .superRefine((lesson, ctx) => {
      if (lesson.warmup.length !== 0 && lesson.warmup.length !== 2) {
        ctx.addIssue({ code: 'custom', path: ['warmup'], message: 'warmup must have exactly 2 questions, or 0 when there are no fixed gaps' })
      }
      const counts = { 1: 0, 2: 0, 3: 0 }
      for (const q of lesson.questions) counts[q.difficulty]++
      if (lesson.questions.length !== 15 || counts[1] !== 5 || counts[2] !== 5 || counts[3] !== 5) {
        ctx.addIssue({ code: 'custom', path: ['questions'], message: 'questions must be 15, 5 per difficulty' })
      }
    })

export const PrimaryLessonSchema = lessonAround(PrimaryQuestionSchema, DiagramSpecSchema)
export type PrimaryLesson = z.infer<typeof PrimaryLessonSchema>

/** The lesson the senior model is handed (P127: `steps` required on every question, the warm-up too). It is not what a reply is read with: see `LessonSchema`. */
export const SeniorLessonSchema = lessonAround(SeniorQuestionSchema, SeniorDiagramSpecSchema)

/**
 * The lesson as every writer is held to (a senior model's reply once it is read, the `save_lesson` input): the wide, senior shape, exactly 15 questions,
 * `steps` optional. Its JSON text is not the one the model is handed (`SeniorLessonSchema` is).
 */
export const LessonSchema = lessonAround(QuestionSchema, SeniorDiagramSpecSchema)
export type Lesson = z.infer<typeof LessonSchema>

/** The fewest questions a saved lesson keeps at each level. `save_lesson` with `dropInvalid` never drops below it, and `StoredLessonSchema` never wants less. */
export const MIN_QUESTIONS_PER_LEVEL = 4

/**
 * A lesson as it is READ once it is saved (the learner's screens, the home, the parent's page): the same shape as `LessonSchema`, with the counts a
 * save can really leave. `save_lesson` with `dropInvalid` drops a question whose answer cannot be marked, and keeps each level at
 * `MIN_QUESTIONS_PER_LEVEL` or more, so a saved lesson has 12 to 15 questions and a warm-up of 0, 1 or 2. `LessonSchema` wants exactly 15 (5 per level)
 * and refused those, so the learner saw "The lesson could not be loaded" for a lesson that was saved on purpose.
 *
 * It is built from the shape of `LessonSchema` and never goes to a model: the JSON text the model is handed (and the hash that finds a recorded
 * answer) belongs to `PrimaryLessonSchema` and `SeniorLessonSchema`. A lesson saved before P127 has no `steps`, and this still opens it. It reads a lesson of the primary shape too (a subset).
 */
export const StoredLessonSchema = z.object(LessonSchema.shape).superRefine((lesson, ctx) => {
  if (lesson.warmup.length > 2) {
    ctx.addIssue({ code: 'custom', path: ['warmup'], message: 'warmup has at most 2 questions' })
  }
  for (const level of [1, 2, 3] as const) {
    if (lesson.questions.filter((q) => q.difficulty === level).length < MIN_QUESTIONS_PER_LEVEL) {
      ctx.addIssue({ code: 'custom', path: ['questions'], message: `questions must have at least ${MIN_QUESTIONS_PER_LEVEL} at difficulty ${level}` })
    }
  }
})
export type StoredLesson = z.infer<typeof StoredLessonSchema>
