import { z } from 'zod'
import { QuestionSchema } from './lesson'

// P163: the parts of a `level_checks` row, as the agent writes them and the app reads them.

/** The 6 topics of a check, in the order of the year. */
export const LevelTopicsSchema = z.array(z.object({ topicId: z.string().nullable(), topicName: z.string(), family: z.string() }))
/** The questions, in order, each with its topic. A question holds its answer: only the server reads it. */
export const LevelQuestionsSchema = z.array(z.object({ topicId: z.string().nullable(), topicName: z.string(), question: QuestionSchema }))
/** The answers so far, in order. `skipped` is "I don't know yet" (never right). */
export const LevelAnswersSchema = z.array(z.object({ n: z.number().int(), answer: z.string(), correct: z.boolean(), skipped: z.boolean(), seconds: z.number() }))

export type LevelAnswerRecord = z.infer<typeof LevelAnswersSchema>[number]
