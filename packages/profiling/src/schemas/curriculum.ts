import { z } from 'zod'

export const TopicMapDraftSchema = z.object({
  grade: z.number().int(),
  terms: z.array(
    z.object({
      term: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
      topics: z.array(
        z.object({
          name: z.string(),
          shortName: z.string().optional(),
          family: z.string(),
          prerequisites: z.array(z.string()),
          misconceptions: z.array(z.string()),
          check: z.object({ reason: z.string(), options: z.array(z.string()) }).optional(),
        }),
      ),
    }),
  ),
  leftOut: z.array(z.object({ name: z.string(), reason: z.string() })),
})
export type TopicMapDraft = z.infer<typeof TopicMapDraftSchema>

export const AnswerKeyItemSchema = z.object({
  n: z.number().int(),
  prompt: z.string(),
  answer: z.string(),
  marks: z.literal(1),
  topicName: z.string(),
  confidence: z.number().min(0).max(1),
  note: z.string().optional(),
})
export type AnswerKeyItem = z.infer<typeof AnswerKeyItemSchema>
