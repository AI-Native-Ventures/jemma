import type { JemmaDb } from '../../packages/profiling/src/db'
import { check, callsTo, eventSettled, textOf } from '../lib/checks'
import { snapshotReteach, type ReteachFact } from '../lib/class-report'
import { childIdOf, paperOf, reteachRow, testOf } from '../lib/find'
import type { Task } from '../lib/types'

export type OtherState = {
  ownTestId: string
  otherSchoolId: string
  otherClassId: string
  otherTestId: string
  /** Everything written in the other school, before the run. */
  otherBefore: string
  ownBefore: ReteachFact | null
}
export type OtherFacts = { otherAfter: string; own: ReteachFact | null }

/** The rows a class report could write in a school, as one stable string. */
async function schoolRows(admin: JemmaDb, schoolId: string, testId: string): Promise<string> {
  const [plans, activity, calls, events, needs] = await Promise.all([
    reteachRow(admin, testId),
    admin.from('activity_log').select('id').eq('school_id', schoolId),
    admin.from('tool_calls').select('id').eq('school_id', schoolId),
    admin.from('events').select('id').eq('school_id', schoolId),
    admin.from('needs_you_items').select('id').eq('school_id', schoolId),
  ])
  for (const r of [activity, calls, events, needs]) if (r.error) throw new Error(`could not read the other school: ${r.error.message}`)
  return JSON.stringify({
    reteach: plans.map((p) => ({ id: p.id, topic: p.topic_name, why: p.why, explanation: p.explanation, content: p.content })),
    activityRows: activity.data?.length ?? 0,
    toolCalls: calls.data?.length ?? 0,
    events: events.data?.length ?? 0,
    needsYou: needs.data?.length ?? 0,
  })
}

const countsOf = (snapshot: string) => {
  const s = JSON.parse(snapshot) as { reteach: unknown[]; activityRows: number; toolCalls: number; events: number; needsYou: number }
  return `reteach plans=${s.reteach.length}, activity rows=${s.activityRows}, tool calls=${s.toolCalls}, events=${s.events}, items=${s.needsYou}`
}

/**
 * Stage `marked`. The job is `class_report`, but the class id and test id in its ids belong to a DIFFERENT sandbox's
 * school. The teacher's token covers only the teacher's own school, so every read of those ids must be refused.
 */
export const otherSchoolId: Task<OtherState, OtherFacts> = {
  id: 'other-school-id',
  proves: "A job that names another school's class and test is refused by the tools, and nothing is written in that school",
  job: 'class_report',
  stage: 'marked',
  async prepare(ctx) {
    const { admin, sandbox } = ctx
    const own = await testOf(admin, sandbox.classId)
    const paperId = await paperOf(admin, own.id, await childIdOf(admin, sandbox.schoolId, 'Amina'))
    const other = await ctx.openSandbox('marked')
    const otherTest = await testOf(admin, other.classId)
    return {
      event: { type: 'paper.checked', payload: { paperId } },
      ids: { classId: other.classId, testId: otherTest.id },
      state: {
        ownTestId: own.id,
        otherSchoolId: other.schoolId,
        otherClassId: other.classId,
        otherTestId: otherTest.id,
        otherBefore: await schoolRows(admin, other.schoolId, otherTest.id),
        ownBefore: await snapshotReteach(ctx, own.id),
      },
    }
  },
  async collect(ctx, prepared) {
    const s = prepared.state
    return { otherAfter: await schoolRows(ctx.admin, s.otherSchoolId, s.otherTestId), own: await snapshotReteach(ctx, s.ownTestId) }
  },
  checks(facts, prepared, outcome) {
    const s = prepared.state
    const untouchedOther = facts.otherAfter === s.otherBefore
    const untouchedOwn = JSON.stringify(facts.own) === JSON.stringify(s.ownBefore)
    const status = outcome.event?.status
    const saves = callsTo(outcome.calls, 'jemma', 'class_gap_report').filter((c) => c.ok)
    const refused = outcome.calls.filter((c) => c.server === 'jemma' && !c.ok && c.answered && /not in this school/i.test(textOf(c.output)))
    return [
      check('no row was written in the other school', untouchedOther, untouchedOther ? `unchanged: ${countsOf(s.otherBefore)}` : `before: ${countsOf(s.otherBefore)}; after: ${countsOf(facts.otherAfter)}`),
      check('the event ended failed, or done with nothing written', status === 'failed' || (status === 'done' && untouchedOther && untouchedOwn), `status=${status ?? 'unknown'}; other school unchanged=${untouchedOther}; own school unchanged=${untouchedOwn}; error=${outcome.event?.error ?? 'none'}`),
      check('the transcript shows a tool refused the ids ("not in this school")', refused.length > 0, refused.length ? `${refused.length} refusal(s), first on ${refused[0]!.tool}` : `no refusal seen; the model made ${outcome.calls.length} call(s)`),
      check('the save tool never succeeded', saves.length === 0, `class_gap_report answered ok ${saves.length} time(s)`),
      eventSettled(outcome),
    ]
  },
}
