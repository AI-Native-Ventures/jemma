import { check, eventDone, list, sameTerm, termLabel } from '../lib/checks'
import { childIdOf } from '../lib/find'
import {
  bannedCheck,
  collectLongView,
  droppedByTool,
  historyReadCheck,
  keysCheck,
  limitsCheck,
  missingTermsClaimCheck,
  missingTermsSeen,
  type LongViewFacts,
} from '../lib/long-view'
import type { Task } from '../lib/types'
import type { LongViewState } from './long-view-pattern'

/** The pattern Thabo's records make. */
export const THABO_KEY = 'strength:data'

/**
 * Stage `start`, Thabo. He was at another school for two terms, so his records have no data for Grade 5 Terms 2 and 3
 * inside his data strength. The model must say so, not fill the gap.
 */
export const messyRecords: Task<LongViewState, LongViewFacts> = {
  id: 'messy-records',
  proves: 'With two terms missing from the records, Jemma still words the pattern and does not claim results for the missing terms',
  job: 'long_view',
  stage: 'start',
  async prepare(ctx) {
    const childId = await childIdOf(ctx.admin, ctx.sandbox.schoolId, 'Thabo')
    return { event: { type: 'long_view.requested', payload: { childId } }, state: { childId } }
  },
  collect: (ctx, prepared) => collectLongView(ctx, prepared.state.childId),
  checks(facts, _prepared, outcome) {
    const cand = facts.candidates.find((c) => c.key === THABO_KEY)
    const seen = missingTermsSeen(outcome.calls, THABO_KEY)
    const want = cand?.missingTerms ?? []
    const listed = !!seen && want.length > 0 && want.length === seen.length && want.every((w) => seen.some((s) => s.year === w.year && sameTerm(s, w)))
    return [
      eventDone(outcome),
      check('code finds the pattern and two missing terms for the learner (precondition)', !!cand && want.length === 2, cand ? `${THABO_KEY}; missing: ${list(want.map(termLabel))}` : `no ${THABO_KEY} candidate; code found [${list(facts.candidates.map((c) => c.key))}]`),
      historyReadCheck(outcome),
      check('the learner\'s pattern was saved', facts.patterns.some((p) => p.key === THABO_KEY), `saved: ${list(facts.patterns.map((p) => p.key))}`),
      keysCheck(facts, false),
      missingTermsClaimCheck(facts),
      check('missingTerms from the tool lists the missing terms', listed, !seen ? 'the model never read the candidate through get_learner_history' : `tool listed [${list(seen.map(termLabel))}]; records have [${list(want.map(termLabel))}]`),
      limitsCheck(facts),
      bannedCheck(facts),
    ]
  },
  extras(facts, _prepared, outcome) {
    return { droppedByTool: droppedByTool(outcome.calls).length, missingTermsInRecords: facts.candidates.find((c) => c.key === THABO_KEY)?.missingTerms.length ?? 0 }
  },
}
