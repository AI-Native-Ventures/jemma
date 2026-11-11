import { z } from 'zod'
import { DEFAULT_SUBJECT, bannedWords, sameSubject } from '../../logic'
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
 * What goes into `long_view_patterns.terms` for a candidate: its run, then the newer terms that followed it (oldest first),
 * each flagged `since: true`. No extra column is needed.
 */
export function storedTerms(c: Pick<PatternCandidate, 'terms' | 'since'>): LongViewStoredTerm[] {
  return [...c.terms, ...c.since.map(({ grade, year, term, percent, points }) => ({ grade, year, term, percent, points, since: true }))]
}

/** True when the stored terms are `now`, field for field (jsonb does not keep key order). */
function sameTerms(stored: unknown, now: LongViewStoredTerm[]): boolean {
  const parsed = LongViewStoredTermsSchema.safeParse(stored)
  if (!parsed.success || parsed.data.length !== now.length) return false
  return parsed.data.every((t, i) => {
    const n = now[i]!
    return t.grade === n.grade && t.year === n.year && t.term === n.term && t.percent === n.percent && t.points === n.points && !!t.since === !!n.since
  })
}

/** A pattern code found, as `screenPatterns` needs to know it: its key and subject, and the names from the data that the word check leaves alone. */
export type KnownPattern = { key: string; subject: string; exempt?: readonly string[] }

export type ScreenedPattern = { key: string; subject: string; title: string; statement: string; noteIds: string[] }
export type DroppedPattern = { key: string; subject?: string; reason: string }

/**
 * The rules a pattern's words must pass, with no database. `known` are the current candidates: a pattern is the pair (subject, key).
 * A pattern that names a subject and key the finder did not find is dropped. One that names no subject takes the only candidate with that key,
 * and is dropped when two subjects have it. Names that come from the data (`exempt`) are left out of the word check.
 * Returns what may be kept (text trimmed, note ids de-duplicated) and what was dropped, with the reason.
 */
export function screenPatterns(patterns: LongViewDraftPattern[], known: Iterable<KnownPattern>): { accepted: ScreenedPattern[]; dropped: DroppedPattern[] } {
  const candidates = [...known]
  const dropped: DroppedPattern[] = []
  const accepted: (ScreenedPattern & { exempt: readonly string[] })[] = []
  for (const p of patterns) {
    const named = p.subject?.trim() ? p.subject.trim() : undefined
    const withKey = candidates.filter((c) => c.key === p.key)
    const cand = named ? withKey.find((c) => sameSubject(c.subject, named)) : withKey.length === 1 ? withKey[0] : undefined
    const shown = named ? { subject: named } : {}
    if (!cand) {
      dropped.push({ key: p.key, ...shown, reason: !named && withKey.length > 1 ? 'the key is in more than one subject: name the subject' : 'no pattern in the records' })
      continue
    }
    if (accepted.some((a) => a.key === cand.key && a.subject === cand.subject)) {
      dropped.push({ key: p.key, subject: cand.subject, reason: 'listed twice' })
      continue
    }
    const title = p.title.trim()
    const statement = p.statement.trim()
    const banned = bannedWords(`${title}\n${statement}`, cand.exempt)
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
    if (reason) dropped.push({ key: p.key, subject: cand.subject, reason })
    else accepted.push({ key: cand.key, subject: cand.subject, title, statement, noteIds: [...new Set(p.noteIds ?? [])], exempt: cand.exempt ?? [] })
  }
  return { accepted: accepted.map(({ exempt: _exempt, ...a }) => a), dropped }
}

export const SaveLongViewOutputSchema = z.object({
  saved: z.number().int(),
  /** A pattern that was not kept, with the reason. This is what the tool log shows. */
  dropped: z.array(z.object({ key: z.string(), subject: z.string().optional(), reason: z.string() })),
  patterns: z.array(z.object({ id: z.string(), key: z.string(), subject: z.string(), status: LongViewStatusSchema })),
})
export type SaveLongViewOutput = z.infer<typeof SaveLongViewOutputSchema>

/** What a class needs to be asked about a learner's drafts. */
export type RouteClass = { id: string; teacher_id: string; subject: string; year: number }

/**
 * Who is asked to look at the drafts, by teacher. The drafts of a subject go to the teacher of the learner's class in THAT subject
 * (the newest year first, then the class the learner joined first); with no such class, to the teacher of the class the learner joined first.
 * `classIds` are the learner's classes, the one joined first at the front.
 */
export function reviewOwners(draftsBySubject: Map<string, number>, classes: RouteClass[], classIds: string[]): Map<string, number> {
  const out = new Map<string, number>()
  const joined = (c: RouteClass) => classIds.indexOf(c.id)
  const first = classes.find((c) => c.id === classIds[0])
  for (const [subject, drafts] of draftsBySubject) {
    if (drafts <= 0) continue
    const mine = classes.filter((c) => sameSubject(c.subject, subject)).sort((x, y) => y.year - x.year || joined(x) - joined(y))
    const owner = (mine[0] ?? first)?.teacher_id
    if (owner) out.set(owner, (out.get(owner) ?? 0) + drafts)
  }
  return out
}

/** The pattern row a candidate is stored in: a learner has one per kind, subject and strand. */
const rowKey = (subject: string, kind: string, family: string) => `${subject.trim().toLowerCase()}|${kind}|${family}`
/** A row an older version wrote has the default subject. */
const subjectOfRow = (row: { subject?: string | null }) => row.subject?.trim() || DEFAULT_SUBJECT

export const saveLongView = defineTool({
  name: 'save_long_view',
  description:
    "Save the words for a learner's Long view as drafts for the teacher. Give each pattern's key and subject (both copied from get_learner_history), a short title and a statement. The tool finds the terms and the marked evidence itself in the records, and drops a pattern that matches no record in that subject, uses a banned word or is too long. Nothing is shared until the teacher decides.",
  input: z.object({ childId: z.string() }).extend(LongViewDraftSchema.shape),
  output: SaveLongViewOutputSchema,
  async run(ctx, { childId, patterns }) {
    await assertInSchool(ctx, 'children', [childId])
    const own = await contextFor(ctx, 'children', childId)
    const { history, noteLabels, namesFrom } = await loadHistory(own, childId)
    const candidateOf = new Map(history.candidates.map((c) => [`${c.subject}|${c.key}`, c]))
    const existing = await ok(own.db.from('long_view_patterns').select('*').eq('child_id', childId))
    const now = own.now().toISOString()

    // What may be kept: the code decides, the model only words it. A note counts only if it is one of this child's notes.
    const known: KnownPattern[] = history.candidates.map((c) => ({ key: c.key, subject: c.subject, exempt: namesFrom(c.subject) }))
    const { accepted: screened, dropped } = screenPatterns(patterns, known)
    const accepted = screened.map((a) => ({
      ...a,
      notes: a.noteIds.filter((id) => noteLabels.has(id)).map((id): LongViewEvidence => ({ kind: 'note', id, label: noteLabels.get(id)! })),
    }))

    const saved: { id: string; key: string; subject: string; status: z.infer<typeof LongViewStatusSchema> }[] = []
    for (const a of accepted) {
      const cand = candidateOf.get(`${a.subject}|${a.key}`)!
      const row = existing.find((r) => rowKey(subjectOfRow(r), r.kind, r.family) === rowKey(cand.subject, cand.kind, cand.family))
      const evidence = [...cand.evidence, ...a.notes]
      const terms = storedTerms(cand)
      if (!row) {
        const made = await own.db
          .from('long_view_patterns')
          .insert({ child_id: childId, kind: cand.kind, subject: cand.subject, family: cand.family, title: a.title, statement: a.statement, terms, evidence, status: 'draft', active: true })
          .select('id')
          .single()
        if (made.error?.code === '23505' && made.error.message.includes('long_view_patterns_child_id_kind_family_key')) {
          // Until migration 0021 is applied the database still holds the old key (learner, kind, strand) and cannot keep the same strand name in two subjects.
          dropped.push({ key: a.key, subject: cand.subject, reason: 'the database still has its old key for this strand name (migration 0021 is not applied yet)' })
          continue
        }
        if (made.error) throw new Error(made.error.message)
        saved.push({ id: made.data.id, key: a.key, subject: cand.subject, status: 'draft' })
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
      saved.push({ id: row.id, key: a.key, subject: cand.subject, status })
    }

    // A pattern the records no longer show: a draft goes, anything the teacher touched is switched off.
    const live = new Set(history.candidates.map((c) => rowKey(c.subject, c.kind, c.family)))
    for (const row of existing) {
      if (live.has(rowKey(subjectOfRow(row), row.kind, row.family))) continue
      if (row.status === 'draft') await ok(own.db.from('long_view_patterns').delete().eq('id', row.id).select('id'))
      else if (row.active) await ok(own.db.from('long_view_patterns').update({ active: false, updated_at: now }).eq('id', row.id).select('id'))
    }

    // Ask the right teacher to look, once, while there is a draft to look at: for each subject, the teacher of the learner's class in that subject.
    const after = await ok(own.db.from('long_view_patterns').select('status, subject').eq('child_id', childId))
    const draftsBySubject = new Map<string, number>()
    for (const r of after) if (r.status === 'draft') draftsBySubject.set(subjectOfRow(r), (draftsBySubject.get(subjectOfRow(r)) ?? 0) + 1)
    const drafts = [...draftsBySubject.values()].reduce((n, c) => n + c, 0)
    const enrolments = await ok(own.db.from('enrolments').select('class_id, created_at').eq('child_id', childId).order('created_at'))
    const classIds = enrolments.map((e) => e.class_id)
    const classId = classIds[0]
    const classes = classIds.length ? await ok(own.db.from('classes').select('id, teacher_id, subject, year').in('id', classIds)) : []
    for (const [ownerId, count] of reviewOwners(draftsBySubject, classes, classIds)) {
      const open = await ok(
        own.db.from('needs_you_items').select('id').eq('owner_id', ownerId).eq('kind', 'review_long_view').eq('ref_id', childId).eq('status', 'open').limit(1),
      )
      if (open.length > 0) continue
      await ok(
        own.db
          .from('needs_you_items')
          .insert({
            owner_id: ownerId,
            school_id: own.schoolId,
            child_id: childId,
            kind: 'review_long_view',
            ref_id: childId,
            status: 'open',
            title: `Look at ${history.child.firstName}'s Long view`,
            detail: `${count} ${plural(count, 'pattern', 'patterns')} to check before anything is shared.`,
          })
          .select('id'),
      )
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
