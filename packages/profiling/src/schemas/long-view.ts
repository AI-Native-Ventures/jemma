import { z } from 'zod'

export const LONG_VIEW_KINDS = ['strength', 'struggle'] as const
export const LongViewKindSchema = z.enum(LONG_VIEW_KINDS)
export type LongViewKind = z.infer<typeof LongViewKindSchema>

export const LONG_VIEW_STATUSES = ['draft', 'approved', 'dismissed', 'discussed'] as const
export const LongViewStatusSchema = z.enum(LONG_VIEW_STATUSES)
export type LongViewStatus = z.infer<typeof LongViewStatusSchema>

/** A calendar term: Jan to Mar is 1, Apr to Jun 2, Jul to Sep 3, Oct to Dec 4. */
export const SlotRefSchema = z.object({ year: z.number().int(), term: z.number().int().min(1).max(4) })

/** A term with nothing in it. The grade is worked out from the terms around it. */
export const MissingTermSchema = SlotRefSchema.extend({ grade: z.number().int().optional() })

/** A term of one family that a pattern rests on. `points` is how many marks or answers stand behind `percent`. */
export const LongViewTermSchema = z.object({
  grade: z.number().int(),
  year: z.number().int(),
  term: z.number().int().min(1).max(4),
  percent: z.number(),
  points: z.number(),
})
export type LongViewTerm = z.infer<typeof LongViewTermSchema>

/** What a pattern was seen in: a past piece of work (`record`), a marked answer this year (`result`) or a teacher note (`note`). */
export const LongViewEvidenceSchema = z.object({
  kind: z.enum(['record', 'result', 'note']),
  id: z.string(),
  label: z.string(),
})
export type LongViewEvidence = z.infer<typeof LongViewEvidenceSchema>

export const LongViewTermsSchema = z.array(LongViewTermSchema)
export const LongViewEvidenceListSchema = z.array(LongViewEvidenceSchema)

/**
 * A term as it is stored in `long_view_patterns.terms`. After the run's terms come up to 2 newer terms, oldest first, each flagged
 * `since: true`: the pattern held before them, and these later terms did not continue it.
 */
export const LongViewStoredTermSchema = LongViewTermSchema.extend({ since: z.boolean().optional() })
export type LongViewStoredTerm = z.infer<typeof LongViewStoredTermSchema>
/** The jsonb columns of `long_view_patterns`. */
export const LongViewStoredTermsSchema = z.array(LongViewStoredTermSchema)

/** A newer term with data that did not continue the pattern, with what it rests on (newest first, at most 6). */
export const SinceSlotSchema = LongViewTermSchema.extend({ sources: LongViewEvidenceListSchema })
export type SinceSlot = z.infer<typeof SinceSlotSchema>

/** A pattern code found in the records. The model never writes one: it only words it. */
export const PatternCandidateSchema = z.object({
  /** `<kind>:<family>`, stable across runs. It does not name the subject: two subjects can both have `struggle:data`, so a pattern is the pair (subject, key). */
  key: z.string(),
  kind: LongViewKindSchema,
  /** The subject whose strand this is: Mathematics, English, Natural Sciences, ... */
  subject: z.string(),
  family: z.string(),
  terms: LongViewTermsSchema,
  /** Newest first, at most 12. */
  evidence: LongViewEvidenceListSchema,
  /** How many more sources there were than the 12 listed. Only present when the list was cut. */
  more: z.number().int().optional(),
  /** Terms inside the span with no data for this family. They were skipped, never guessed. */
  missingTerms: z.array(MissingTermSchema),
  /**
   * The newer terms with data after the pattern, oldest first. Empty when the pattern runs to the family's newest term with data.
   * At most 2: a pattern followed by 3 or more newer terms is not a candidate.
   */
  since: z.array(SinceSlotSchema).max(2),
})
export type PatternCandidate = z.infer<typeof PatternCandidateSchema>

export const HistoryNoteSchema = z.object({
  id: z.string(),
  kind: z.enum(['record', 'observation']),
  /** Null: a note belongs to the learner, not to a subject. */
  subject: z.string().nullable(),
  teacher: z.string().nullable(),
  /** YYYY-MM-DD */
  date: z.string(),
  text: z.string(),
})
export type HistoryNote = z.infer<typeof HistoryNoteSchema>

/** One subject of the learner: its terms, its strands with their marks by term, the terms with nothing in them and the marks left out. */
export const SubjectHistorySchema = z.object({
  subject: z.string(),
  /** Every term with any record or marked answer of this subject (or a note or attendance, which have no subject), oldest first. */
  slots: z.array(z.object({ grade: z.number().int(), year: z.number().int(), term: z.number().int() })),
  /** Marks by strand and term. A term with too few marks for a strand is left out for that strand. */
  families: z.array(
    z.object({
      family: z.string(),
      /** The plain name of the strand. */
      label: z.string(),
      bySlot: z.array(LongViewTermSchema),
    }),
  ),
  /** Terms between the first and the last one in this subject that have nothing at all. */
  missingTerms: z.array(MissingTermSchema),
  /** Marked pieces of this subject left out because the marks could not be read clearly. */
  notCounted: z.array(z.object({ id: z.string(), label: z.string() })),
})
export type SubjectHistory = z.infer<typeof SubjectHistorySchema>

export const LearnerHistorySchema = z.object({
  child: z.object({ firstName: z.string(), grade: z.number().int() }),
  /** One entry for each subject the learner has marks in, Mathematics first. The strands of two subjects are never put together. */
  subjects: z.array(SubjectHistorySchema),
  /** Every pattern code found, in every subject. A pattern is the pair (subject, key). */
  candidates: z.array(PatternCandidateSchema),
  notes: z.array(HistoryNoteSchema),
  attendanceByTerm: z.array(
    z.object({ grade: z.number().int(), year: z.number().int(), term: z.number().int(), present: z.number(), total: z.number(), percent: z.number() }),
  ),
  /** Pieces written into the records more than 60 days after they happened. They still count. */
  loggedLate: z.array(z.object({ id: z.string(), subject: z.string().nullable(), label: z.string(), happenedOn: z.string(), loggedAt: z.string() })),
})
export type LearnerHistory = z.infer<typeof LearnerHistorySchema>

/** What a model may hand over for one pattern. The tool adds the terms and the evidence itself. */
export const LongViewDraftPatternSchema = z.object({
  /** The candidate's `key`. */
  key: z.string(),
  /**
   * The candidate's `subject`. Always give it: the same key can exist in two subjects. When it is left out and only one candidate has
   * that key, the tool takes that one; when two do, the pattern is dropped and the reason says to name the subject.
   */
  subject: z.string().optional(),
  /** What was seen, in words a parent would use. At most 70 characters. */
  title: z.string(),
  /** At most two short sentences: what was seen and over which terms. At most 320 characters. */
  statement: z.string(),
  /** Teacher notes (ids from `get_learner_history`) that clearly speak about the same thing. */
  noteIds: z.array(z.string()).optional(),
})
export type LongViewDraftPattern = z.infer<typeof LongViewDraftPatternSchema>

export const LongViewDraftSchema = z.object({ patterns: z.array(LongViewDraftPatternSchema) })
export type LongViewDraft = z.infer<typeof LongViewDraftSchema>

export const LONG_VIEW_TITLE_MAX = 70
export const LONG_VIEW_STATEMENT_MAX = 320

/** One row of `long_view_patterns` as the screens read it. */
export const LongViewPatternSchema = z.object({
  id: z.string(),
  childId: z.string(),
  kind: LongViewKindSchema,
  subject: z.string(),
  family: z.string(),
  title: z.string(),
  statement: z.string(),
  terms: LongViewStoredTermsSchema,
  evidence: LongViewEvidenceListSchema,
  status: LongViewStatusSchema,
  active: z.boolean(),
  updatedAt: z.string(),
})
export type LongViewPattern = z.infer<typeof LongViewPatternSchema>
