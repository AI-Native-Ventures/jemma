import { classTest1Results, classTest1Scores } from '../../supabase/seed/fixtures/class-test-1'
import { brief, check, callsTo, eventDone, list } from '../lib/checks'
import { childIdOf, paperOf, testOf } from '../lib/find'
import type { Task } from '../lib/types'

const LEARNER = 'Amina'

export type PhotoState = {
  childId: string
  paperId: string
  expectedTotal: number
  /** What the sample paper shows: the answer written and whether the key marks it right. */
  expected: { n: number; answer: string; correct: boolean }[]
}
export type PhotoFacts = {
  paper: { status: string; total: number | null; childId: string | null; nameRead: string | null; error: string | null } | null
  results: { n: number; answerRead: string; correct: boolean; confidence: number }[]
  needsYou: number
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '').replace('.', ',')

/**
 * The `read_paper` job on goose with a photo. The open-weights model gets the paper as MCP image content through goose,
 * and nobody had verified that path. The sandbox is the `marked` stage with Amina's paper set back to "just snapped":
 * no learner on it, no marks, status queued, and her results removed. The real event is `paper.snapped`.
 *
 * Expected to be the weak task. It is run honestly and reported whatever happens.
 */
export const photoThroughGoose: Task<PhotoState, PhotoFacts> = {
  id: 'photo-through-goose',
  proves: 'Jemma reads a photographed test paper through goose and the open-weights model, and code marks it with the right total',
  job: 'read_paper',
  stage: 'marked',
  async prepare(ctx) {
    const { admin, sandbox } = ctx
    const childId = await childIdOf(admin, sandbox.schoolId, LEARNER)
    const test = await testOf(admin, sandbox.classId)
    const paperId = await paperOf(admin, test.id, childId)
    const expected = classTest1Results.filter((r) => r.childId === 'amina').map((r) => ({ n: r.n, answer: r.answerRead, correct: r.correct }))
    const gone = await admin.from('question_results').delete().eq('paper_id', paperId)
    if (gone.error) throw new Error(`could not clear the paper: ${gone.error.message}`)
    const reset = await admin.from('papers').update({ status: 'queued', child_id: null, name_read: null, total: null, error: null }).eq('id', paperId)
    if (reset.error) throw new Error(`could not reset the paper: ${reset.error.message}`)
    return { event: { type: 'paper.snapped', payload: { paperId } }, state: { childId, paperId, expectedTotal: classTest1Scores.amina!, expected } }
  },
  async collect(ctx, prepared) {
    const { paperId } = prepared.state
    const [paper, results, needs] = await Promise.all([
      ctx.admin.from('papers').select('status, total, child_id, name_read, error').eq('id', paperId).single(),
      ctx.admin.from('question_results').select('n, answer_read, correct, read_confidence').eq('paper_id', paperId).order('n'),
      ctx.admin.from('needs_you_items').select('id').eq('ref_id', paperId).eq('status', 'open'),
    ])
    if (paper.error) throw new Error(`could not read the paper: ${paper.error.message}`)
    if (results.error) throw new Error(`could not read the results: ${results.error.message}`)
    return {
      paper: { status: paper.data.status, total: paper.data.total, childId: paper.data.child_id, nameRead: paper.data.name_read, error: paper.data.error },
      results: (results.data ?? []).map((r) => ({ n: r.n, answerRead: r.answer_read, correct: r.correct, confidence: r.read_confidence })),
      needsYou: needs.data?.length ?? 0,
    }
  },
  checks(facts, prepared, outcome) {
    const s = prepared.state
    const got = callsTo(outcome.calls, 'jemma', 'get_paper')
    const types = outcome.contentTypes['jemma__get_paper'] ?? []
    const marks = callsTo(outcome.calls, 'jemma', 'mark_paper')
    const p = facts.paper
    const wrong = s.expected.flatMap((e) => {
      const row = facts.results.find((r) => r.n === e.n)
      if (!row) return [`Q${e.n} not read`]
      return row.correct === e.correct ? [] : [`Q${e.n} read "${brief(row.answerRead, 20)}", marked ${row.correct ? 'right' : 'wrong'}, the paper shows "${e.answer}"`]
    })
    return [
      eventDone(outcome),
      check('get_paper answered ok', got.some((c) => c.ok), `${got.length} call(s)`),
      check('the photo reached the model through goose as image content', types.includes('image'), types.length ? `get_paper answers carried: ${types.join(', ')}` : 'no get_paper answer in the stream'),
      check('mark_paper answered ok', marks.some((c) => c.ok), marks.length === 0 ? 'the model never called it' : `${marks.length} call(s); ${marks.some((c) => c.ok) ? 'ok' : `all failed, last: ${brief(String(marks.at(-1)?.output ?? ''), 120)}`}`),
      check('the paper ends marked', p?.status === 'marked', p ? `status=${p.status}; error=${p.error ?? 'none'}; open items=${facts.needsYou}` : 'no paper row'),
      check('the paper has the right total, for the right learner', !!p && p.total === s.expectedTotal && p.childId === s.childId, p ? `total=${p.total ?? 'none'} (the sample is ${s.expectedTotal}); learner matched=${p.childId === s.childId}; name read=${p.nameRead ?? 'none'}` : 'no paper row'),
      check('every answer is marked as the key says', wrong.length === 0, wrong.length ? list(wrong, 4) : `${s.expected.length} answers, all marked right or wrong as the sample says`),
    ]
  },
  extras(facts, prepared) {
    const exact = prepared.state.expected.filter((e) => facts.results.some((r) => r.n === e.n && norm(r.answerRead) === norm(e.answer))).length
    return { answersReadExactly: exact, answersExpected: prepared.state.expected.length, totalRead: facts.paper?.total ?? null }
  },
}
