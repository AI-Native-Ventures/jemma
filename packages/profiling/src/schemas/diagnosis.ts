import { z } from 'zod'

export const DiagnosisSchema = z.array(
  z.object({
    resultId: z.string(),
    misconception: z.string(),
    gapTopicName: z.string(),
    missingBasic: z.string().nullable(),
  }),
)
export type Diagnosis = z.infer<typeof DiagnosisSchema>

export const ReteachSchema = z.object({
  title: z.string(),
  minutes: z.number(),
  audience: z.string(),
  youNeed: z.string(),
  steps: z.array(z.object({ minutes: z.number(), text: z.string() })),
  exitQuestion: z.string(),
})
export type Reteach = z.infer<typeof ReteachSchema>
