import { z } from 'zod'
import { GuidanceSchema } from './guidance'
import { FormatSchema } from './lesson'

export const StageSchema = z.enum(['new', 'practising', 'fixed'])

export const LearnerProfileSchema = z.object({
  child: z.object({
    id: z.string(),
    firstName: z.string(),
    grade: z.number().int(),
    schoolName: z.string(),
    className: z.string().nullable(),
  }),
  marksByTopic: z.array(z.object({ topicName: z.string(), percent: z.number(), change: z.number() })),
  gaps: z.array(
    z.object({
      id: z.string(),
      topicName: z.string(),
      topicId: z.string().nullable(),
      stage: StageSchema,
      evidence: z.array(z.string()),
      misconception: z.string().nullable(),
    }),
  ),
  recentSessions: z.array(
    z.object({
      id: z.string(),
      topicName: z.string(),
      format: FormatSchema,
      right: z.number().int().nullable(),
      minutes: z.number().nullable(),
      finishedAt: z.string().nullable(),
    }),
  ),
  observations: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(['participation', 'confidence', 'effort', 'behaviour']),
      text: z.string(),
      author: z.string().nullable(),
      createdAt: z.string(),
    }),
  ),
  attendance: z.object({ present: z.number().int(), total: z.number().int(), away: z.array(z.string()) }),
  activities: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(['sport', 'club', 'music', 'art', 'other']),
      name: z.string(),
      place: z.string().nullable(),
      days: z.array(z.string()),
      since: z.string(),
    }),
  ),
  guidance: GuidanceSchema.nullable(),
})
export type LearnerProfile = z.infer<typeof LearnerProfileSchema>
