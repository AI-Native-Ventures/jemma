import { check, eventDone, list } from '../lib/checks'
import { childIdOf } from '../lib/find'
import {
  bannedCheck,
  collectLongView,
  droppedByTool,
  evidenceCheck,
  historyReadCheck,
  keysCheck,
  limitsCheck,
  savedInputs,
  termsCheck,
  type LongViewFacts,
} from '../lib/long-view'
import type { Task } from '../lib/types'

export type LongViewState = { childId: string }

/**
 * Stage `start`, Amina. Her records hold a struggle in fractions (Grade 5 Term 3 to Grade 6 Term 2) and a strength in
 * shapes, so code finds two candidates. The model only words them. The real event is `long_view.requested`.
 */
export const longViewPattern: Task<LongViewState, LongViewFacts> = {
  id: 'long-view-pattern',
  proves: "Jemma words the strengths and struggles that code found in a learner's records, and only those",
  job: 'long_view',
  stage: 'start',
  async prepare(ctx) {
    const childId = await childIdOf(ctx.admin, ctx.sandbox.schoolId, 'Amina')
    return { event: { type: 'long_view.requested', payload: { childId } }, state: { childId } }
  },
  collect: (ctx, prepared) => collectLongView(ctx, prepared.state.childId),
  checks(facts, _prepared, outcome) {
    return [
      eventDone(outcome),
      check('code finds at least one candidate for the learner (precondition)', facts.candidates.length > 0, `candidates: ${list(facts.candidates.map((c) => c.key))}`),
      historyReadCheck(outcome),
      keysCheck(facts, true),
      evidenceCheck(facts),
      limitsCheck(facts),
      bannedCheck(facts),
      termsCheck(facts),
      check('every saved pattern is a draft for the teacher', facts.patterns.length > 0 && facts.patterns.every((p) => p.status === 'draft'), `statuses: ${list(facts.patterns.map((p) => p.status))}`),
    ]
  },
  extras(_facts, _prepared, outcome) {
    return { modelListed: savedInputs(outcome.calls).length, droppedByTool: droppedByTool(outcome.calls).length }
  },
}
