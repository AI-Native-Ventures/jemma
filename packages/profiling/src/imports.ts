import { subjectProfile } from './ai/subject-profile'
import type { JemmaDb, Json, Tables } from './db'
import {
  MAX_BYTES,
  SAMPLE_ROWS,
  TableError,
  applyFix,
  canonicalFamily,
  countRows,
  findProblems,
  parseTable,
  strandLabel,
  strandOrder,
  type Counts,
  type FamilyChoice,
  type Fix,
} from './logic'
import {
  ImportRowSchema,
  ProblemSchema,
  StoredMappingSchema,
  type ExistingRecord,
  type ImportLearner,
  type ImportRow,
  type Problem,
  type StoredMapping,
} from './schemas/records'
import { maybe, ok } from './tools/context'

// The database side of bringing past records in: what the class looks like to an import, the file in its bucket, and the teacher's
// decisions on a file (check it, fix a row, say yes, say no). Shared by the three tools and by the web app's screens and actions.
// Service client only: every function checks the school itself.

/** The private bucket the files go in. */
export const RECORDS_BUCKET = 'records'

export type ImportRecordRow = Tables<'record_imports'>

export type ClassFacts = {
  classId: string
  className: string
  schoolId: string
  teacherId: string
  subject: string
  grade: number
  year: number
  /** The school's country code. */
  country: string
  learners: ImportLearner[]
  /** The strands a row can be placed in. Null: any short lowercase word. */
  families: FamilyChoice[] | null
}

/**
 * The strands a class offers, in this order of preference: the families of its approved topic map, else the strands this app knows for
 * the subject (in their order), else the families `subjectProfile` suggests for the subject, else none.
 */
export async function allowedFamilies(db: JemmaDb, classId: string, subject: string): Promise<FamilyChoice[] | null> {
  const maps = await ok(db.from('curriculum_maps').select('id').eq('class_id', classId).eq('status', 'approved').order('created_at', { ascending: false }).limit(1))
  if (maps[0]) {
    const topics = await ok(db.from('topics').select('family, term, position').eq('map_id', maps[0].id))
    const ordered = [...topics].sort((a, b) => a.term - b.term || a.position - b.position)
    // Read in their plain form, so a map that says `numbers` and `shape` offers the same strands as the records do (`whole_numbers`, `shapes`). Nothing stored changes.
    const families = [...new Set(ordered.map((t) => (t.family ? canonicalFamily(subject, t.family) : '')).filter((f) => !!f))]
    if (families.length > 0) return families.map((family) => ({ family, label: strandLabel(subject, family) }))
  }
  const known = strandOrder(subject)
  if (known.length > 0) return known.map((family) => ({ family, label: strandLabel(subject, family) }))
  const suggested = subjectProfile(subject).families
  return suggested ? suggested.map((family) => ({ family, label: strandLabel(subject, family) })) : null
}

/** What an import needs to know about a class: its subject, grade, year and country, its learners, and the strands it offers. */
export async function loadClassFacts(db: JemmaDb, classId: string): Promise<ClassFacts> {
  const cls = await ok(db.from('classes').select('id, school_id, teacher_id, name, grade, year, subject').eq('id', classId).single())
  const [school, enrolled] = await Promise.all([
    ok(db.from('schools').select('country').eq('id', cls.school_id).single()),
    ok(db.from('enrolments').select('child_id').eq('class_id', classId)),
  ])
  const ids = enrolled.map((e) => e.child_id)
  const kids = ids.length ? await ok(db.from('children').select('id, first_name, last_name, created_at').in('id', ids)) : []
  const learners = [...kids]
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
    .map((k) => ({ id: k.id, firstName: k.first_name, lastName: k.last_name }))
  return {
    classId: cls.id,
    className: cls.name,
    schoolId: cls.school_id,
    teacherId: cls.teacher_id,
    subject: cls.subject,
    grade: cls.grade,
    year: cls.year,
    country: school.country,
    learners,
    families: await allowedFamilies(db, classId, cls.subject),
  }
}

/** The records these learners already have, for the "repeats a record" check. */
export async function loadExisting(db: JemmaDb, childIds: string[]): Promise<ExistingRecord[]> {
  if (childIds.length === 0) return []
  const rows = await ok(db.from('learner_records').select('child_id, source, title, happened_on, year, term, marks, out_of, text, present, total').in('child_id', childIds))
  return rows.map((r) => ({ childId: r.child_id, source: r.source, title: r.title, happenedOn: r.happened_on, year: r.year, term: r.term, marks: r.marks, outOf: r.out_of, text: r.text, present: r.present, total: r.total }))
}

export async function loadImport(db: JemmaDb, importId: string): Promise<ImportRecordRow> {
  return ok(db.from('record_imports').select('*').eq('id', importId).single())
}

/** The text of the file a teacher brought in, from the private bucket. */
export async function readImportFile(db: JemmaDb, row: Pick<ImportRecordRow, 'file_path'>): Promise<string> {
  if (!row.file_path) throw new Error('this import has no file')
  const got = await db.storage.from(RECORDS_BUCKET).download(row.file_path)
  if (got.error || !got.data) throw new Error(`could not read the file: ${got.error?.message ?? 'no data'}`)
  return got.data.text()
}

/** What the model is shown about a file (and what an agent reads through `get_record_import`). */
export type ImportSample = {
  header: string[]
  sampleRows: string[][]
  rowCount: number
  blankLines: number
}

export function sampleOf(text: string): ImportSample {
  const table = parseTable(text)
  return { header: table.header, sampleRows: table.rows.slice(0, SAMPLE_ROWS).map((r) => r.cells), rowCount: table.rows.length, blankLines: table.blank }
}

// ---------------------------------------------------------------------------------------------------------------------
// What is stored, read back
// ---------------------------------------------------------------------------------------------------------------------

export type StoredImport = {
  mapping: StoredMapping | null
  rows: ImportRow[]
  problems: Problem[]
  counts: Counts
}

/** The jsonb of an import, checked. A column that does not parse reads as empty, never as something half true. */
export function storedOf(row: Pick<ImportRecordRow, 'mapping' | 'rows' | 'problems'>): StoredImport {
  const mapping = StoredMappingSchema.safeParse(row.mapping)
  const rows = ImportRowSchema.array().safeParse(row.rows)
  const problems = ProblemSchema.array().safeParse(row.problems)
  const r = rows.success ? rows.data : []
  const p = problems.success ? problems.data : []
  return { mapping: mapping.success ? mapping.data : null, rows: r, problems: p, counts: countRows(r, p) }
}

// ---------------------------------------------------------------------------------------------------------------------
// A new import
// ---------------------------------------------------------------------------------------------------------------------

export type NewImport = { schoolId: string; classId: string; userId: string; fileName: string; text: string }

const safeName = (name: string) => name.replace(/[^\w.-]+/g, '_').replace(/^_+/, '').slice(0, 80) || 'records.csv'

/**
 * Saves a file (or a pasted table) in the private bucket and makes the import row, status `drafting`. The size and the number of rows are
 * checked first, and the table must parse. The caller checks that the teacher teaches the class, and then asks the agent to read it.
 */
export async function createImport(db: JemmaDb, a: NewImport): Promise<{ ok: true; importId: string } | { ok: false; error: string }> {
  const fileName = a.fileName.trim().replace(/\s+/g, ' ').slice(0, 120) || 'Pasted table'
  if (new TextEncoder().encode(a.text).length > MAX_BYTES) return { ok: false, error: 'This file is bigger than 1 MB. Split it into smaller files.' }
  try {
    parseTable(a.text)
  } catch (e) {
    if (e instanceof TableError) return { ok: false, error: e.message }
    throw e
  }
  const cls = await maybe(db.from('classes').select('school_id').eq('id', a.classId).maybeSingle())
  if (!cls || cls.school_id !== a.schoolId) return { ok: false, error: 'That class is not at your school.' }
  const path = `${a.schoolId}/${a.classId}/${Date.now()}-${safeName(fileName)}`
  const up = await db.storage.from(RECORDS_BUCKET).upload(path, new TextEncoder().encode(a.text), { contentType: 'text/csv' })
  if (up.error) return { ok: false, error: 'Could not save the file. Try again.' }
  const made = await db.from('record_imports').insert({ school_id: a.schoolId, class_id: a.classId, created_by: a.userId, file_name: fileName, file_path: path, status: 'drafting' }).select('id').single()
  if (made.error || !made.data) {
    await db.storage.from(RECORDS_BUCKET).remove([path])
    return { ok: false, error: 'Could not save the file. Try again.' }
  }
  return { ok: true, importId: made.data.id }
}

// ---------------------------------------------------------------------------------------------------------------------
// The teacher's decisions
// ---------------------------------------------------------------------------------------------------------------------

export type Decided<T = object> = ({ ok: true } & T) | { ok: false; reason: string }

/** Closes the open "Check N past results" item of an import. */
export async function closeCheckItem(db: JemmaDb, importId: string): Promise<void> {
  await db.from('needs_you_items').update({ status: 'done' }).eq('kind', 'check_records').eq('ref_id', importId).eq('status', 'open')
}

/**
 * One fix on a file that is ready: pick the learner, change the strand, skip a row, or keep a repeat. The rows and the problems are
 * worked out again from the rows as they now stand, and against the records the learners have now.
 */
export async function applyImportFix(db: JemmaDb, importId: string, fix: Fix): Promise<Decided<{ counts: Counts }>> {
  const row = await maybe(db.from('record_imports').select('*').eq('id', importId).maybeSingle())
  if (!row) return { ok: false, reason: 'This file was not found.' }
  if (row.status !== 'ready') return { ok: false, reason: row.status === 'approved' ? 'This file was already added.' : 'This file is not ready to check.' }
  const stored = storedOf(row)
  if (!stored.mapping) return { ok: false, reason: 'This file is not ready to check.' }
  const facts = await loadClassFacts(db, row.class_id)
  const rows = applyFix(stored.rows, fix, { learners: facts.learners, families: facts.families, subject: facts.subject })
  const problems = findProblems(rows, { existing: await loadExisting(db, facts.learners.map((l) => l.id)), families: facts.families })
  const saved = await db.from('record_imports').update({ rows: rows as unknown as Json, problems: problems as unknown as Json }).eq('id', importId).eq('status', 'ready').select('id')
  if (saved.error || !saved.data?.length) return { ok: false, reason: 'Could not save that. Try again.' }
  return { ok: true, counts: countRows(rows, problems) }
}

/** "Discard": nothing is written to the learners' records. A file that was already added cannot be discarded. */
export async function discardImport(db: JemmaDb, importId: string): Promise<Decided> {
  const done = await db.from('record_imports').update({ status: 'discarded' }).eq('id', importId).in('status', ['drafting', 'ready', 'failed']).select('id')
  if (done.error) return { ok: false, reason: 'Could not discard this file. Try again.' }
  if (!done.data?.length) return { ok: false, reason: 'This file was already added or discarded.' }
  await closeCheckItem(db, importId)
  return { ok: true }
}

export type Approved = { importId: string; name: string; fileName: string; counts: Counts }

/**
 * The gate. A named teacher of the class says yes to THIS file: the import is marked approved with their name and the time, and the
 * decision is saved in `approvals` with the same name. Only a teacher of the class can do it, only once, and only for a file that
 * has something ready to add. If the decision cannot be logged, the file goes back to ready: no approval, no records.
 */
export async function approveImport(db: JemmaDb, a: { importId: string; userId: string; now?: () => Date }): Promise<Decided<Approved>> {
  const row = await maybe(db.from('record_imports').select('*').eq('id', a.importId).maybeSingle())
  if (!row) return { ok: false, reason: 'This file was not found.' }
  const cls = await maybe(db.from('classes').select('teacher_id').eq('id', row.class_id).maybeSingle())
  if (!cls || cls.teacher_id !== a.userId) return { ok: false, reason: 'Only the teacher of this class can add past records.' }
  const stored = storedOf(row)
  if (row.status === 'approved') return { ok: true, importId: row.id, name: row.approved_by_name ?? '', fileName: row.file_name, counts: stored.counts }
  if (row.status !== 'ready') return { ok: false, reason: row.status === 'discarded' ? 'This file was discarded.' : 'Jemma is still reading this file.' }
  if (stored.counts.ready === 0) return { ok: false, reason: 'Nothing is ready to add yet. Fix or skip the rows with a problem first.' }
  const profile = await maybe(db.from('profiles').select('display_name').eq('user_id', a.userId).maybeSingle())
  const name = profile?.display_name?.trim() || 'Someone'
  const at = (a.now ?? (() => new Date()))().toISOString()
  const moved = await db
    .from('record_imports')
    .update({ status: 'approved', approved_by: a.userId, approved_by_name: name, approved_at: at })
    .eq('id', a.importId)
    .eq('status', 'ready')
    .select('id')
  if (moved.error || !moved.data?.length) return { ok: false, reason: 'This file was already decided.' }
  const logged = await db
    .from('approvals')
    .insert({ school_id: row.school_id, kind: 'record_import', ref_id: row.id, decision: 'approved', decided_by: a.userId, decided_by_name: name, decided_at: at, note: row.file_name })
  if (logged.error) {
    await db.from('record_imports').update({ status: 'ready', approved_by: null, approved_by_name: null, approved_at: null }).eq('id', a.importId).eq('status', 'approved')
    return { ok: false, reason: 'Could not log your decision. Nothing was added. Try again.' }
  }
  return { ok: true, importId: row.id, name, fileName: row.file_name, counts: stored.counts }
}
