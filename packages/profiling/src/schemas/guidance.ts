import { z } from 'zod'

export const GuidanceSchema = z.object({
  headline: z.string(),
  focus: z.array(
    z.object({
      title: z.string(),
      why: z.string(),
      evidence: z.array(z.object({ label: z.string(), resultIds: z.array(z.string()) })).min(1),
    }),
  ),
  lookingAhead: z.string(),
})
export type Guidance = z.infer<typeof GuidanceSchema>
