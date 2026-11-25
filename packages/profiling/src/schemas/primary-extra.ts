import { z } from 'zod'
import { DiagramSpecSchema } from './diagram'
import { lessonAround, PRIMARY_ANSWER_KINDS, QuestionSchema } from './lesson'

/**
 * The lesson the model is handed for a gated topic of Grades 1 to 6 (P151): time, measurement, ordering, patterns, data handling, money, place value.
 *
 * `PrimaryLessonSchema` (six answer kinds) is the schema of every other Grade 1 to 6 lesson, the Grade 6 demo class above all, and its JSON text is
 * pinned by a test: a recorded answer is found by a hash of it. This one is the same lesson with the new kinds a young learner can answer by meaning
 * (a time, a list of values, an order, a small table to fill) and the optional fields of those kinds. It has none of the senior ones: no `steps`, no
 * `form`, no picture of a graph or a triangle, no expression, equation, point or number. P166: a question may carry one of the seven pictures Jemma draws
 * for every grade (`DiagramSpecSchema`: a fraction bar, a number line, an area model, a place value chart, a bar graph, a shape, squared paper), and more
 * topics are asked with this schema (see `primaryKit`).
 *
 * Its fields are the ones the wide `QuestionSchema` has (a unit, the order flag and labels of a list, the cells of a table), with the same name and the same type.
 * A reply is read with the wide `LessonSchema`, as a senior reply is.
 */

/** The kinds a gated Grade 1 to 6 topic may add to the six old ones. */
export const PRIMARY_EXTRA_ANSWER_KINDS = ['time', 'list', 'order', 'table'] as const
export type PrimaryExtraAnswerKind = (typeof PRIMARY_EXTRA_ANSWER_KINDS)[number]

const wide = QuestionSchema.shape

/**
 * The question of a gated primary lesson, named field by field from the wide question (so a field that a later packet adds for senior classes never reaches a
 * young learner's lesson by itself): the prompt, the answer, the six old kinds and the new ones, plain-text choices (a picture choice is senior), the fields the
 * new kinds read (`unit`, `ordered`, `labels`, `round`, `table`), a picture of the primary kinds (P166), a graph to draw (P167), a sum in columns (P168),
 * blocks to build a number with (P169), groups to sort into (P170), and no `steps`, no `form` and no senior picture.
 */
export const PrimaryExtraQuestionSchema = z.object({
  prompt: wide.prompt,
  render: wide.render,
  terms: wide.terms,
  answer: wide.answer,
  answerKind: z.enum([...PRIMARY_ANSWER_KINDS, ...PRIMARY_EXTRA_ANSWER_KINDS]),
  choices: z.array(z.string()).optional(),
  unit: wide.unit,
  ordered: wide.ordered,
  labels: wide.labels,
  round: wide.round,
  table: wide.table,
  /** P166: one of the seven primary pictures, when the question needs it (a bar to read, a shaded part to name). It never holds the answer. */
  diagram: DiagramSpecSchema.optional(),
  /** P167: a bar graph or a picture graph the learner draws: the bars with `value: null` are the answer. */
  graph: wide.graph,
  /** P168: a sum the learner works in columns, digit by digit from the ones. */
  columns: wide.columns,
  /** P169: a number the learner builds with place value blocks. */
  blocks: wide.blocks,
  /** P170: things the learner sorts into groups. */
  groups: wide.groups,
  /** P172: a shape the learner shades parts of. */
  shade: wide.shade,
  /** P173: shapes the learner taps to pick. */
  tap: wide.tap,
  difficulty: wide.difficulty,
  why: wide.why,
  rightWay: wide.rightWay,
})
export type PrimaryExtraQuestion = z.infer<typeof PrimaryExtraQuestionSchema>

/** The lesson the model is handed for a gated topic of Grades 1 to 6. The pictures are the primary ones. */
export const PrimaryExtraLessonSchema = lessonAround(PrimaryExtraQuestionSchema, DiagramSpecSchema)
