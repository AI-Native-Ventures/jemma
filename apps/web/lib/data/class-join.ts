import { notFound } from 'next/navigation'
import { createSupabaseServer } from '../supabase/server'
import { clock, getClassInfo } from './p21'

/** What the teacher's page for a learner who asks to join the class needs. Read with the teacher's own session: row level security decides what is seen. */
export type JoinRequestView = {
  classId: string
  className: string
  joinCode: string
  requestId: string
  status: 'pending' | 'approved' | 'declined'
  /** The first name the learner gave. */
  name: string
  askedAt: string
  /** The learners of the class who have no login yet: "This is ...". */
  candidates: { childId: string; name: string }[]
  /** The candidate with the learner's first name, when exactly one has it, else null. */
  match: string | null
}

const plain = (text: string | null | undefined) => (text ?? '').trim().replace(/\s+/g, ' ').toLowerCase()

/** The learner of the class the request most likely means: the one candidate whose first name is the same (any case). */
export function likelyMatch(name: string, candidates: { childId: string; firstName: string }[]): string | null {
  const hits = candidates.filter((c) => plain(c.firstName) === plain(name))
  return hits.length === 1 ? hits[0]!.childId : null
}

export async function getJoinRequest(classId: string, requestId: string): Promise<JoinRequestView> {
  const cls = await getClassInfo(classId)
  const supabase = await createSupabaseServer()
  const { data: req } = await supabase.from('class_join_requests').select('id, status, requested_name, created_at').eq('id', requestId).eq('class_id', classId).maybeSingle()
  if (!req) notFound()
  const { data: enrolled } = await supabase.from('enrolments').select('children(id, first_name, last_name, user_id)').eq('class_id', classId)
  const people = (enrolled ?? [])
    .flatMap((e) => (e.children ? [e.children] : []))
    .filter((c) => !c.user_id)
    .map((c) => ({ childId: c.id, firstName: c.first_name, name: [c.first_name, c.last_name].filter(Boolean).join(' ') }))
    .sort((a, b) => a.name.localeCompare(b.name))
  return {
    classId,
    className: cls.name,
    joinCode: cls.joinCode,
    requestId,
    status: req.status as JoinRequestView['status'],
    name: req.requested_name,
    askedAt: clock(req.created_at),
    candidates: people.map(({ childId, name }) => ({ childId, name })),
    match: likelyMatch(req.requested_name, people),
  }
}
