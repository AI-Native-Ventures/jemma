import { z } from 'zod'
import { DiagramSpecSchema, SeniorDiagramSpecSchema } from './diagram'

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
 * that code marks by meaning, one optional question field, `form`, and (P127) a required `steps` on every question: 2 to 6 short lines of maths from
 * the question to the answer. It is handed to the model for a senior class only (Mathematics, Grades 7 to 12).
 *
 * Everything that WRITES a lesson (the model's output once it is read, the `save_lesson` input, the seed) uses the wide one, `LessonSchema`, which is the
 * senior shape with `steps` optional: a lesson written under the primary shape is a lesson of the wide shape too, so no stored or recorded lesson stops
 * parsing, and a model that leaves `steps` out of one question never refuses a lesson (the question is saved without them).
 * Everything that READS a saved lesson (the learner's screens, the home, the parent's page) uses `StoredLessonSchema`, the same shape with the
 * counts a save can leave (see below).
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

/** The most and the fewest lines of the worked steps of a question (P127). */
export const MIN_STEPS = 2
export const MAX_STEPS = 6

/**
 * A senior question. `steps` is a line of maths for each move from the question to the answer (`["x/2 + 6 = 10", "x/2 = 4", "x = 8"]`), written before the
 * answer so the model works the maths first. Two questions only differ in `steps`: the one the senior model is handed has it required (2 to 6 lines), the
 * wide one every reader and writer uses has it optional (see `cleanSteps` for what is kept when a lesson is saved).
 */
const seniorQuestion = <Steps extends z.ZodType>(steps: Steps) =>
  z.object({
    prompt: z.string(),
    render: z.enum(['text', 'fraction_sum']),
    terms: z.array(z.string()).optional(),
    steps,
    answer: z.string(),
    answerKind: z.enum(ANSWER_KINDS),
    choices: z.array(z.string()).optional(),
    form: FormSchema.optional(),
    /** A picture the question needs (a graph to read, a triangle with an angle to find). It never holds the answer. Senior classes only. */
    diagram: SeniorDiagramSpecSchema.optional(),
    difficulty: Difficulty,
    why: z.string(),
    rightWay: z.string(),
  })

/** The question the senior model is handed: `steps` required, 2 to 6 lines. */
export const SeniorQuestionSchema = seniorQuestion(z.array(z.string()).min(MIN_STEPS).max(MAX_STEPS))

/** The question as every reader sees it: the wide, senior shape, with `steps` optional (an old lesson has none, and a save may leave them out). */
export const QuestionSchema = seniorQuestion(z.array(z.string()).optional())
export type Question = z.infer<typeof QuestionSchema>
export type PrimaryQuestion = z.infer<typeof PrimaryQuestionSchema>

/** One lesson around one kind of question and one set of pictures. The fields, their order and the two rules are the same for both shapes. */
export const lessonAround = <Q extends z.ZodType<{ difficulty: 1 | 2 | 3 }>, D extends z.ZodType>(question: Q, picture: D) =>
  z
    .object({
      format: FormatSchema,
      title: z.string(),
      minutes: z.number(),
      cards: z
        .array(z.object({ heading: z.string(), body: z.string(), diagram: picture.optional() }))
        .optional(),
      diagram: z
        .object({
          title: z.string(),
          caption: z.string(),
          steps: z.array(z.object({ caption: z.string(), diagram: picture })),
          contrast: z.object({ caption: z.string(), diagram: picture }).optional(),
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

export const PrimaryLessonSchema = lessonAround(PrimaryQuestionSchema, DiagramSpecSchema)
export type PrimaryLesson = z.infer<typeof PrimaryLessonSchema>

/** The lesson the senior model is handed (P127: `steps` required on every question, the warm-up too). It is not what a reply is read with: see `LessonSchema`. */
export const SeniorLessonSchema = lessonAround(SeniorQuestionSchema, SeniorDiagramSpecSchema)

/**
 * The lesson as every writer is held to (a senior model's reply once it is read, the `save_lesson` input): the wide, senior shape, exactly 15 questions,
 * `steps` optional. Its JSON text is not the one the model is handed (`SeniorLessonSchema` is).
 */
export const LessonSchema = lessonAround(QuestionSchema, SeniorDiagramSpecSchema)
export type Lesson = z.infer<typeof LessonSchema>

/** The fewest questions a saved lesson keeps at each level. `save_lesson` with `dropInvalid` never drops below it, and `StoredLessonSchema` never wants less. */
export const MIN_QUESTIONS_PER_LEVEL = 4

/**
 * A lesson as it is READ once it is saved (the learner's screens, the home, the parent's page): the same shape as `LessonSchema`, with the counts a
 * save can really leave. `save_lesson` with `dropInvalid` drops a question whose answer cannot be marked, and keeps each level at
 * `MIN_QUESTIONS_PER_LEVEL` or more, so a saved lesson has 12 to 15 questions and a warm-up of 0, 1 or 2. `LessonSchema` wants exactly 15 (5 per level)
 * and refused those, so the learner saw "The lesson could not be loaded" for a lesson that was saved on purpose.
 *
 * It is built from the shape of `LessonSchema` and never goes to a model: the JSON text the model is handed (and the hash that finds a recorded
 * answer) belongs to `PrimaryLessonSchema` and `SeniorLessonSchema`. A lesson saved before P127 has no `steps`, and this still opens it. It reads a lesson of the primary shape too (a subset).
 */
export const StoredLessonSchema = z.object(LessonSchema.shape).superRefine((lesson, ctx) => {
  if (lesson.warmup.length > 2) {
    ctx.addIssue({ code: 'custom', path: ['warmup'], message: 'warmup has at most 2 questions' })
  }
  for (const level of [1, 2, 3] as const) {
    if (lesson.questions.filter((q) => q.difficulty === level).length < MIN_QUESTIONS_PER_LEVEL) {
      ctx.addIssue({ code: 'custom', path: ['questions'], message: `questions must have at least ${MIN_QUESTIONS_PER_LEVEL} at difficulty ${level}` })
    }
  }
})
export type StoredLesson = z.infer<typeof StoredLessonSchema>
