import { z } from 'zod'
import { DiagramSpecSchema } from './diagram'
import { lessonAround, PRIMARY_ANSWER_KINDS, QuestionSchema } from './lesson'

/**
 * The lesson the model is handed for a gated topic of Grades 1 to 6 (P151): time, measurement, ordering, patterns, data handling, money, place value.
 *
 * `PrimaryLessonSchema` (six answer kinds) is the schema of every other Grade 1 to 6 lesson, the Grade 6 demo class above all, and its JSON text is
 * pinned by a test: a recorded answer is found by a hash of it. This one is the same lesson with the new kinds a young learner can answer by meaning
 * (a time, a list of values, an order, a small table to fill) and the optional fields of those kinds. It has none of the senior ones: no `steps`, no
 * `form`, no picture of a graph or a triangle, no expression, equation, point or number.
 *
 * It is built from `QuestionSchema`, the wide question, so a field that a kind needs (a unit, a count, the cells of a table) is the field every reader of a
 * lesson already has, with the same name and the same type. A reply is read with the wide `LessonSchema`, as a senior reply is.
 */

/** The kinds a gated Grade 1 to 6 topic may add to the six old ones. */
export const PRIMARY_EXTRA_ANSWER_KINDS = ['time', 'list', 'order', 'table'] as const
export type PrimaryExtraAnswerKind = (typeof PRIMARY_EXTRA_ANSWER_KINDS)[number]

/** The question of a gated primary lesson: the wide question without `steps`, `form` and a senior picture, and with the six old kinds and the new ones. */
export const PrimaryExtraQuestionSchema = QuestionSchema.omit({ steps: true, form: true, diagram: true }).extend({
  answerKind: z.enum([...PRIMARY_ANSWER_KINDS, ...PRIMARY_EXTRA_ANSWER_KINDS]),
})
export type PrimaryExtraQuestion = z.infer<typeof PrimaryExtraQuestionSchema>

/** The lesson the model is handed for a gated topic of Grades 1 to 6. The pictures are the primary ones. */
export const PrimaryExtraLessonSchema = lessonAround(PrimaryExtraQuestionSchema, DiagramSpecSchema)
