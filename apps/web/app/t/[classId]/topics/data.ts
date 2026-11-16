import { isCapsDraft, type MapSource } from '@/lib/map-source'
import { createSupabaseServer } from '@/lib/supabase/server'
import type { ItemRow, Learner, MapTopic, SessionRow } from './logic'

// What the Topics screens read, with the teacher's own client: the rows are the ones row level security lets a teacher see (the class, its approved map,
// its learners, and the sessions and answers of the learners the teacher teaches). Nothing is written.

export type TopicsClass = {
  id: string
  name: string
  grade: number
  subject: string
  source: MapSource
  topics: MapTopic[]
  learners: Learner[]
  sessions: SessionRow[]
}

/** The class with its approved map's topics, its learners and every finished practice session of those learners. Null when the teacher cannot see the class. */
export async function loadTopicsClass(classId: string): Promise<TopicsClass | null> {
  const supabase = await createSupabaseServer()
  const { data: cls } = await supabase.from('classes').select('id, name, grade, subject').eq('id', classId).maybeSingle()
  if (!cls) return null
  const [{ data: map }, { data: enrolled }] = await Promise.all([
    supabase.from('curriculum_maps').select('id, draft').eq('class_id', classId).eq('status', 'approved').order('approved_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('enrolments').select('child_id, children(first_name)').eq('class_id', classId),
  ])
  const learners: Learner[] = (enrolled ?? []).flatMap((e) => (e.children ? [{ id: e.child_id, name: e.children.first_name }] : []))
  const { data: topicRows } = map
    ? await supabase.from('topics').select('id, name, family, term, position').eq('map_id', map.id).order('term').order('position')
    : { data: [] as MapTopic[] }
  const { data: sessionRows } = learners.length
    ? await supabase
        .from('sessions')
        .select('id, child_id, topic_id, topic_name, right, question_count, finished_at')
        .in('child_id', learners.map((l) => l.id))
        .eq('status', 'done')
        .order('finished_at', { ascending: false })
        .limit(2000)
    : { data: [] }
  return {
    id: cls.id,
    name: cls.name,
    grade: cls.grade,
    subject: cls.subject,
    source: { caps: isCapsDraft(map?.draft), grade: cls.grade },
    topics: topicRows ?? [],
    learners,
    sessions: (sessionRows ?? []).map((s) => ({
      id: s.id,
      childId: s.child_id,
      topicId: s.topic_id,
      topicName: s.topic_name,
      right: s.right,
      asked: s.question_count,
      finishedAt: s.finished_at,
    })),
  }
}

/** The Try answers of some sessions (never the warm-up), with the child each belongs to. */
export async function loadTopicItems(sessions: { id: string; childId: string }[]): Promise<ItemRow[]> {
  if (sessions.length === 0) return []
  const supabase = await createSupabaseServer()
  const owner = new Map(sessions.map((s) => [s.id, s.childId]))
  const ids = [...owner.keys()]
  const parts = await Promise.all(
    Array.from({ length: Math.ceil(ids.length / 40) }, (_, i) =>
      supabase.from('session_items').select('session_id, correct, answer, question').in('session_id', ids.slice(i * 40, (i + 1) * 40)).eq('phase', 'try').limit(2000),
    ),
  )
  return parts.flatMap((p) => p.data ?? []).map((r) => ({ sessionId: r.session_id, childId: owner.get(r.session_id)!, correct: r.correct, answer: r.answer, question: r.question }))
}
