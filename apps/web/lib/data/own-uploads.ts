import type { JemmaDb } from '@jemma/profiling/db'
import { dayLabel, leftOutOf, ownTestState, type OwnCurriculumRow, type OwnTestRow, type OwnTestView } from '@/app/k/own/format'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { myChild } from './p27'

// What the learner's "Add your own work" screens read (P97): the list of what was added and the screen of one marked test. Everything here is read
// with the service client (a learner's own session cannot read marked answers or the events), and every read is by the id of the private twin of the
// request or by one paper that is proven to be the twin's. The twin is found the way every learner screen finds the learner (`myChild`).

/** The newest `own_test.snapped` event of one paper, or null. A read that fails answers null: a screen never waits on it. */
export async function newestOwnTestEvent(admin: JemmaDb, paperId: string): Promise<{ id: string; status: string } | null> {
  try {
    const { data } = await admin
      .from('events')
      .select('id, status')
      .eq('type', 'own_test.snapped')
      .eq('payload->>paperId', paperId)
      .order('created_at', { ascending: false })
      .limit(1)
    return data?.[0] ?? null
  } catch {
    return null
  }
}

export type OwnHome = { workspace: 'school'; firstName: string } | { workspace: 'own'; firstName: string; tests: OwnTestRow[]; curricula: OwnCurriculumRow[] }

/**
 * The home of "Add your own work". In My school it is only the first name (the screen says to switch). In My own it is what the learner added: the
 * marked tests, newest first, each with its state and, once marked, its result (ticks of all the questions that were read), and the own curricula.
 */
export async function getOwnHome(): Promise<OwnHome> {
  const { child } = await myChild()
  if (!child.private_of) return { workspace: 'school', firstName: child.first_name }
  const admin = createSupabaseAdmin()
  const [papers, events] = await Promise.all([
    admin.from('papers').select('id, status, created_at').eq('child_id', child.id).is('test_id', null).eq('kind', 'test').order('created_at', { ascending: false }),
    admin.from('events').select('status, payload, created_at').eq('type', 'own_test.snapped').eq('payload->>childId', child.id).order('created_at', { ascending: false }),
  ])
  // The newest event of each paper decides whether a paper that is still being read has been given up on.
  const eventOf = new Map<string, string>()
  for (const e of events.data ?? []) {
    const id = (e.payload as { paperId?: unknown } | null)?.paperId
    if (typeof id === 'string' && !eventOf.has(id)) eventOf.set(id, e.status)
  }
  const list = papers.data ?? []
  const markedIds = list.filter((p) => p.status === 'marked').map((p) => p.id)
  const results = markedIds.length > 0 ? ((await admin.from('question_results').select('paper_id, correct').in('paper_id', markedIds)).data ?? []) : []
  const tests: OwnTestRow[] = list.map((p) => {
    const state = ownTestState({ paper: p.status, event: eventOf.get(p.id) ?? null })
    const mine = results.filter((r) => r.paper_id === p.id)
    return { id: p.id, state, right: mine.filter((r) => r.correct).length, outOf: mine.length, day: dayLabel(p.created_at) }
  })
  return { workspace: 'own', firstName: child.first_name, tests, curricula: [] }
}

/**
 * The screen of one marked test of the twin `twinId`, or null when the paper is not the twin's own test (another learner's paper, a class test,
 * a paper that does not exist). Marked: each question as it was read, the open gaps whose evidence is in this paper (each with how many of its
 * answers were not right here), and how many questions were left out. The count left out is on the line the save tool wrote for this test's event.
 */
export async function getOwnTestView(twinId: string, paperId: string): Promise<OwnTestView | null> {
  const admin = createSupabaseAdmin()
  const { data: paper } = await admin.from('papers').select('id, child_id, test_id, status').eq('id', paperId).maybeSingle()
  if (!paper || paper.child_id !== twinId || paper.test_id) return null
  const event = await newestOwnTestEvent(admin, paperId)
  const state = ownTestState({ paper: paper.status, event: event?.status ?? null })
  if (state !== 'marked') return { state, paperId }

  const { data: rows } = await admin.from('question_results').select('id, n, prompt, answer_read, correct').eq('paper_id', paperId).order('n')
  const results = rows ?? []
  const inThisTest = new Set(results.map((r) => r.id))
  const { data: gapRows } = await admin.from('gaps').select('topic_id, topic_name, evidence, created_at').eq('child_id', twinId).neq('stage', 'fixed').order('created_at')
  const gaps = (gapRows ?? [])
    .map((g) => ({ topicId: g.topic_id, topicName: g.topic_name, wrong: g.evidence.filter((id) => inThisTest.has(id)).length }))
    .filter((g) => g.wrong > 0)

  let leftOut = 0
  if (event) {
    const { data: log } = await admin.from('activity_log').select('text').eq('event_id', event.id).eq('tool', 'save_own_test_results').order('at', { ascending: false }).limit(1)
    leftOut = leftOutOf(log?.[0]?.text ?? null)
  }
  return {
    state: 'marked',
    paperId,
    right: results.filter((r) => r.correct).length,
    outOf: results.length,
    leftOut,
    finding: event?.status === 'queued' || event?.status === 'running',
    questions: results.map((r) => ({ n: r.n, prompt: r.prompt, answer: r.answer_read, right: r.correct })),
    gaps,
  }
}
