'use server'

import { firstToLearn, type LevelTopicResult } from '@jemma/profiling/logic'
import type { Json } from '@jemma/profiling/db'
import { isOwnRecord } from '@jemma/profiling/own-names'
import { sendEvent } from '@/lib/agent'
import { latestLevelCheck, levelTopicsFor, resultsOf, type LevelCheck } from '@/lib/data/level'
import { myChild } from '@/lib/data/p27'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { answerMaxLength, finishAnswer, type QuestionForChild } from '../session/[sessionId]/logic'
import { questionFor } from './question'

// P163: the level check's actions, for the learner of the request in their own space (`myChild`). The questions and their answers stay on the server:
// the screen gets one question at a time without its answer, and no answer is ever said to be right or wrong.

type Done = { first: string | null }
export type LevelStep = { next: QuestionForChild | null; done: Done | null }

async function learnerOfOwnSpace() {
  const { child } = await myChild()
  if (!isOwnRecord(child)) throw new Error('The level check is in your own space')
  return child
}

/** Asks Jemma to write the questions of a check: the event, and the row knows which event it is. */
async function askToWrite(childId: string, checkId: string): Promise<void> {
  const admin = createSupabaseAdmin()
  const eventId = await sendEvent('level.requested', { childId, levelCheckId: checkId })
  await admin.from('level_checks').update({ event_id: eventId }).eq('id', checkId)
}

/**
 * Starts the level check: a check already open is kept (the learner carries on); otherwise a new one with 6 topics of the learner's grade, and Jemma
 * is asked to write its questions.
 */
export async function startLevelCheck(): Promise<{ ok: true } | { ok: false; message: string }> {
  const child = await learnerOfOwnSpace()
  const admin = createSupabaseAdmin()
  const open = await latestLevelCheck(admin, child.id)
  if (open && open.status !== 'done' && open.status !== 'failed') return { ok: true }
  const found = await levelTopicsFor(admin, child)
  if (!found) return { ok: false, message: 'Add a grade in My maths first.' }
  const { data, error } = await admin
    .from('level_checks')
    .insert({ child_id: child.id, class_id: found.classId, grade: found.grade, topics: found.topics as unknown as Json, status: 'writing' })
    .select('id')
    .single()
  if (error || !data) return { ok: false, message: 'Jemma could not start the check. Try again.' }
  await askToWrite(child.id, data.id)
  return { ok: true }
}

/** Jemma could not write the questions: the same check is written again. */
export async function retryLevelCheck(): Promise<{ ok: true } | { ok: false; message: string }> {
  const child = await learnerOfOwnSpace()
  const admin = createSupabaseAdmin()
  const check = await latestLevelCheck(admin, child.id)
  if (!check || check.status === 'done') return startLevelCheck()
  if (check.status === 'ready') return { ok: true }
  await admin.from('level_checks').update({ status: 'writing', questions: [] }).eq('id', check.id)
  await askToWrite(child.id, check.id)
  return { ok: true }
}

/**
 * Saves the answer to question `n` and hands back the next question, or the end. `value` null is "I don't know yet": not right, and nothing is marked.
 * A repeated tap on a question already answered shows where the learner is now.
 */
export async function answerLevel(checkId: string, n: number, value: string | null, seconds = 0): Promise<LevelStep> {
  const child = await learnerOfOwnSpace()
  const admin = createSupabaseAdmin()
  const check = await latestLevelCheck(admin, child.id)
  if (!check || check.id !== checkId) throw new Error('This check is not yours')
  if (check.status === 'done') return { next: null, done: { first: firstToLearn(resultsOf(check))?.topicName ?? null } }
  if (check.status !== 'ready') throw new Error('The questions are not ready yet')
  const at = check.answers.length + 1
  if (n < at) return { next: questionFor(check, at), done: null }
  if (n > at) throw new Error('That question is not next')
  const item = check.questions[n - 1]
  if (!item) throw new Error('No such question')

  let answer = { n, answer: '', correct: false, skipped: true, seconds: Math.max(0, Math.min(600, Math.round(seconds))) }
  if (value !== null) {
    const text = value.trim()
    const max = answerMaxLength(item.question)
    if (!text || text.length > max) throw new Error('Write an answer first')
    // The server marks it from the stored question, whatever the browser sent, the same way a practice is marked.
    const { stored, correct } = finishAnswer(item.question, text)
    answer = { ...answer, answer: stored, correct, skipped: false }
  }
  const answers = [...check.answers, answer]
  const last = answers.length >= check.questions.length
  const now = new Date().toISOString()
  const { error } = await admin
    .from('level_checks')
    .update({
      answers: answers as unknown as Json,
      ...(check.startedAt ? {} : { started_at: now }),
      ...(last ? { status: 'done', finished_at: now } : {}),
    })
    .eq('id', check.id)
    .eq('status', 'ready')
  if (error) throw new Error(error.message)
  if (!last) return { next: questionFor(check, at + 1), done: null }

  const results = resultsOf({ ...check, answers })
  await afterCheck(child.id, results)
  return { next: null, done: { first: firstToLearn(results)?.topicName ?? null } }
}

/**
 * What a finished check sets going: each topic to start with becomes a new gap (unless the learner has one open on it already), and Jemma is asked to
 * write a practice of the first topic to learn. A step that fails is logged and never takes the learner's answers back.
 */
async function afterCheck(childId: string, results: LevelTopicResult[]): Promise<void> {
  const admin = createSupabaseAdmin()
  try {
    const { data: open } = await admin.from('gaps').select('topic_id, topic_name').eq('child_id', childId).neq('stage', 'fixed')
    const has = (r: LevelTopicResult) => (open ?? []).some((g) => (r.topicId !== null && g.topic_id === r.topicId) || g.topic_name.trim().toLowerCase() === r.topicName.trim().toLowerCase())
    const fresh = results.filter((r) => r.verdict === 'start' && !has(r))
    if (fresh.length) await admin.from('gaps').insert(fresh.map((r) => ({ child_id: childId, topic_id: r.topicId, topic_name: r.topicName, stage: 'new' as const })))
  } catch (e) {
    console.error(`level check: the new gaps were not saved: ${e instanceof Error ? e.message : String(e)}`)
  }
  const first = firstToLearn(results)
  if (!first) return
  try {
    await sendEvent('practice.requested', { childId, topicName: first.topicName, ...(first.topicId ? { topicId: first.topicId } : {}) })
  } catch (e) {
    console.error(`level check: the first practice was not asked for: ${e instanceof Error ? e.message : String(e)}`)
  }
}
