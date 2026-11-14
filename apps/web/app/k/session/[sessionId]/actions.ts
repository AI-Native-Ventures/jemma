'use server'

import { PAPER_QUESTION_COUNT, type Stage } from '@jemma/profiling/logic'
import { LessonSchema, QuestionSchema, type Lesson, type Question } from '@jemma/profiling/schemas'
import type { JemmaDb, Json } from '@jemma/profiling/db'
import { sendEvent } from '@/lib/agent'
import { myChild } from '@/lib/data/p27'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { createSupabaseServer } from '@/lib/supabase/server'
import { classIdsOfChild, loadShortLabels } from '@/lib/topics'
import {
  adaptedOf,
  DEFAULT_TRY_COUNT,
  finishAnswer,
  missedOf,
  nextInSequence,
  paperQuestions,
  stageAfter,
  stripQuestion,
  type QuestionForChild,
  type StageMove,
  type StoredItem,
} from './logic'
import { newestSnap, progressOf, type PaperProgress } from './paper'
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
    finished_at: string | null
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
    .select('id, child_id, status, lesson_id, warmup, topic_id, topic_name, question_count, right, minutes, finished_at')
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
      // A paper answer that could not be read carries `unread: true` inside the stored question (the question schema does not keep it, so it is read from the row).
      const unread = typeof row.question === 'object' && row.question !== null && (row.question as { unread?: unknown }).unread === true
      items.push({ phase: row.phase, position: row.position, question: q.data, answer: row.answer, correct: row.correct, difficulty: row.difficulty, seconds: row.seconds, ...(unread ? { unread } : {}) })
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

/** True when `update_learner_profile` already applied this session: it writes one `format_trials` row per session. */
async function profileApplied(admin: JemmaDb, sessionId: string): Promise<boolean> {
  const { data } = await admin.from('format_trials').select('id').eq('session_id', sessionId).limit(1)
  return (data?.length ?? 0) > 0
}

/**
 * The move a session made when the agent applied it before the child saw the results, found from the gap as it is now and from when the
 * session was closed: a gap that began practising, or was fixed, after that moment was moved by this session. A gap fixed before it was
 * not this session's, and says nothing here (null), as a fixed gap says nothing on the screen's own path.
 */
function moveAlreadyMade(
  gap: { stage: string; first_practised_at: string | null; fixed_at: string | null },
  closedAt: string | null,
): StageMove | null {
  const after = (at: string | null) => !!at && !!closedAt && new Date(at).getTime() >= new Date(closedAt).getTime()
  if (gap.stage === 'fixed') return after(gap.fixed_at) ? { from: 'practising', to: 'fixed' } : null
  if (gap.stage === 'practising') return { from: after(gap.first_practised_at) ? 'new' : 'practising', to: 'practising' }
  return { from: 'new', to: 'practising' }
}

const stripNext = (run: Run, items: StoredItem[]): QuestionForChild | null => {
  const next = nextInSequence(run.warmup, run.lesson.questions, run.tryCount, items)
  return next ? stripQuestion(next.question, next) : null
}

/**
 * Starts (or resumes) a session and hands the child the lesson without any answers. `paper` says where a practice answered on paper stands:
 * a session closed after a photo was read is handed back too (its results are shown), any other finished session is not.
 */
export async function beginSession(sessionId: string): Promise<{ lesson: LessonForChild; paper: PaperProgress }> {
  const run = await loadRun(sessionId)
  const snap = await newestSnap(run.admin, sessionId)
  if (run.session.status === 'done' && !snap) throw new Error('This session is finished')
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
  const onPaper = paperQuestions(lesson)
  return {
    paper: progressOf(run.session, snap),
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
      // The five questions of a practice answered on paper, as the sheet numbers them. None when the lesson cannot put five on paper.
      paper:
        onPaper.length === PAPER_QUESTION_COUNT
          ? onPaper.map((index, i) => stripQuestion(lesson.questions[index]!, { position: i + 1, phase: 'try', index: i + 1, of: onPaper.length }))
          : [],
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

  // The server finishes the answer from the stored question (a missing number goes back into its fraction), whatever the browser sent. A question of
  // the four senior kinds (number, expression, equation, point) is stored as typed and marked by meaning; every other question is marked as before.
  const { stored, correct } = finishAnswer(current.question, text)
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

  // A session closed before this call (an answer read from a photo: the agent follows the read at once) may already be applied to the
  // profile, and then the gap has moved. The screen's own session is closed by this call, so for it nothing is applied yet.
  const applied = run.session.status === 'done' && (await profileApplied(run.admin, sessionId))
  const asked = run.admin
    .from('gaps')
    .select('stage, first_practised_at, fixed_at, topic_id, topic_name, created_at')
    .eq('child_id', run.session.child_id)
  const { data: gaps } = applied ? await asked : await asked.neq('stage', 'fixed')
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
  const gap = (gaps ?? [])
    .filter((g) => (topicId && g.topic_id === topicId) || same(g.topic_name, topicName))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
  const move = gap
    ? applied
      ? moveAlreadyMade(gap, run.session.finished_at)
      : stageAfter({
          stage: gap.stage as Stage,
          right,
          firstPractisedAt: gap.first_practised_at ? new Date(gap.first_practised_at) : null,
          now,
        })
    : null
  // The short label of the topic that moved. `run.admin` is the service client (no row level security), so the scope is what keeps this read to the
  // learner's own topics: the session was read above as the learner (under RLS), so `run.session.child_id` is theirs, and the topics read is the
  // maps of that child's classes only (ids of enrolments, then topics by map id), not every topic of every school.
  const stage = gap && move ? { ...move, topicName: (await loadShortLabels(run.admin, { classIds: await classIdsOfChild(run.admin, run.session.child_id) }))(gap.topic_name) } : null

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

const MAX_PHOTO_BYTES = 4_000_000
const UNREACHED = 'Jemma could not be reached. Try again in a minute.'

export type SnapResult = { ok: true } | { ok: false; message: string }
const refuse = (message: string): SnapResult => ({ ok: false, message })

/**
 * The learner sends one photo of a practice answered on paper (reached through the upload route /k/upload, never as a form action: see
 * lib/upload-route.ts). Who may send: the learner whose session it is, or a parent's phone after hand-over, found the way the session actions
 * find them (`loadRun`, row-level security) and by `myChild` (the child of the sign-in or of the hand-over cookie): a teacher, or another child's
 * session, throws. What may be sent: a session with no try answer yet, exactly one image. The photo goes to the private `papers` bucket under
 * the learner, the session starts if it was planned, and `practice.snapped` is sent with the path and the five questions (`paperQuestions`).
 * A second tap while a photo is being read does nothing. An event the agent was not told about is closed as failed at once, so the screen
 * shows the retry.
 */
export async function snapPractice(sessionId: string, files: File[]): Promise<SnapResult> {
  const { child } = await myChild()
  const run = await loadRun(sessionId)
  if (run.session.child_id !== child.id) throw new Error('Session not found')
  if (run.session.status === 'done' || run.items.some((i) => i.phase === 'try')) return refuse('You already answered these questions.')

  const photos = files.filter((f) => f instanceof File && f.size > 0)
  if (photos.length !== 1) return refuse('Send one photo of your answers.')
  const photo = photos[0]!
  if (!photo.type.startsWith('image/') || photo.size > MAX_PHOTO_BYTES) return refuse('That photo is too big. Try again.')
  const questions = paperQuestions(run.lesson)
  if (questions.length !== PAPER_QUESTION_COUNT) return refuse('These questions cannot be answered on paper.')

  const newest = await newestSnap(run.admin, sessionId)
  if (newest?.status === 'queued' || newest?.status === 'running') return { ok: true }

  const { data: kid, error: kidError } = await run.admin.from('children').select('school_id').eq('id', child.id).single()
  if (kidError || !kid) throw new Error('Session not found')
  const path = `${kid.school_id}/${child.id}/practice/${sessionId}-${Date.now()}.jpg`
  const up = await run.admin.storage.from('papers').upload(path, photo, { upsert: true, contentType: photo.type })
  if (up.error) {
    console.error(`practice photo not saved: ${up.error.message}`)
    return refuse('Could not save your photo. Try again.')
  }
  if (run.session.status === 'planned') {
    const { error } = await run.admin.from('sessions').update({ status: 'in_progress' }).eq('id', sessionId)
    if (error) throw new Error(error.message)
  }

  const asked = new Date().toISOString()
  try {
    await sendEvent('practice.snapped', { sessionId, path, questions })
  } catch (e) {
    console.error(`practice.snapped for ${sessionId} not delivered: ${e instanceof Error ? e.message : String(e)}`)
    await run.admin
      .from('events')
      .update({ status: 'failed', error: e instanceof Error ? e.message : String(e), finished_at: new Date().toISOString() })
      .eq('type', 'practice.snapped')
      .eq('status', 'queued')
      .eq('payload->>sessionId', sessionId)
      .gte('created_at', asked)
    return refuse(UNREACHED)
  }
  return { ok: true }
}

/**
 * Where the learner's paper answer stands, asked again 3 seconds after the last answer while Jemma reads the photo (the way the practice card asks). The session is
 * proven the learner's by row-level security before the event is read with the service client by its id.
 */
export async function paperProgress(sessionId: string): Promise<PaperProgress> {
  const supabase = await createSupabaseServer()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) throw new Error('Not signed in')
  const { data: session } = await supabase.from('sessions').select('id, status').eq('id', sessionId).maybeSingle()
  if (!session) throw new Error('Session not found')
  return progressOf(session, await newestSnap(createSupabaseAdmin(), sessionId))
}
