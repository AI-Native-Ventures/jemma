import { z } from 'zod'

// Past records brought in from a file, a pasted table or one typed result.
// The model only says what each column means (`FileMappingSchema`). Code reads every row (`logic/record-import.ts`).

/** The kinds of piece a file can hold. A teacher can also type a note. Attendance comes from an attendance column. */
export const MARKED_KINDS = ['quiz', 'assignment', 'project'] as const
export const MarkedKindSchema = z.enum(MARKED_KINDS)
export type MarkedKind = z.infer<typeof MarkedKindSchema>

export const PIECE_KINDS = [...MARKED_KINDS, 'note', 'attendance'] as const
export type PieceKind = (typeof PIECE_KINDS)[number]

export const IMPORT_STATUSES = ['drafting', 'ready', 'approved', 'discarded', 'failed'] as const
export type ImportStatus = (typeof IMPORT_STATUSES)[number]

/** A column, named as the file's header names it, or null when the file has no such column. */
const Column = z.string().nullable().describe('The exact header text of the column, or null when the file has no such column.')

export const COLUMN_FIELDS = ['learner', 'mark', 'outOf', 'percent', 'date', 'term', 'year', 'grade', 'subject', 'title', 'kind', 'topic', 'note', 'teacher', 'attendance'] as const
export type ColumnField = (typeof COLUMN_FIELDS)[number]

/** What is true of every row when the file has no column for it (for example "every row is Grade 5, 2025"). */
export const FixedValuesSchema = z.object({
  kind: MarkedKindSchema.nullable().describe('quiz, assignment or project for every row, when no column says. Use quiz when nothing says.'),
  outOf: z.number().positive().nullable().describe('What every mark is out of, when the file has no column for it.'),
  grade: z.number().int().min(1).max(12).nullable(),
  year: z.number().int().min(1990).max(2100).nullable(),
  term: z.number().int().min(1).max(4).nullable(),
  subject: z.string().nullable(),
  teacher: z.string().nullable(),
})
export type FixedValues = z.infer<typeof FixedValuesSchema>

/** The strand family of one topic text of the file, or `unsure`. */
export const TopicFamilySchema = z.object({ text: z.string(), family: z.string() })
export type TopicFamily = z.infer<typeof TopicFamilySchema>

export const MAX_TOPICS = 40

/** The answer of the `map_records` job. Columns are named as the header names them. */
export const FileMappingSchema = z.object({
  learner: Column,
  mark: Column,
  outOf: Column,
  percent: Column,
  date: Column,
  term: Column,
  year: Column,
  grade: Column,
  subject: Column,
  title: Column,
  kind: Column,
  topic: Column,
  note: Column,
  teacher: Column,
  attendance: Column,
  fixed: FixedValuesSchema,
  topics: z.array(TopicFamilySchema).max(MAX_TOPICS).describe('For each distinct topic text you can see: the strand family it belongs to, or unsure.'),
})
export type FileMapping = z.infer<typeof FileMappingSchema>

/** One row of the file, as code read it. Stored in `record_imports.rows`. */
export const ImportRowSchema = z.object({
  /** The row number in the file. The header is row 1. */
  n: z.number().int(),
  cells: z.array(z.string()),
  learner: z.string(),
  childId: z.string().nullable(),
  /** The learners that match when more than one does. */
  options: z.array(z.string()),
  /** What the row holds: a marked piece, a note, or null when there is nothing to add. */
  piece: z.enum(PIECE_KINDS).nullable(),
  title: z.string(),
  subject: z.string().nullable(),
  grade: z.number().int().nullable(),
  year: z.number().int().nullable(),
  term: z.number().int().nullable(),
  /** YYYY-MM-DD. A row with a term and a year but no date gets the first day of the term. */
  date: z.string().nullable(),
  marks: z.number().int().nullable(),
  outOf: z.number().int().nullable(),
  /** What the mark cell said, for the review screen. */
  markText: z.string(),
  /** Set when the mark cell could not be used. */
  markProblem: z.enum(['unreadable', 'no_total']).nullable(),
  topic: z.string().nullable(),
  /** The words that place the row in a strand: the topic, else the title of the piece. Rows with the same words get the same strand. */
  strandText: z.string().nullable(),
  /** The strand family. Null means Jemma is unsure. */
  family: z.string().nullable(),
  text: z.string().nullable(),
  teacher: z.string().nullable(),
  present: z.number().int().nullable(),
  total: z.number().int().nullable(),
  /** The teacher left this row out. */
  skip: z.boolean(),
  /** The teacher said to keep a row that repeats a record. */
  keep: z.boolean(),
})
export type ImportRow = z.infer<typeof ImportRowSchema>

export const PROBLEM_KINDS = ['unknown_learner', 'two_learners', 'mark_above_total', 'no_term_or_date', 'topic_unsure', 'repeat', 'bad_mark', 'no_total'] as const
export type ProblemKind = (typeof PROBLEM_KINDS)[number]

export const ProblemSchema = z.object({ row: z.number().int(), kind: z.enum(PROBLEM_KINDS), text: z.string() })
export type Problem = z.infer<typeof ProblemSchema>

/** What is kept in `record_imports.mapping`: the model's answer, the header, and what the review screen says in words. */
export const StoredMappingSchema = z.object({
  mapping: FileMappingSchema,
  header: z.array(z.string()),
  /** Rows in the file after the header, without blank lines. */
  rowCount: z.number().int(),
  blankLines: z.number().int(),
  /** Plain lines that say what each column means. */
  lines: z.array(z.string()),
  /** Things Jemma assumed (the term calendar, a grade worked out from the year). */
  assumptions: z.array(z.string()),
  /** Columns the model named that the file does not have. */
  warnings: z.array(z.string()),
  /** The strands a teacher can pick from. Null: the teacher types a short word. */
  families: z.array(z.object({ family: z.string(), label: z.string() })).nullable(),
})
export type StoredMapping = z.infer<typeof StoredMappingSchema>

/** One learner of the class as the import sees them. */
export type ImportLearner = { id: string; firstName: string; lastName: string | null }

/** A record the learner already has, for the "repeats a record" check. */
export type ExistingRecord = {
  childId: string
  source: string
  title: string
  happenedOn: string
  year: number
  term: number
  marks: number | null
  outOf: number | null
  text: string | null
  present?: number | null
  total?: number | null
}
