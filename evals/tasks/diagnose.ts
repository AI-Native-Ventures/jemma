import type { JemmaDb } from '../../packages/profiling/src/db'
import { check, callsTo, eventDone, list } from '../lib/checks'
import { childIdOf, paperOf, testOf } from '../lib/find'
import type { Task } from '../lib/types'

export type DiagnoseState = {
  childId: string
  paperId: string
  testId: string
  /** The wrong answers on the paper, by result id. */
  wrongResultIds: string[]
  /** Topics a gap may be opened for: the topics of his wrong answers, and the gap topics the seed's own diagnosis chose for them. */
  allowedTopics: string[]
  /** The other learners' diagnosis rows and gaps as they were before the run. */
  othersBefore: string
}

export type DiagnoseFacts = {
  results: { id: string; n: number; correct: boolean; misconception: string | null; gapTopic: string | null }[]
  gaps: { topicName: string; stage: string; evidence: string[] }[]
  othersAfter: string
}

const LEARNER = 'Thabo'

/** The diagnosis rows and gaps of everyone but `childId`, as one stable string. */
async function othersSnapshot(admin: JemmaDb, testId: string, childId: string): Promise<string> {
  const papers = await admin.from('papers').select('id, child_id').eq('test_id', testId).neq('child_id', childId)
  if (papers.error) throw new Error(`could not read the other papers: ${papers.error.message}`)
  const ids = (papers.data ?? []).map((p) => p.id)
  const kids = (papers.data ?? []).map((p) => p.child_id).filter((c): c is string => !!c)
  const [results, gaps] = await Promise.all([
    admin.from('question_results').select('id, misconception, gap_topic_id').in('paper_id', ids).order('id'),
    admin.from('gaps').select('id, topic_name, stage, evidence').in('child_id', kids).order('id'),
  ])
  if (results.error) throw new Error(`could not read the other results: ${results.error.message}`)
  if (gaps.error) throw new Error(`could not read the other gaps: ${gaps.error.message}`)
  return JSON.stringify({ results: results.data, gaps: gaps.data })
}

/**
 * Stage `marked`, learner Thabo. The seed's `marked` stage has every paper already diagnosed, so the task sets one
 * learner back to "marked but not yet diagnosed" with plain deletes and updates: his wrong answers lose their
 * misconception and gap topic, and his gaps are removed. The real event is `paper.checked` for his paper, which plans
 * the `diagnose` job first.
 *
 * The model names the answers it diagnoses by `resultId`, which `get_class_results` returns since the operator packet
 * (P54). Without result ids this job cannot save through an agent, so `extras` records whether the tool handed them over.
 */
export const diagnose: Task<DiagnoseState, DiagnoseFacts> = {
  id: 'diagnose',
  proves: "Jemma finds the mistake behind each of one learner's wrong answers and opens gaps only for topics she or he got wrong",
  job: 'diagnose',
  stage: 'marked',
  async prepare(ctx) {
    const { admin, sandbox } = ctx
    const childId = await childIdOf(admin, sandbox.schoolId, LEARNER)
    const test = await testOf(admin, sandbox.classId)
    const paperId = await paperOf(admin, test.id, childId)
    const rows = await admin.from('question_results').select('id, correct, topic_name, gap_topic_id').eq('paper_id', paperId)
    if (rows.error) throw new Error(`could not read ${LEARNER}'s results: ${rows.error.message}`)
    const wrong = (rows.data ?? []).filter((r) => !r.correct)
    if (wrong.length === 0) throw new Error(`${LEARNER} has no wrong answer in the seed`)
    const topicIds = [...new Set(wrong.map((r) => r.gap_topic_id).filter((id): id is string => !!id))]
    const topics = topicIds.length ? await admin.from('topics').select('id, name').in('id', topicIds) : { data: [], error: null }
    if (topics.error) throw new Error(`could not read topics: ${topics.error.message}`)
    const allowedTopics = [...new Set([...wrong.map((r) => r.topic_name), ...(topics.data ?? []).map((t) => t.name)])]
    const othersBefore = await othersSnapshot(admin, test.id, childId)

    const clear = await admin.from('question_results').update({ misconception: null, gap_topic_id: null }).eq('paper_id', paperId)
    if (clear.error) throw new Error(`could not clear the diagnosis: ${clear.error.message}`)
    const gone = await admin.from('gaps').delete().eq('child_id', childId)
    if (gone.error) throw new Error(`could not remove the gaps: ${gone.error.message}`)
    return {
      event: { type: 'paper.checked', payload: { paperId } },
      state: { childId, paperId, testId: test.id, wrongResultIds: wrong.map((r) => r.id), allowedTopics, othersBefore },
    }
  },
  async collect(ctx, prepared) {
    const { childId, paperId, testId } = prepared.state
    const [results, gaps] = await Promise.all([
      ctx.admin.from('question_results').select('id, n, correct, misconception, gap_topic_id').eq('paper_id', paperId).order('n'),
      ctx.admin.from('gaps').select('topic_name, stage, evidence').eq('child_id', childId),
    ])
    for (const r of [results, gaps]) if (r.error) throw new Error(`diagnose facts: ${r.error.message}`)
    const topicIds = [...new Set((results.data ?? []).map((r) => r.gap_topic_id).filter((id): id is string => !!id))]
    const topics = topicIds.length ? await ctx.admin.from('topics').select('id, name').in('id', topicIds) : { data: [], error: null }
    if (topics.error) throw new Error(`diagnose facts: ${topics.error.message}`)
    const name = new Map((topics.data ?? []).map((t) => [t.id, t.name]))
    return {
      results: (results.data ?? []).map((r) => ({ id: r.id, n: r.n, correct: r.correct, misconception: r.misconception, gapTopic: r.gap_topic_id ? (name.get(r.gap_topic_id) ?? null) : null })),
      gaps: (gaps.data ?? []).map((g) => ({ topicName: g.topic_name, stage: g.stage, evidence: g.evidence })),
      othersAfter: await othersSnapshot(ctx.admin, testId, childId),
    }
  },
  checks(facts, prepared, outcome) {
    const s = prepared.state
    const out = [eventDone(outcome)]
    const saved = callsTo(outcome.calls, 'jemma', 'update_learner_profile')
    const savedOk = saved.some((c) => c.ok)
    const lastError = saved.filter((c) => !c.ok && c.answered).map((c) => String(c.output ?? '')).at(-1)
    out.push(check('update_learner_profile answered ok', savedOk, saved.length === 0 ? 'the model never called it' : savedOk ? `${saved.length} call(s)` : `all ${saved.length} call(s) failed; last error: ${String(lastError ?? 'no answer').slice(0, 140)}`))
    const wrong = facts.results.filter((r) => !r.correct)
    const bare = wrong.filter((r) => !r.misconception?.trim())
    out.push(check("every wrong answer of the learner got a misconception", wrong.length > 0 && bare.length === 0, bare.length ? `no misconception on Q${bare.map((r) => r.n).join(', Q')} of ${wrong.length} wrong answers` : `${wrong.length} wrong answers, each with one`))
    const allowed = new Set(s.allowedTopics.map((t) => t.toLowerCase()))
    const stray = facts.gaps.filter((g) => !allowed.has(g.topicName.toLowerCase())).map((g) => g.topicName)
    out.push(check('gaps are opened only for topics where the learner has wrong answers, and at least one is opened', facts.gaps.length > 0 && stray.length === 0, facts.gaps.length === 0 ? 'no gap was opened' : stray.length ? `gap on a topic with no wrong answer: ${list(stray)}` : `${facts.gaps.length} gap(s): ${list(facts.gaps.map((g) => g.topicName))}`))
    const own = new Set(s.wrongResultIds)
    const foreign = facts.gaps.flatMap((g) => g.evidence).filter((id) => !own.has(id))
    const empty = facts.gaps.filter((g) => g.evidence.length === 0).map((g) => g.topicName)
    out.push(check("every gap's evidence ids are this learner's wrong answers", facts.gaps.length > 0 && foreign.length === 0 && empty.length === 0, facts.gaps.length === 0 ? 'no gap was opened' : foreign.length ? `not his: ${list(foreign, 3)}` : empty.length ? `no evidence on: ${list(empty)}` : 'all evidence ids are his wrong answers'))
    out.push(check("nobody else's diagnosis or gaps were touched", facts.othersAfter === s.othersBefore, facts.othersAfter === s.othersBefore ? 'unchanged' : 'the other learners rows changed'))
    return out
  },
  extras(_facts, _prepared, outcome) {
    const get = callsTo(outcome.calls, 'jemma', 'get_class_results').find((c) => c.ok)
    const text = JSON.stringify(get?.output ?? '')
    // Did the read tool hand over result ids? (It does since P54; this keeps the fact visible in the result file.)
    return { readToolGaveResultIds: get ? /"resultId"/.test(text) : null }
  },
}
