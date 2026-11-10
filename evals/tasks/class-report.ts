import { eventDone } from '../lib/checks'
import { collectClassReport, reportChecks, snapshotReteach, type ClassReportFacts, type ClassReportState } from '../lib/class-report'
import { childIdOf, paperOf, testOf } from '../lib/find'
import type { Task } from '../lib/types'

/**
 * Stage `marked`: Class Test 1 is marked for five learners and the gaps are diagnosed. The real event is `paper.checked`
 * for one learner, and the job under test is `class_report`.
 */
export const classReport: Task<ClassReportState, ClassReportFacts> = {
  id: 'class-report',
  proves: 'Jemma writes a class report: a saved reteach plan about a real class gap, and a report copy that cites question numbers',
  job: 'class_report',
  stage: 'marked',
  async prepare(ctx) {
    const { classId, schoolId } = ctx.sandbox
    const test = await testOf(ctx.admin, classId)
    const paperId = await paperOf(ctx.admin, test.id, await childIdOf(ctx.admin, schoolId, 'Amina'))
    return {
      event: { type: 'paper.checked', payload: { paperId } },
      state: { classId, testId: test.id, paperId, before: await snapshotReteach(ctx, test.id) },
    }
  },
  collect: (ctx, prepared) => collectClassReport(ctx, prepared.state),
  checks: (facts, prepared, outcome) => [eventDone(outcome), ...reportChecks(facts, prepared.state, outcome)],
}
