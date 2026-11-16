import { z } from 'zod'
import { SeniorDiagramSpecSchema } from './diagram'
import { ANSWER_KINDS, QuestionSchema } from './lesson'

/** A picture in a teaching lesson: every primary and senior diagram kind. Never a kind outside this schema. */
export const TeachingDiagramSchema = SeniorDiagramSpecSchema

export const TeachingBlockSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('explain'), text: z.string().min(1), speech: z.string().min(1) }),
  z.object({ kind: z.literal('diagram'), spec: TeachingDiagramSchema, caption: z.string().min(1), speech: z.string().min(1) }),
  z.object({
    kind: z.literal('worked'),
    problem: z.string().min(1),
    steps: z.array(z.object({ line: z.string().min(1), reason: z.string().min(1) })).min(2).max(8),
    answer: z.string().min(1),
    answerKind: z.enum(ANSWER_KINDS),
    speech: z.string().min(1),
    diagram: TeachingDiagramSchema.optional(),
  }),
  z.object({ kind: z.literal('try'), question: QuestionSchema, hint: z.string().min(1), speech: z.string().min(1) }),
  z.object({ kind: z.literal('mistake'), wrong: z.string().min(1), right: z.string().min(1), why: z.string().min(1), speech: z.string().min(1), diagram: TeachingDiagramSchema.optional() }),
])
export type TeachingBlock = z.infer<typeof TeachingBlockSchema>

export const TeachingLessonSchema = z
  .object({
    position: z.number().int().min(1).max(8),
    title: z.string().min(1),
    minutes: z.number().int().min(5).max(30),
    objectives: z.array(z.string().min(1)).min(2).max(4),
    keyWords: z.array(z.object({ word: z.string().min(1), meaning: z.string().min(1) })).max(8),
    blocks: z.array(TeachingBlockSchema).min(8).max(30),
    summary: z.array(z.string().min(1)).min(3).max(6),
    practice: z.array(QuestionSchema).min(5).max(8),
  })
  .superRefine((l, ctx) => {
    if (!l.blocks.some((b) => b.kind === 'try')) ctx.addIssue({ code: 'custom', path: ['blocks'], message: 'needs at least one try block' })
    if (!l.blocks.some((b) => b.kind === 'mistake')) ctx.addIssue({ code: 'custom', path: ['blocks'], message: 'needs at least one mistake block' })
  })
export type TeachingLesson = z.infer<typeof TeachingLessonSchema>

export const TeachingSourceSchema = z.object({
  kind: z.enum(['siyavula', 'caps', 'none']),
  title: z.string(),
  address: z.string().optional(),
  licence: z.string().optional(),
  credit: z.string(),
})
export type TeachingSource = z.infer<typeof TeachingSourceSchema>

export const LessonStatusSchema = z.object({
  position: z.number().int().min(1).max(8),
  status: z.enum(['ready', 'failed']),
  problems: z.array(z.string()),
  writer: z.string(),
  reviewer: z.string(),
})

/** One file under content/lessons/grade-<n>/<slug>.json: every lesson of one topic of one grade. */
export const TopicLessonsSchema = z.object({
  grade: z.number().int().min(1).max(12),
  baseName: z.string().min(1),
  family: z.string().min(1),
  capsNames: z.array(z.string().min(1)).min(1),
  terms: z.array(z.number().int().min(1).max(4)).min(1),
  source: TeachingSourceSchema,
  lessons: z.array(TeachingLessonSchema).min(1).max(8),
  status: z.array(LessonStatusSchema),
  generatedAt: z.string(),
})
export type TopicLessons = z.infer<typeof TopicLessonsSchema>

/** The name a library entry is stored under: the CAPS name without a trailing " (Term N)". */
export const libraryKey = (name: string): string => name.replace(/\s*\(Term\s*\d+\)\s*$/i, '').trim() || name
