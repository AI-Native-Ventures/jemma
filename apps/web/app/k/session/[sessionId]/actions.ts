'use server'

import type { Stage } from '@jemma/profiling/logic'
import { LessonSchema, QuestionSchema, type Lesson, type Question } from '@jemma/profiling/schemas'
import type { JemmaDb, Json } from '@jemma/profiling/db'
import { sendEvent } from '@/lib/agent'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { createSupabaseServer } from '@/lib/supabase/server'
import { loadShortLabels } from '@/lib/topics'
import {
  adaptedOf,
  completeAnswer,
  DEFAULT_TRY_COUNT,
  missedOf,
  nextInSequence,
  stageAfter,
  stripQuestion,
  type QuestionForChild,
  type StoredItem,
} from './logic'
import type { FinishedSession, LessonForChild } from './types'

type Run = {
  admin: JemmaDb
  session: {
    id: string
    child_id: string
    status: 'planned' | 'in_progress' | 'done'
    topic_id: string | null
    topic_name: string | null
    question_count: number | null
    right: number | null
    minutes: number | null
  }
  lessonRow: { id: string; topic_id: string | null; topic_name: string; audio_path: string | null }
  lesson: Lesson
  warmup: Question[]
  tryCount: number
  items: StoredItem[]
}

const dayOf = (iso: string) => ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(`${iso}T00:00:00Z`).getUTCDay()]!

/**
 * Loads one session the signed-in child may see (row-level security decides), its lesson and the answers so far.
 * Writes go through the service client afterwards, because a learner can only read these tables.
 */
async function loadRun(sessionId: string): Promise<Run> {
  const supabase = await createSupabaseServer()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) throw new Error('Not signed in')
  const { data: session, error } = await supabase
    .from('sessions')
    .select('id, child_id, status, lesson_id, warmup, topic_id, topic_name, question_count, right, minutes')
    .eq('id', sessionId)
    .maybeSingle()
  if (error || !session) throw new Error('Session not found')
  if (!session.lesson_id) throw new Error('This lesson is not ready yet')
  const { data: lessonRow } = await supabase
    .from('lessons')
    .select('id, topic_id, topic_name, content, audio_path')
    .eq('id', session.lesson_id)
    .maybeSingle()
  const lesson = LessonSchema.safeParse(lessonRow?.content)
  if (!lessonRow || !lesson.success) throw new Error('The lesson could not be loaded')

  const admin = createSupabaseAdmin()
  const { data: rows, error: itemsError } = await admin.from('session_items').select('*').eq('session_id', sessionId)
  if (itemsError) throw new Error(itemsError.message)
  const items: StoredItem[] = []
  for (const row of rows ?? []) {
    const q = QuestionSchema.safeParse(row.question)
    if (q.success) {
      items.push({ phase: row.phase, position: row.position, question: q.data, answer: row.answer, correct: row.correct, difficulty: row.difficulty, seconds: row.seconds })
    }
  }
  const sessionWarmup = QuestionSchema.array().safeParse(session.warmup)
  const warmup = sessionWarmup.success && sessionWarmup.data.length > 0 ? sessionWarmup.data : lesson.data.warmup
  const { lesson_id: _lessonId, warmup: _warmup, ...rest } = session
  return {
    admin,
    session: rest,
    lessonRow: { id: lessonRow.id, topic_id: lessonRow.topic_id, topic_name: lessonRow.topic_name, audio_path: lessonRow.audio_path },
    lesson: lesson.data,
    warmup,
    tryCount: session.question_count ?? DEFAULT_TRY_COUNT,
    items,
  }
}

const stripNext = (run: Run, items: StoredItem[]): QuestionForChild | null => {
  const next = nextInSequence(run.warmup, run.lesson.questions, run.tryCount, items)
  return next ? stripQuestion(next.question, next) : null
}

/** Starts (or resumes) a session and hands the child the lesson without any answers. */
export async function beginSession(sessionId: string): Promise<{ lesson: LessonForChild }> {
  const run = await loadRun(sessionId)
  if (run.session.status === 'done') throw new Error('This session is finished')
  if (run.session.status === 'planned') {
    const { error } = await run.admin.from('sessions').update({ status: 'in_progress' }).eq('id', sessionId)
    if (error) throw new Error(error.message)
  }
  let url: string | null = null
  if (run.lesson.format === 'audio' && run.lessonRow.audio_path) {
    const signed = await run.admin.storage.from('lesson-audio').createSignedUrl(run.lessonRow.audio_path, 3600)
    url = signed.data?.signedUrl ?? null
  }
  const { lesson } = run
  return {
    lesson: {
      title: lesson.title,
      format: lesson.format,
      minutes: lesson.minutes,
      topicName: run.lessonRow.topic_name,
      ...(lesson.cards ? { cards: lesson.cards } : {}),
      ...(lesson.diagram ? { diagram: lesson.diagram } : {}),
      ...(lesson.audio ? { audio: { script: lesson.audio.script, url } } : {}),
      warmupCount: run.warmup.length,
      tryCount: Math.min(run.tryCount, lesson.questions.length),
      first: stripNext(run, run.items),
    },
  }
}

/** Marks one answer here on the server and hands back the next question. Never says whether it was right. */
export async function answer(
  sessionId: string,
  position: number,
  value: string,
  seconds = 0,
): Promise<{ next: QuestionForChild | null }> {
  const text = value.trim()
  if (!text || text.length > 40) throw new Error('Write an answer first')
  const run = await loadRun(sessionId)
  if (run.session.status !== 'in_progress') throw new Error('This session is not running')
  const current = nextInSequence(run.warmup, run.lesson.questions, run.tryCount, run.items)
  if (!current) return { next: null }
  // A repeated tap on an answer already saved just shows where the child is now.
  if (position !== current.position) {
    if (position < current.position) return { next: stripQuestion(current.question, current) }
    throw new Error('That question is not next')
  }

  // The server finishes the answer from the stored question (a missing number goes back into its fraction), whatever the browser sent.
  const { stored, correct } = completeAnswer(current.question, text)
  const earlier = run.items.filter((i) => i.phase === 'try').sort((a, b) => a.position - b.position).map((i) => i.correct)
  const { error } = await run.admin.from('session_items').insert({
    session_id: sessionId,
    position: current.index,
    phase: current.phase,
    question: current.question as unknown as NonNullable<Json>,
    difficulty: current.question.difficulty,
    answer: stored,
    correct,
    seconds: Math.max(0, Math.min(600, Math.round(seconds))),
    adapted: current.phase === 'try' ? adaptedOf([...earlier, correct]) : null,
  })
  if (error) throw new Error(error.message)

  const saved: StoredItem = {
    phase: current.phase,
    position: current.index,
    question: current.question,
    answer: stored,
    correct,
    difficulty: current.question.difficulty,
    seconds,
  }
  return { next: stripNext(run, [...run.items, saved]) }
}

/** Closes the session, and only now hands back what was missed. The agent moves the gap from the `session.finished` event. */
export async function finishSession(sessionId: string): Promise<FinishedSession> {
  const run = await loadRun(sessionId)
  if (nextInSequence(run.warmup, run.lesson.questions, run.tryCount, run.items)) throw new Error('There are questions left')
  const tries = run.items.filter((i) => i.phase === 'try')
  const right = tries.filter((i) => i.correct).length
  const now = new Date()
  const topicName = run.lessonRow.topic_name
  const topicId = run.lessonRow.topic_id ?? run.session.topic_id

  const { data: gaps } = await run.admin
    .from('gaps')
    .select('stage, first_practised_at, topic_id, topic_name, created_at')
    .eq('child_id', run.session.child_id)
    .neq('stage', 'fixed')
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
  const gap = (gaps ?? [])
    .filter((g) => (topicId && g.topic_id === topicId) || same(g.topic_name, topicName))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
  const stage = gap
    ? {
        ...stageAfter({
          stage: gap.stage as Stage,
          right,
          firstPractisedAt: gap.first_practised_at ? new Date(gap.first_practised_at) : null,
          now,
        }),
        topicName: (await loadShortLabels(run.admin))(gap.topic_name),
      }
    : null

  let minutes = run.session.minutes
  if (run.session.status !== 'done') {
    const seconds = run.items.reduce((sum, i) => sum + i.seconds, 0)
    minutes = Math.max(1, Math.round(seconds / 60))
    const { error } = await run.admin
      .from('sessions')
      .update({ status: 'done', right, minutes, finished_at: now.toISOString() })
      .eq('id', sessionId)
    if (error) throw new Error(error.message)
    try {
      // Do not hold the child on a slow agent: give it 2 seconds, the queue keeps the event either way.
      await Promise.race([sendEvent('session.finished', { sessionId }), new Promise((resolve) => setTimeout(resolve, 2000))])
    } catch {
      // The agent being slow or offline must not stop the child; the event is retried from the teacher's side.
    }
  }

  const today = now.toISOString().slice(0, 10)
  const { data: upcoming } = await run.admin
    .from('sessions')
    .select('planned_for, topic_name')
    .eq('child_id', run.session.child_id)
    .eq('status', 'planned')
    .gt('planned_for', today)
    .order('planned_for')
    .limit(1)
  const next = upcoming?.[0]

  return {
    missed: missedOf(run.items),
    stage,
    minutes: minutes ?? 1,
    topicName,
    next: next ? { day: dayOf(next.planned_for), topic: next.topic_name ?? '' } : null,
  }
}
