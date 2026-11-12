import { z } from 'zod'
import { closeCheckItem, loadClassFacts, loadExisting, loadImport, storedOf } from '../../imports'
import { findProblems, recordDrafts } from '../../logic'
import { assertInSchool, contextFor, defineTool, logActivity, ok } from '../context'

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)
const CHUNK = 400

export const ImportLearnerRecordsOutputSchema = z.object({
  importId: z.string(),
  /** Records written now. */
  written: z.number().int(),
  /** Rows left out because a problem was still open when the teacher approved, or the learner is no longer in the class. */
  leftOut: z.number().int(),
  /** Records this file had already written. A second call writes nothing more. */
  alreadyWritten: z.number().int(),
  /** The learners who got a record: their Long view needs an update. */
  childIds: z.array(z.string()),
})
export type ImportLearnerRecordsOutput = z.infer<typeof ImportLearnerRecordsOutputSchema>

export const importLearnerRecords = defineTool({
  name: 'import_learner_records',
  description:
    "Add the rows of a checked past-records file to the learners' records. It refuses unless a named teacher of the class approved THIS file: the approval is read from the approvals log. Rows with an open problem are left out. Each record keeps the file name, the row number and who added it. A second call for the same file writes nothing more.",
  input: z.object({ importId: z.string() }),
  output: ImportLearnerRecordsOutputSchema,
  async run(ctx, { importId }) {
    await assertInSchool(ctx, 'record_imports', [importId])
    const own = await contextFor(ctx, 'record_imports', importId)
    const db = own.db
    const row = await loadImport(db, importId)

    // The gate. The import must say a teacher approved it, and the approvals log must hold that decision from the teacher of the class.
    if (row.status !== 'approved' || !row.approved_by || !row.approved_by_name) throw new Error('A named teacher of this class has to approve this file before it is added.')
    const cls = await ok(db.from('classes').select('teacher_id').eq('id', row.class_id).single())
    const decisions = await ok(db.from('approvals').select('decided_by, decision').eq('kind', 'record_import').eq('ref_id', importId).eq('decision', 'approved'))
    if (cls.teacher_id !== row.approved_by || !decisions.some((d) => d.decided_by === cls.teacher_id)) {
      throw new Error('A named teacher of this class has to approve this file before it is added.')
    }

    const before = await ok(db.from('learner_records').select('child_id').eq('import_id', importId))
    if (before.length > 0) {
      await closeCheckItem(db, importId)
      return { importId, written: 0, leftOut: 0, alreadyWritten: before.length, childIds: [...new Set(before.map((r) => r.child_id))] }
    }

    // The rows as the teacher left them, checked again against what the learners have now.
    const stored = storedOf(row)
    const facts = await loadClassFacts(db, row.class_id)
    const inClass = new Set(facts.learners.map((l) => l.id))
    const problems = findProblems(stored.rows, { existing: await loadExisting(db, [...inClass]), families: facts.families })
    const open = new Set(problems.map((p) => p.row))
    const ready = stored.rows.filter((r) => r.piece !== null && !r.skip && !open.has(r.n) && r.childId !== null && inClass.has(r.childId))
    const leftOut = stored.rows.filter((r) => r.piece !== null && !r.skip).length - ready.length

    const loggedAt = ctx.now().toISOString()
    const records = ready.flatMap((r) =>
      recordDrafts(r).map(({ source_row, ...d }) => ({
        ...d,
        school_id: row.school_id,
        child_id: r.childId!,
        quality: 'clear',
        logged_at: loggedAt,
        import_id: importId,
        source_row,
        added_by: row.approved_by,
        added_by_name: row.approved_by_name,
      })),
    )
    for (let i = 0; i < records.length; i += CHUNK) {
      const wrote = await db.from('learner_records').insert(records.slice(i, i + CHUNK))
      if (wrote.error) {
        // Nothing of a half written file stays: the rows go, the approval stays, and the teacher can try again.
        await db.from('learner_records').delete().eq('import_id', importId)
        throw new Error(`could not write the records: ${wrote.error.message}`)
      }
    }

    await closeCheckItem(db, importId)
    const learners = [...new Set(ready.map((r) => r.childId!))]
    if (records.length > 0) {
      await logActivity(own, {
        text: `Added ${records.length} past ${plural(records.length, 'record', 'records')} from ${row.file_name} to ${learners.length} ${plural(learners.length, 'learner', 'learners')}.`,
        tool: 'import_learner_records',
        classId: row.class_id,
      })
    }
    return { importId, written: records.length, leftOut, alreadyWritten: 0, childIds: learners }
  },
})
