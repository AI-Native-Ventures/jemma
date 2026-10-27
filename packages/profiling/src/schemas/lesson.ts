import { z } from 'zod'
import { DiagramSpecSchema } from './diagram'

// Same union as logic/types.ts Format; the coordinator unifies them.
export const FormatSchema = z.enum(['reading', 'diagram', 'audio'])
export type Format = z.infer<typeof FormatSchema>

const Difficulty = z.union([z.literal(1), z.literal(2), z.literal(3)])

export const QuestionSchema = z.object({
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
export type Question = z.infer<typeof QuestionSchema>

export const LessonSchema = z
  .object({
    format: FormatSchema,
    title: z.string(),
    minutes: z.number(),
    cards: z
      .array(z.object({ heading: z.string(), body: z.string(), diagram: DiagramSpecSchema.optional() }))
      .optional(),
    diagram: z
      .object({
        title: z.string(),
        caption: z.string(),
        steps: z.array(z.object({ caption: z.string(), diagram: DiagramSpecSchema })),
        contrast: z.object({ caption: z.string(), diagram: DiagramSpecSchema }).optional(),
      })
      .optional(),
    audio: z.object({ script: z.string() }).optional(),
    warmup: z.array(QuestionSchema),
    questions: z.array(QuestionSchema),
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
export type Lesson = z.infer<typeof LessonSchema>
