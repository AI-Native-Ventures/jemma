import { libraryKey, TeachingLessonSchema, TeachingSourceSchema, type TeachingLesson, type TeachingSource } from '@jemma/profiling/schemas'
import { cookies } from 'next/headers'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { HANDOVER_COOKIE, isOwnHandover, verifyHandover } from '@/lib/handover'
import { buildEntries, forChild, isUuid, readyLessons, type LessonRow, type LibraryEntry, type TeachingLessonForChild } from '@/lib/teaching'
import { classIdsOfChild } from '@/lib/topics'
import { myChild } from './p27'

// The teaching library as the learner's screens read it (P142). The lessons are global (one set for each grade and CAPS topic name, written once, the same
// for every learner), so they are read with the service client; the learner is found the way every learner screen finds them (`myChild`) and only their own
// progress is read or written. Every read that fails says "no library" and the screen keeps today's flow: the Learn button is not drawn, the Learn step of
// a practice is the one it always was.

/** The topic of the learner's map a lesson list is for: its name, its part of Mathematics and the grade of the class whose map it is in. */
export type LearnTopic = { id: string; name: string; family: string; grade: number }

/**
 * The topic a learner's screen names by its id (the id the map gives it, the one a Practise button sends): its name, its family and its grade, or null
 * when it is not a topic of one of THIS learner's classes. The grade is the class's, not the learner's: a learner in "My own" works on one grade at a
 * time and the topic belongs to that grade's class.
 */
export async function resolveTopic(topicId: string): Promise<LearnTopic | null> {
  if (!isUuid(topicId)) return null
  try {
    const { supabase, child } = await myChild()
    const admin = createSupabaseAdmin()
    const [{ data: topic }, classIds] = await Promise.all([admin.from('topics').select('id, name, family, map_id').eq('id', topicId).maybeSingle(), classIdsOfChild(supabase, child.id)])
    if (!topic) return null
    const { data: map } = await admin.from('curriculum_maps').select('class_id').eq('id', topic.map_id).maybeSingle()
    if (!map || !classIds.includes(map.class_id)) return null
    const { data: cls } = await admin.from('classes').select('grade').eq('id', map.class_id).maybeSingle()
    return cls ? { id: topic.id, name: topic.name, family: topic.family, grade: cls.grade } : null
  } catch {
    return null
  }
}

/** The names (without " (Term N)") of the topics of a grade that have lessons: one read for a whole part screen. Empty when the read fails. */
export async function libraryNames(grade: number): Promise<Set<string>> {
  try {
    const { data } = await createSupabaseAdmin().from('topic_lessons').select('base_name').eq('grade', grade).eq('status', 'ready').eq('position', 1)
    return new Set((data ?? []).map((r) => r.base_name))
  } catch {
    return new Set()
  }
}

const minutesOf = (value: unknown): number => {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 10
}

/** The progress rows of this learner for these lessons. */
async function progressOf(childId: string, lessonIds: string[]) {
  if (lessonIds.length === 0) return []
  const { data } = await createSupabaseAdmin().from('topic_lesson_progress').select('topic_lesson_id, started_at, finished_at').eq('child_id', childId).in('topic_lesson_id', lessonIds)
  return data ?? []
}

/**
 * The lessons of a topic for the signed-in learner, in teaching order, each with a tick when it is finished: the grade and the name of the topic find them
 * (the name without " (Term N)", so a second teaching of a topic opens the same lessons). Empty when the topic has none, or none that passed its checks.
 */
export async function libraryFor(grade: number, topicName: string): Promise<LibraryEntry[]> {
  try {
    const { data } = await createSupabaseAdmin()
      .from('topic_lessons')
      .select('id, position, version, title, minutes:content->>minutes')
      .eq('grade', grade)
      .eq('base_name', libraryKey(topicName))
      .eq('status', 'ready')
    const ready = readyLessons((data ?? []).map((r): LessonRow => ({ id: r.id, position: r.position, version: r.version, title: r.title, minutes: minutesOf(r.minutes) })))
    if (ready.length === 0) return []
    const { child } = await myChild()
    return buildEntries(ready, await progressOf(child.id, ready.map((r) => r.id)))
  } catch {
    return []
  }
}

/** One stored lesson that is ready, whole (answers and all): the server's copy, for marking. Null when it is not there, not ready, or not a lesson. */
export async function storedLesson(id: string): Promise<{ lesson: TeachingLesson; source: TeachingSource } | null> {
  if (!isUuid(id)) return null
  try {
    const { data } = await createSupabaseAdmin().from('topic_lessons').select('content, source').eq('id', id).eq('status', 'ready').maybeSingle()
    if (!data) return null
    const lesson = TeachingLessonSchema.safeParse(data.content)
    if (!lesson.success) return null
    const source = TeachingSourceSchema.safeParse(data.source)
    return { lesson: lesson.data, source: source.success ? source.data : { kind: 'none', title: '', credit: '' } }
  } catch {
    return null
  }
}

/**
 * One lesson for the learner's screen: the list entry, the lesson with no answer of any question the learner is asked in it (`forChild`) and where it was
 * written from. Null when the lesson is not there or cannot be read.
 */
export async function topicLesson(id: string): Promise<{ entry: LibraryEntry; lesson: TeachingLessonForChild; source: TeachingSource } | null> {
  const stored = await storedLesson(id)
  if (!stored) return null
  try {
    const { child } = await myChild()
    const [progress] = await progressOf(child.id, [id])
    const { lesson, source } = stored
    return {
      entry: { id, position: lesson.position, title: lesson.title, minutes: lesson.minutes, done: !!progress?.finished_at, started: !!progress },
      lesson: forChild(lesson),
      source,
    }
  } catch {
    return null
  }
}

/** The learner's best marks by format, for the delivery a lesson opens in: the trials of this part of Mathematics, else every trial the learner has. */
export async function trialsFor(family: string): Promise<{ format: 'reading' | 'diagram' | 'audio'; score: number }[]> {
  try {
    const { child } = await myChild()
    const { data } = await createSupabaseAdmin().from('format_trials').select('format, score, topic_family').eq('child_id', child.id)
    const all = data ?? []
    const own = all.filter((t) => t.topic_family === family)
    return (own.length > 0 ? own : all).map((t) => ({ format: t.format, score: t.score }))
  } catch {
    return []
  }
}

/** True when this request is a parent's hand-over of ONE session: that cookie covers the session and the hand-back screen only, so the lessons cannot be opened. */
export async function underSessionHandover(): Promise<boolean> {
  try {
    const handover = await verifyHandover((await cookies()).get(HANDOVER_COOKIE)?.value)
    return handover !== null && !isOwnHandover(handover)
  } catch {
    return false
  }
}

/**
 * The lessons of the topic of a practice session, for its Learn step ("Learn it first"), and the id of the topic (the lesson screens are under it).
 * Empty (the Learn step as it always was) when the topic has no lessons, the session has no topic of the map, the session is not this learner's, a read
 * fails, or the phone is a parent's hand-over of this one session.
 */
export async function sessionLibrary(sessionId: string): Promise<{ topicId: string | null; entries: LibraryEntry[] }> {
  const none = { topicId: null, entries: [] as LibraryEntry[] }
  if (!isUuid(sessionId)) return none
  try {
    if (await underSessionHandover()) return none
    const { supabase, child } = await myChild()
    const { data: session } = await supabase.from('sessions').select('topic_id').eq('id', sessionId).eq('child_id', child.id).maybeSingle()
    if (!session?.topic_id) return none
    const topic = await resolveTopic(session.topic_id)
    if (!topic) return none
    const entries = await libraryFor(topic.grade, topic.name)
    return entries.length > 0 ? { topicId: topic.id, entries } : none
  } catch {
    return none
  }
}
