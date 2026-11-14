import { z } from 'zod'
import { DiagramSpecSchema } from './diagram'

// Same union as logic/types.ts Format; the coordinator unifies them.
export const FormatSchema = z.enum(['reading', 'diagram', 'audio'])
export type Format = z.infer<typeof FormatSchema>

const Difficulty = z.union([z.literal(1), z.literal(2), z.literal(3)])

/**
 * Two shapes of a lesson, and one of them is the one the demo class was recorded with.
 *
 * `PrimaryLessonSchema` is the lesson exactly as it was (six answer kinds). It is the schema the lesson writer hands to the model for every
 * class that is not a senior one, and the JSON text of it is part of the hash that finds a recorded answer: not one character of it may change
 * (a test pins its sha256). `SeniorLessonSchema` is the same lesson with four more answer kinds (`number`, `expression`, `equation`, `point`)
 * that code marks by meaning, and one optional question field, `form`. It is handed to the model for a senior class only (Mathematics, Grades 7 to 12).
 *
 * Everything that READS a lesson (the learner's screens, `save_lesson`, the stored sessions, the seed) uses the wide one, `LessonSchema`, which is the
 * senior shape: a lesson written under the primary shape is a lesson of the senior shape too, so no stored or recorded lesson stops parsing.
 */

export const PRIMARY_ANSWER_KINDS = ['fraction', 'mixed', 'decimal', 'whole', 'money', 'choice'] as const
/** The four kinds of a senior class that code marks by meaning (logic/meaning.ts). */
export const MEANING_ANSWER_KINDS = ['number', 'expression', 'equation', 'point'] as const
export const ANSWER_KINDS = [...PRIMARY_ANSWER_KINDS, ...MEANING_ANSWER_KINDS] as const
export type AnswerKind = (typeof ANSWER_KINDS)[number]
export type MeaningKind = (typeof MEANING_ANSWER_KINDS)[number]

/** The form an `expression` answer must be in: `factorised` (a product of brackets), `expanded` (no brackets, like terms gathered) or `any` (the same value is enough). */
export const FORMS = ['any', 'factorised', 'expanded'] as const
export const FormSchema = z.enum(FORMS)
export type Form = z.infer<typeof FormSchema>

export const PrimaryQuestionSchema = z.object({
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

export const SeniorQuestionSchema = z.object({
  prompt: z.string(),
  render: z.enum(['text', 'fraction_sum']),
  terms: z.array(z.string()).optional(),
  answer: z.string(),
  answerKind: z.enum(ANSWER_KINDS),
  choices: z.array(z.string()).optional(),
  form: FormSchema.optional(),
  difficulty: Difficulty,
  why: z.string(),
  rightWay: z.string(),
})

/** The question as every reader sees it: the wide, senior shape. */
export const QuestionSchema = SeniorQuestionSchema
export type Question = z.infer<typeof QuestionSchema>
export type PrimaryQuestion = z.infer<typeof PrimaryQuestionSchema>

/** One lesson around one kind of question. The fields, their order and the two rules are the same for both shapes. */
const lessonAround = <Q extends z.ZodType<{ difficulty: 1 | 2 | 3 }>>(question: Q) =>
  z
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
      warmup: z.array(question),
      questions: z.array(question),
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

export const PrimaryLessonSchema = lessonAround(PrimaryQuestionSchema)
export type PrimaryLesson = z.infer<typeof PrimaryLessonSchema>

export const SeniorLessonSchema = lessonAround(SeniorQuestionSchema)

/** The lesson as every reader sees it: the wide, senior shape. */
export const LessonSchema = SeniorLessonSchema
export type Lesson = z.infer<typeof LessonSchema>
