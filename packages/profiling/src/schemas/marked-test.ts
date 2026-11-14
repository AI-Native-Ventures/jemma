import { z } from 'zod'

/**
 * What the vision model reads from the photo of a test a learner got back already marked: each question that has a mark on it, what the
 * learner wrote, and the teacher's mark (a tick, a cross or a half mark). The model does not mark anything. The mark is the teacher's.
 */
export const MarkedTestReadSchema = z.object({
  /** False when the photo cannot be used (too dark, blurry, cut off, or not a marked test). `questions` may then be empty. */
  pageUsable: z.boolean(),
  /** The title printed at the top of the test, when there is one. */
  title: z.string().optional(),
  questions: z.array(
    z.object({
      /** The number as it is written on the page: "1", "2", "2a". */
      n: z.string(),
      /** The words of the question, short. */
      prompt: z.string(),
      /** What the learner wrote, copied as it is. Empty when the learner left it blank. */
      answerAsWritten: z.string(),
      /** The teacher's mark: a tick, a cross, or a half mark. */
      result: z.enum(['right', 'wrong', 'part']),
      /** The marks the teacher wrote as numbers ("2/3" next to a question), when they are written. */
      marksGot: z.number().min(0).optional(),
      marksOutOf: z.number().min(0).optional(),
      /** The maths topic in plain words, as a teacher would name it ("Equivalent fractions"). */
      topic: z.string(),
      /** How sure the model is that it read the teacher's mark and the answer correctly, from 0 to 1. */
      confidence: z.number().min(0).max(1),
    }),
  ),
})
export type MarkedTestRead = z.infer<typeof MarkedTestReadSchema>
