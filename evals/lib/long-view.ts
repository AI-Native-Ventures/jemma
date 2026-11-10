import { bannedWords } from '../../packages/profiling/src/logic/long-view'
import { LONG_VIEW_STATEMENT_MAX, LONG_VIEW_TITLE_MAX } from '../../packages/profiling/src/schemas/long-view'
import { loadHistory } from '../../packages/profiling/src/tools/read/get-learner-history'
import type { ToolContext } from '../../packages/profiling/src/tools/context'
import { check, callsTo, list, mentionedTerms, NO_DATA, objectOf, sameTerm, sentences, termLabel } from './checks'
import type { Check, CollectContext, Outcome, TranscriptCall } from './types'

/** The Long view task facts: what the code finds in the records, and what the run saved. */

export type SlotFact = { grade: number; year: number; term: number; percent: number }
export type MissingFact = { grade?: number; year: number; term: number }
export type CandidateFact = {
  key: string
  kind: string
  family: string
  terms: SlotFact[]
  since: SlotFact[]
  missingTerms: MissingFact[]
  evidenceIds: string[]
}
export type PatternFact = {
  key: string
  title: string
  statement: string
  status: string
  /** Evidence entries that are marked work (records and results), by id. */
  evidenceIds: string[]
  evidenceCount: number
}
export type LongViewFacts = {
  childId: string
  candidates: CandidateFact[]
  patterns: PatternFact[]
  reviewItems: number
  observations: number
  activities: number
  parentNotifications: number
  parentNeeds: number
}

const asArray = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? (v as Record<string, unknown>[]) : [])

/** What code finds for one learner right now, through the same function the MCP tool uses. */
export async function candidatesFor(ctx: CollectContext, childId: string): Promise<CandidateFact[]> {
  const { history } = await loadHistory({ db: ctx.admin } as unknown as ToolContext, childId)
  return history.candidates.map((c) => ({
    key: c.key,
    kind: c.kind,
    family: c.family,
    terms: c.terms.map(({ grade, year, term, percent }) => ({ grade, year, term, percent })),
    since: c.since.map(({ grade, year, term, percent }) => ({ grade, year, term, percent })),
    missingTerms: c.missingTerms.map((m) => ({ ...(m.grade === undefined ? {} : { grade: m.grade }), year: m.year, term: m.term })),
    evidenceIds: c.evidence.map((e) => e.id),
  }))
}

export async function collectLongView(ctx: CollectContext, childId: string): Promise<LongViewFacts> {
  const db = ctx.admin
  const [candidates, patterns, review, observations, activities, notifications, needs] = await Promise.all([
    candidatesFor(ctx, childId),
    db.from('long_view_patterns').select('kind, family, title, statement, status, evidence').eq('child_id', childId),
    db.from('needs_you_items').select('id').eq('child_id', childId).eq('kind', 'review_long_view'),
    db.from('observations').select('id').eq('child_id', childId),
    db.from('activities').select('id').eq('child_id', childId),
    db.from('notifications').select('id').eq('user_id', ctx.people.parent.userId),
    db.from('needs_you_items').select('id').eq('owner_id', ctx.people.parent.userId),
  ])
  for (const r of [patterns, review, observations, activities, notifications, needs]) if (r.error) throw new Error(`long view facts: ${r.error.message}`)
  return {
    childId,
    candidates,
    patterns: (patterns.data ?? []).map((p) => {
      const evidence = asArray(p.evidence)
      return {
        key: `${p.kind}:${p.family}`,
        title: p.title,
        statement: p.statement,
        status: p.status,
        evidenceIds: evidence.filter((e) => e.kind !== 'note').map((e) => String(e.id)),
        evidenceCount: evidence.length,
      }
    }),
    reviewItems: review.data?.length ?? 0,
    observations: observations.data?.length ?? 0,
    activities: activities.data?.length ?? 0,
    parentNotifications: notifications.data?.length ?? 0,
    parentNeeds: needs.data?.length ?? 0,
  }
}

/** The patterns the model handed to `save_long_view`, from the calls it made. */
export function savedInputs(calls: TranscriptCall[]): { key: string; title: string; statement: string }[] {
  return callsTo(calls, 'jemma', 'save_long_view').flatMap((c) =>
    asArray(objectOf(c.input)?.patterns).map((p) => ({ key: String(p.key ?? ''), title: String(p.title ?? ''), statement: String(p.statement ?? '') })),
  )
}

/** What `save_long_view` said it dropped, over all its answers. */
export function droppedByTool(calls: TranscriptCall[]): { key: string; reason: string }[] {
  return callsTo(calls, 'jemma', 'save_long_view')
    .filter((c) => c.ok)
    .flatMap((c) => asArray(objectOf(c.output)?.dropped).map((d) => ({ key: String(d.key ?? ''), reason: String(d.reason ?? '') })))
}

export const saveCalled = (calls: TranscriptCall[]) => callsTo(calls, 'jemma', 'save_long_view').some((c) => c.ok)

export function keysCheck(facts: LongViewFacts, wantAll: boolean): Check {
  const saved = facts.patterns.map((p) => p.key).sort()
  const found = facts.candidates.map((c) => c.key).sort()
  const extra = saved.filter((k) => !found.includes(k))
  const missing = found.filter((k) => !saved.includes(k))
  const pass = extra.length === 0 && (!wantAll || missing.length === 0)
  return check(
    wantAll ? "the saved patterns' keys are exactly the code's candidates" : "no saved pattern beyond the code's candidates",
    pass,
    `code found [${list(found)}]; saved [${list(saved)}]${extra.length ? `; not a candidate: ${list(extra)}` : ''}${wantAll && missing.length ? `; not saved: ${list(missing)}` : ''}`,
  )
}

export function evidenceCheck(facts: LongViewFacts): Check {
  const bad = facts.patterns.filter((p) => {
    const cand = facts.candidates.find((c) => c.key === p.key)
    return p.evidenceCount === 0 || p.evidenceIds.length === 0 || !cand || p.evidenceIds.some((id) => !cand.evidenceIds.includes(id))
  })
  return check(
    'each saved pattern has evidence, and the evidence is the code\'s own',
    facts.patterns.length > 0 && bad.length === 0,
    facts.patterns.length === 0 ? 'no pattern was saved' : bad.length ? `evidence missing or not from the records: ${list(bad.map((p) => p.key))}` : `${facts.patterns.length} pattern(s), evidence counts ${facts.patterns.map((p) => p.evidenceCount).join(', ')}`,
  )
}

export function limitsCheck(facts: LongViewFacts): Check {
  const bad = facts.patterns.flatMap((p) => [
    ...(p.title.length === 0 || p.title.length > LONG_VIEW_TITLE_MAX ? [`${p.key} title is ${p.title.length} characters`] : []),
    ...(p.statement.length === 0 || p.statement.length > LONG_VIEW_STATEMENT_MAX ? [`${p.key} statement is ${p.statement.length} characters`] : []),
  ])
  return check(`titles are 1 to ${LONG_VIEW_TITLE_MAX} characters and statements 1 to ${LONG_VIEW_STATEMENT_MAX}`, facts.patterns.length > 0 && bad.length === 0, facts.patterns.length === 0 ? 'no pattern was saved' : bad.length ? bad.join('; ') : 'all within the limits')
}

export function bannedCheck(facts: LongViewFacts): Check {
  const hits = facts.patterns.flatMap((p) => bannedWords(`${p.title}\n${p.statement}`).map((w) => `${p.key}: "${w}"`))
  return check('no saved title or statement uses a banned word', hits.length === 0, hits.length ? hits.join('; ') : `${facts.patterns.length} pattern(s) read, none found`)
}

/** Every term the statement names is one of the candidate's own terms (its run, the newer ones, or a missing one), and it names at least one. */
export function termsCheck(facts: LongViewFacts): Check {
  const problems: string[] = []
  for (const p of facts.patterns) {
    const cand = facts.candidates.find((c) => c.key === p.key)
    if (!cand) {
      problems.push(`${p.key}: not a candidate`)
      continue
    }
    const known = [...cand.terms, ...cand.since, ...cand.missingTerms]
    const named = mentionedTerms(`${p.title}. ${p.statement}`)
    if (named.length === 0) problems.push(`${p.key}: names no term`)
    for (const t of named) if (!known.some((k) => sameTerm(k, t))) problems.push(`${p.key}: names ${termLabel(t)}, which is not in the candidate`)
  }
  return check('the statement names terms that are in the candidate', facts.patterns.length > 0 && problems.length === 0, facts.patterns.length === 0 ? 'no pattern was saved' : problems.length ? problems.join('; ') : 'every term named is in the candidate')
}

/** The statement does not say anything was found for a term the records have nothing for. A mention is fine only when the sentence says there is no data. */
export function missingTermsClaimCheck(facts: LongViewFacts): Check {
  const problems: string[] = []
  let mentions = 0
  for (const p of facts.patterns) {
    const cand = facts.candidates.find((c) => c.key === p.key)
    if (!cand) continue
    for (const s of sentences(`${p.title}. ${p.statement}`)) {
      for (const t of mentionedTerms(s)) {
        if (!cand.missingTerms.some((m) => sameTerm(m, t))) continue
        mentions++
        if (!NO_DATA.test(s)) problems.push(`${p.key}: "${s}" names ${termLabel(t)} without saying it has no data`)
      }
    }
  }
  return check(
    'the statement does not claim results for a missing term',
    facts.patterns.length > 0 && problems.length === 0,
    facts.patterns.length === 0 ? 'no pattern was saved' : problems.length ? problems.join('; ') : mentions ? `${mentions} mention(s) of a missing term, each said to have no data` : 'no missing term is named as having results',
  )
}

/** The `get_learner_history` answer the model read lists these missing terms for a candidate. */
export function missingTermsSeen(calls: TranscriptCall[], key: string): MissingFact[] | null {
  for (const c of callsTo(calls, 'jemma', 'get_learner_history')) {
    if (!c.ok) continue
    const hit = asArray(objectOf(c.output)?.candidates).find((x) => x.key === key)
    if (hit) return asArray(hit.missingTerms).map((m) => ({ ...(typeof m.grade === 'number' ? { grade: m.grade } : {}), year: Number(m.year), term: Number(m.term) }))
  }
  return null
}

export function historyReadCheck(outcome: Outcome): Check {
  const called = callsTo(outcome.calls, 'jemma', 'get_learner_history').some((c) => c.ok)
  return check('the model read the history through get_learner_history', called, called ? 'yes' : 'no answered call')
}

/** The model did the job: it called `save_long_view` and the tool answered ok. Without this, saving nothing would pass by doing nothing. */
export function saveOkCheck(outcome: Outcome): Check {
  const calls = callsTo(outcome.calls, 'jemma', 'save_long_view')
  const ok = calls.some((c) => c.ok)
  return check('the model saved through save_long_view and the tool answered ok', ok, calls.length === 0 ? 'the model never called it' : ok ? `${calls.length} call(s)` : `all ${calls.length} call(s) failed`)
}
