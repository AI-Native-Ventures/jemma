import { check, eventDone, list } from '../lib/checks'
import { childIdOf } from '../lib/find'
import { collectLongView, droppedByTool, saveCalled, saveOkCheck, savedInputs, type LongViewFacts } from '../lib/long-view'
import type { Task } from '../lib/types'
import type { LongViewState } from './long-view-pattern'

/**
 * Stage `start`, Sipho. His low fractions marks are mostly unclear handwriting, so code counts only one mark and finds
 * no candidate. The right answer is to say nothing: zero patterns, and still a finished job.
 */
export const longViewNothingToSay: Task<LongViewState, LongViewFacts> = {
  id: 'long-view-nothing-to-say',
  proves: 'When the records show no pattern, Jemma saves nothing and invents nothing',
  job: 'long_view',
  stage: 'start',
  async prepare(ctx) {
    const childId = await childIdOf(ctx.admin, ctx.sandbox.schoolId, 'Sipho')
    return { event: { type: 'long_view.requested', payload: { childId } }, state: { childId } }
  },
  collect: (ctx, prepared) => collectLongView(ctx, prepared.state.childId),
  checks(facts, _prepared, outcome) {
    return [
      eventDone(outcome),
      saveOkCheck(outcome),
      check('code finds no candidate for the learner (precondition)', facts.candidates.length === 0, `candidates: ${list(facts.candidates.map((c) => c.key))}`),
      check('zero patterns were saved', facts.patterns.length === 0, `saved: ${list(facts.patterns.map((p) => p.key))}`),
      check('no review item was opened for the teacher', facts.reviewItems === 0, `review items: ${facts.reviewItems}`),
    ]
  },
  extras(_facts, _prepared, outcome) {
    // Did the model itself offer a pattern that the save tool then had to drop?
    return {
      saveCalled: saveCalled(outcome.calls),
      modelListed: savedInputs(outcome.calls).length,
      droppedByTool: droppedByTool(outcome.calls).length,
    }
  },
}
