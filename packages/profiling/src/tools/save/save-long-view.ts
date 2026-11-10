import { z } from 'zod'
import { bannedWords } from '../../logic/long-view'
import {
  LONG_VIEW_STATEMENT_MAX,
  LONG_VIEW_TITLE_MAX,
  LongViewDraftSchema,
  LongViewEvidenceListSchema,
  LongViewStatusSchema,
  LongViewStoredTermsSchema,
  type LongViewDraftPattern,
  type LongViewEvidence,
  type LongViewStoredTerm,
  type PatternCandidate,
} from '../../schemas/long-view'
import type { Database } from '../../db/types'
import { assertInSchool, contextFor, defineTool, logActivity, ok } from '../context'
import { loadHistory } from '../read/get-learner-history'

type PatternUpdate = Database['public']['Tables']['long_view_patterns']['Update']

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

const quoted = (words: string[]) => words.map((w) => `"${w}"`).join(', ')

/**
 * What goes into `long_view_patterns.terms` for a candidate: its run, and when the pattern ended one term before the newest,
 * that newest result as a last entry flagged `sinceThen: true`. No extra column is needed.
 */
export function storedTerms(c: Pick<PatternCandidate, 'terms' | 'sinceThen'>): LongViewStoredTerm[] {
  if (!c.sinceThen) return c.terms
  const { grade, year, term, percent, points } = c.sinceThen
  return [...c.terms, { grade, year, term, percent, points, sinceThen: true }]
}

/** True when the stored terms are `now`, field for field (jsonb does not keep key order). */
function sameTerms(stored: unknown, now: LongViewStoredTerm[]): boolean {
  const parsed = LongViewStoredTermsSchema.safeParse(stored)
  if (!parsed.success || parsed.data.length !== now.length) return false
  return parsed.data.every((t, i) => {
    const n = now[i]!
    return t.grade === n.grade && t.year === n.year && t.term === n.term && t.percent === n.percent && t.points === n.points && !!t.sinceThen === !!n.sinceThen
  })
}

/**
 * The rules a pattern's words must pass, with no database. `keys` are the current candidates' keys.
 * Returns what may be kept (text trimmed, note ids de-duplicated) and what was dropped, with the reason.
 */
export function screenPatterns(
  patterns: LongViewDraftPattern[],
  keys: Iterable<string>,
): { accepted: { key: string; title: string; statement: string; noteIds: string[] }[]; dropped: { key: string; reason: string }[] } {
  const known = new Set(keys)
  const dropped: { key: string; reason: string }[] = []
  const accepted: { key: string; title: string; statement: string; noteIds: string[] }[] = []
  for (const p of patterns) {
    if (!known.has(p.key)) {
      dropped.push({ key: p.key, reason: 'no pattern in the records' })
      continue
    }
    if (accepted.some((a) => a.key === p.key)) {
      dropped.push({ key: p.key, reason: 'listed twice' })
      continue
    }
    const title = p.title.trim()
    const statement = p.statement.trim()
    const banned = bannedWords(`${title}\n${statement}`)
    const reason =
      !title || !statement
        ? 'the title or statement is empty'
        : title.length > LONG_VIEW_TITLE_MAX
          ? `the title is longer than ${LONG_VIEW_TITLE_MAX} characters`
          : statement.length > LONG_VIEW_STATEMENT_MAX
            ? `the statement is longer than ${LONG_VIEW_STATEMENT_MAX} characters`
            : banned.length
              ? `uses the ${plural(banned.length, 'word', 'words')} ${quoted(banned)}`
              : null
    if (reason) dropped.push({ key: p.key, reason })
    else accepted.push({ key: p.key, title, statement, noteIds: [...new Set(p.noteIds ?? [])] })
  }
  return { accepted, dropped }
}

export const SaveLongViewOutputSchema = z.object({
  saved: z.number().int(),
  dropped: z.array(z.object({ key: z.string(), reason: z.string() })),
  patterns: z.array(z.object({ id: z.string(), key: z.string(), status: LongViewStatusSchema })),
})
export type SaveLongViewOutput = z.infer<typeof SaveLongViewOutputSchema>

export const saveLongView = defineTool({
  name: 'save_long_view',
  description:
    "Save the words for a learner's Long view as drafts for the teacher. Give each pattern's key, a short title and a statement. The tool finds the terms and the marked evidence itself in the records, and drops a pattern that matches no record, uses a banned word or is too long. Nothing is shared until the teacher decides.",
  input: z.object({ childId: z.string() }).extend(LongViewDraftSchema.shape),
  output: SaveLongViewOutputSchema,
  async run(ctx, { childId, patterns }) {
    await assertInSchool(ctx, 'children', [childId])
    const own = await contextFor(ctx, 'children', childId)
    const { history, noteLabels } = await loadHistory(own, childId)
    const candidates = new Map(history.candidates.map((c) => [c.key, c]))
    const existing = await ok(own.db.from('long_view_patterns').select('*').eq('child_id', childId))
    const now = own.now().toISOString()

    // What may be kept: the code decides, the model only words it. A note counts only if it is one of this child's notes.
    const { accepted: screened, dropped } = screenPatterns(patterns, candidates.keys())
    const accepted = screened.map((a) => ({
      ...a,
      notes: a.noteIds.filter((id) => noteLabels.has(id)).map((id): LongViewEvidence => ({ kind: 'note', id, label: noteLabels.get(id)! })),
    }))

    const saved: { id: string; key: string; status: z.infer<typeof LongViewStatusSchema> }[] = []
    for (const a of accepted) {
      const cand = candidates.get(a.key)!
      const row = existing.find((r) => r.kind === cand.kind && r.family === cand.family)
      const evidence = [...cand.evidence, ...a.notes]
      const terms = storedTerms(cand)
      if (!row) {
        const made = await ok(
          own.db
            .from('long_view_patterns')
            .insert({ child_id: childId, kind: cand.kind, family: cand.family, title: a.title, statement: a.statement, terms, evidence, status: 'draft', active: true })
            .select('id')
            .single(),
        )
        saved.push({ id: made.id, key: a.key, status: 'draft' })
        continue
      }
      let patch: PatternUpdate | null = null
      let status = LongViewStatusSchema.parse(row.status)
      if (status === 'draft') {
        patch = { title: a.title, statement: a.statement, terms, evidence, active: true }
      } else if (status === 'approved' || status === 'discussed') {
        // The teacher has seen these words. They stay, and so do the notes they cited. Only the numbers behind them are renewed.
        const kept = LongViewEvidenceListSchema.parse(row.evidence).filter((e) => e.kind === 'note')
        patch = { terms, evidence: [...cand.evidence, ...kept], active: true }
      } else if (!sameTerms(row.terms, terms)) {
        // Dismissed, but the records have moved on: the teacher is asked again.
        patch = { status: 'draft', title: a.title, statement: a.statement, terms, evidence, active: true, dismissed_by: null, dismissed_at: null }
        status = 'draft'
      } else if (!row.active) {
        patch = { active: true }
      }
      if (patch) await ok(own.db.from('long_view_patterns').update({ ...patch, updated_at: now }).eq('id', row.id).select('id'))
      saved.push({ id: row.id, key: a.key, status })
    }

    // A pattern the records no longer show: a draft goes, anything the teacher touched is switched off.
    const live = new Set(history.candidates.map((c) => `${c.kind}:${c.family}`))
    for (const row of existing) {
      if (live.has(`${row.kind}:${row.family}`)) continue
      if (row.status === 'draft') await ok(own.db.from('long_view_patterns').delete().eq('id', row.id).select('id'))
      else if (row.active) await ok(own.db.from('long_view_patterns').update({ active: false, updated_at: now }).eq('id', row.id).select('id'))
    }

    // Ask the class teacher to look, once, while there is a draft to look at.
    const after = await ok(own.db.from('long_view_patterns').select('status').eq('child_id', childId))
    const drafts = after.filter((r) => r.status === 'draft').length
    const enrolments = await ok(own.db.from('enrolments').select('class_id, created_at').eq('child_id', childId).order('created_at').limit(1))
    const classId = enrolments[0]?.class_id
    const cls = classId ? await ok(own.db.from('classes').select('teacher_id').eq('id', classId).single()) : null
    if (drafts > 0 && cls) {
      const open = await ok(
        own.db.from('needs_you_items').select('id').eq('owner_id', cls.teacher_id).eq('kind', 'review_long_view').eq('ref_id', childId).eq('status', 'open').limit(1),
      )
      if (open.length === 0) {
        await ok(
          own.db
            .from('needs_you_items')
            .insert({
              owner_id: cls.teacher_id,
              school_id: own.schoolId,
              child_id: childId,
              kind: 'review_long_view',
              ref_id: childId,
              status: 'open',
              title: `Look at ${history.child.firstName}'s Long view`,
              detail: `${drafts} ${plural(drafts, 'pattern', 'patterns')} to check before anything is shared.`,
            })
            .select('id'),
        )
      }
    }

    // One class level line: no name, no child.
    await logActivity(own, {
      text: `Updated a learner's Long view. ${drafts === 0 ? 'Nothing waits for you.' : `${drafts} ${plural(drafts, 'pattern waits', 'patterns wait')} for you.`}`,
      tool: 'save_long_view',
      classId,
    })

    return { saved: saved.length, dropped, patterns: saved }
  },
})
