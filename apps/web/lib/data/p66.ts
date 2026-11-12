import type { JemmaDb } from '@jemma/profiling/db'
import { allowedFamilies, storedOf, type ImportRecordRow } from '@jemma/profiling/imports'
import { strandLabel, type Counts, type FamilyChoice } from '@jemma/profiling/logic'
import type { ImportRow, ImportStatus, Problem, ProblemKind, StoredMapping } from '@jemma/profiling/schemas'
import { createSupabaseServer } from '../supabase/server'
import { dateLabel } from './p52'

// The screens of "Add past records": the list of files waiting, and the check screen of one file.
// `buildReview` is pure: it turns the rows already read into what the screen shows. The reads use the teacher's own session (row level security).

export type Person = { id: string; name: string }

/** `Sipho Dube` when the learner has a surname, else `Sipho`. */
export const personName = (k: { first_name: string; last_name: string | null }) => [k.first_name, k.last_name].filter(Boolean).join(' ')

export type ProblemRow = {
  n: number
  /** What the file says in this row, cell by cell, as the teacher would read it. */
  summary: string
  /** What is wrong, one plain sentence each (the "Row N:" start is left off: the card says the row). */
  problems: { kind: ProblemKind; text: string }[]
  /** The learner has to be picked: the row's name is unknown, or two learners match. */
  pickLearner: boolean
  /** Learners to choose from, the ones that match first. */
  learnerOptions: Person[]
  /** The strand has to be picked. */
  pickStrand: boolean
  /** A repeat the teacher can keep. */
  canKeep: boolean
}

export type SampleRow = { n: number; who: string; title: string; mark: string | null; when: string; strand: string | null }

export type ReviewState = 'reading' | 'failed' | 'ready' | 'added' | 'discarded'

export type ReviewView = {
  id: string
  classId: string
  className: string
  fileName: string
  state: ReviewState
  /** What is said about the file in plain words: the mapping, what was assumed, what was not found. */
  lines: string[]
  assumptions: string[]
  warnings: string[]
  counts: Counts
  problemRows: ProblemRow[]
  sample: SampleRow[]
  /** How many learners the rows that are ready belong to. */
  readyLearners: number
  learners: Person[]
  /** The strands a teacher can pick. Null: the teacher types a short word. */
  families: FamilyChoice[] | null
  approvedBy: string | null
  approvedOn: string | null
  /** Records written, and the learners who got them (state `added`). */
  written: { records: number; learners: Person[] } | null
  /** Why the file could not be read, in plain words (state `failed`). */
  failure: string | null
  /** The subject of the class, for the strand names. */
  subject: string
}

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many)
export { plural }

/** The first words of what went wrong, only when they are written for a teacher (the file or the columns). Anything else is said plainly and generally. */
export function plainFailure(error: string | null): string {
  if (error && /^(The (file|column)|This file)/.test(error.trim())) return error.trim().slice(0, 300)
  return 'Jemma could not read this file this time. Try again, or add the file again.'
}

const shown = (cells: string[]) => cells.filter((c) => c.trim() !== '').map((c) => (c.length > 40 ? `${c.slice(0, 40)}...` : c)).join(' · ')

const markOf = (r: ImportRow) => (r.marks !== null && r.outOf !== null ? `${r.marks} out of ${r.outOf}` : r.present !== null && r.total !== null ? `${r.present} of ${r.total} days` : null)

type ReviewInput = {
  row: Pick<ImportRecordRow, 'id' | 'class_id' | 'file_name' | 'status' | 'mapping' | 'rows' | 'problems' | 'approved_by_name' | 'approved_at'>
  className: string
  subject: string
  learners: { id: string; first_name: string; last_name: string | null }[]
  families: FamilyChoice[] | null
  /** What the failed event said, when the newest read of the file failed. */
  failedWith?: string | null
  hasFailedEvent?: boolean
  written?: { child_id: string }[]
}

/** Builds what the check screen shows. No database and no clock. */
export function buildReview(input: ReviewInput): ReviewView {
  const stored = storedOf(input.row)
  const who = new Map(input.learners.map((k) => [k.id, personName(k)]))
  const learners: Person[] = input.learners.map((k) => ({ id: k.id, name: personName(k) }))
  const status = input.row.status as ImportStatus
  const state: ReviewState =
    status === 'approved' ? 'added' : status === 'discarded' ? 'discarded' : status === 'ready' ? 'ready' : status === 'failed' || input.hasFailedEvent ? 'failed' : 'reading'

  const byRow = new Map<number, Problem[]>()
  for (const p of stored.problems) byRow.set(p.row, [...(byRow.get(p.row) ?? []), p])
  const problemRows: ProblemRow[] = stored.rows
    .filter((r) => !r.skip && byRow.has(r.n))
    .map((r) => {
      const found = byRow.get(r.n)!
      const kinds = found.map((p) => p.kind)
      const options = r.options.map((id) => ({ id, name: who.get(id) ?? '' })).filter((o) => o.name)
      const rest = learners.filter((l) => !options.some((o) => o.id === l.id))
      return {
        n: r.n,
        summary: shown(r.cells),
        problems: found.map((p) => ({ kind: p.kind, text: p.text.replace(/^Row \d+: /, '').replace(/^./, (c) => c.toUpperCase()) })),
        pickLearner: kinds.includes('unknown_learner') || kinds.includes('two_learners'),
        learnerOptions: [...options, ...rest],
        pickStrand: kinds.includes('topic_unsure'),
        canKeep: kinds.includes('repeat'),
      }
    })

  const open = new Set(stored.problems.map((p) => p.row))
  const label = (family: string | null) => (family ? strandLabel(input.subject, family) : null)
  const sample: SampleRow[] = stored.rows
    .filter((r) => r.piece !== null && !r.skip && !open.has(r.n))
    .slice(0, 6)
    .map((r) => ({
      n: r.n,
      who: r.childId ? (who.get(r.childId) ?? r.learner) : r.learner,
      title: r.title,
      mark: markOf(r),
      when: r.term !== null && r.year !== null ? `Term ${r.term}, ${r.year}` : '',
      strand: r.piece === 'note' || r.piece === 'attendance' ? (r.piece === 'note' ? 'Note' : 'Attendance') : label(r.family),
    }))

  const readyLearners = new Set(stored.rows.filter((r) => r.piece !== null && !r.skip && !open.has(r.n) && r.childId).map((r) => r.childId)).size
  const writtenIds = [...new Set((input.written ?? []).map((w) => w.child_id))]
  const mapping: StoredMapping | null = stored.mapping
  return {
    id: input.row.id,
    classId: input.row.class_id,
    className: input.className,
    fileName: input.row.file_name,
    state,
    lines: mapping?.lines ?? [],
    assumptions: mapping?.assumptions ?? [],
    warnings: mapping?.warnings ?? [],
    counts: stored.counts,
    problemRows,
    sample,
    readyLearners,
    learners,
    families: input.families ?? mapping?.families ?? null,
    approvedBy: input.row.approved_by_name,
    approvedOn: input.row.approved_at ? dateLabel(input.row.approved_at) : null,
    written: state === 'added' ? { records: input.written?.length ?? 0, learners: writtenIds.map((id) => ({ id, name: who.get(id) ?? '' })).filter((l) => l.name) } : null,
    failure: state === 'failed' ? plainFailure(input.failedWith ?? null) : null,
    subject: input.subject,
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------------------------------------------------

/** The check screen of one file, read with the signed-in teacher's own session. Null when the file is not one of their classes. */
export async function getReview(classId: string, importId: string): Promise<ReviewView | null> {
  const db = (await createSupabaseServer()) as unknown as JemmaDb
  const { data: row } = await db.from('record_imports').select('*').eq('id', importId).eq('class_id', classId).maybeSingle()
  if (!row) return null
  const { data: cls } = await db.from('classes').select('name, subject').eq('id', classId).maybeSingle()
  if (!cls) return null
  const { data: enrolled } = await db.from('enrolments').select('children(id, first_name, last_name, created_at)').eq('class_id', classId)
  const learners = (enrolled ?? [])
    .flatMap((e) => (e.children ? [e.children] : []))
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
  const [families, written, events] = await Promise.all([
    allowedFamilies(db, classId, cls.subject),
    row.status === 'approved' ? db.from('learner_records').select('child_id').eq('import_id', importId) : Promise.resolve({ data: [] as { child_id: string }[] }),
    row.status === 'drafting' || row.status === 'failed'
      ? db.from('events').select('status, error, created_at').eq('type', 'records.uploaded').eq('payload->>importId', importId).order('created_at', { ascending: false }).limit(1)
      : Promise.resolve({ data: [] as { status: string; error: string | null }[] }),
  ])
  const newest = events.data?.[0]
  return buildReview({
    row,
    className: cls.name,
    subject: cls.subject,
    learners,
    families,
    failedWith: newest?.status === 'failed' ? newest.error : null,
    hasFailedEvent: newest?.status === 'failed',
    written: written.data ?? [],
  })
}

export type WaitingFile = { id: string; fileName: string; status: ImportStatus; when: string; label: string }

const STATUS_WORDS: Record<ImportStatus, string> = {
  drafting: 'Jemma is reading it',
  ready: 'Waiting for you to check it',
  approved: 'Added to the records',
  discarded: 'Discarded',
  failed: 'Could not be read',
}

/** The newest files of the class, so a teacher can come back to one that is waiting. */
export async function getRecentFiles(classId: string, limit = 6): Promise<WaitingFile[]> {
  const db = (await createSupabaseServer()) as unknown as JemmaDb
  const { data } = await db.from('record_imports').select('id, file_name, status, created_at').eq('class_id', classId).neq('status', 'discarded').order('created_at', { ascending: false }).limit(limit)
  return (data ?? []).map((r) => ({ id: r.id, fileName: r.file_name, status: r.status as ImportStatus, when: dateLabel(r.created_at), label: STATUS_WORDS[r.status as ImportStatus] ?? r.status }))
}
