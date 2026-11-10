import { gooseModels } from '../../packages/runner/src/goose'
import { brief, check, callsTo, eventDone } from '../lib/checks'
import { collectClassReport, snapshotReteach, type ClassReportFacts, type ClassReportState } from '../lib/class-report'
import { childIdOf, paperOf, testOf } from '../lib/find'
import type { Task } from '../lib/types'

/** A model id OpenRouter does not have. */
export const MISSING_MODEL = 'nvidia/this-model-does-not-exist:free'

/**
 * Stage `marked`, job `class_report`, with a model list whose first entry does not exist and whose second is the real
 * model. The first attempt must fail, the runner must move on, and the report must be written once.
 */
export const modelDownRecovery: Task<ClassReportState & { realModel: string }, ClassReportFacts> = {
  id: 'model-down-recovery',
  proves: 'When the first model is down, the runner moves to the next one and the work is done once, not twice',
  job: 'class_report',
  stage: 'marked',
  async prepare(ctx) {
    const { classId, schoolId } = ctx.sandbox
    const test = await testOf(ctx.admin, classId)
    const paperId = await paperOf(ctx.admin, test.id, await childIdOf(ctx.admin, schoolId, 'Amina'))
    const realModel = gooseModels(process.env)[0]!
    return {
      event: { type: 'paper.checked', payload: { paperId } },
      models: [MISSING_MODEL, realModel],
      state: { classId, testId: test.id, paperId, before: await snapshotReteach(ctx, test.id), realModel },
    }
  },
  collect: (ctx, prepared) => collectClassReport(ctx, prepared.state),
  checks(facts, prepared, outcome) {
    const [first, second] = outcome.attempts
    const writes = callsTo(outcome.calls, 'jemma', 'class_gap_report').filter((c) => c.ok).length
    const r = facts.reteach
    const changed = !!r && (!prepared.state.before || prepared.state.before.why !== r.why || JSON.stringify(prepared.state.before.content) !== JSON.stringify(r.content))
    return [
      check('the first attempt, on the model that does not exist, failed', first?.model === MISSING_MODEL && first.status === 'failed' && !first.saved, first ? `model=${first.model}; status=${first.status}; saved=${first.saved}; said: ${brief(first.note, 120)}` : 'no attempt was made'),
      check('the runner moved to the next model', !!second && second.model === prepared.state.realModel, second ? `second attempt on ${second.model} (${second.status}); ${outcome.attempts.length} attempt(s) in all` : 'no second attempt'),
      eventDone(outcome),
      check('exactly one reteach plan exists for the test (no double write)', facts.reteachRows === 1, `rows=${facts.reteachRows}`),
      check('the save tool succeeded exactly once, and the plan is the new one', writes === 1 && changed, `class_gap_report answered ok ${writes} time(s); plan differs from the seeded one=${changed}`),
    ]
  },
  extras(_facts, _prepared, outcome) {
    return { attempts: outcome.attempts.length, firstAttemptSaid: brief(outcome.attempts[0]?.note ?? '', 120) }
  },
}
