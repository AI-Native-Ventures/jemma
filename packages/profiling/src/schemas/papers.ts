import { z } from 'zod'

export const PaperReadSchema = z.object({
  nameAsWritten: z.string().nullable(),
  nameConfidence: z.number().min(0).max(1),
  pageUsable: z.boolean(),
  problem: z.enum(['too_dark', 'blurry', 'cut_off', 'not_a_test']).optional(),
  answers: z.array(
    z.object({
      n: z.number().int(),
      answerAsRead: z.string(),
      confidence: z.number().min(0).max(1),
      crop: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).optional(),
    }),
  ),
})
export type PaperRead = z.infer<typeof PaperReadSchema>
